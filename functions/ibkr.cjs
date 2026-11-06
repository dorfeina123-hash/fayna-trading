'use strict';
/* Interactive Brokers — read-only sync through the Flex Web Service.
 *
 * The trader creates, once, in IBKR Client Portal:
 *   - a Flex Web Service token (Settings → Account Settings → Reporting → Flex Web Service)
 *   - a Flex Query with the Trades section (Activity Flex Query) or Trade Confirmations,
 *     XML format, and copies its Query ID.
 * They paste both into Fayna. The token is stored encrypted at ibkrLinks/{uid}
 * (server-only). IBKR credentials are never involved, and the token can only read reports.
 *
 * Each sync: SendRequest(token, queryId) → reference code → GetStatement (retry while
 * "statement generation in progress") → parse <Trade>/<TradeConfirm> executions →
 * users/{uid}/syncFills (source "ibkr"), deduplicated by execution id like the add-ons.
 */
const { seal, open } = require('./gmail.cjs');
const { normalizeFill } = require('./sync.cjs');

const BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';
const UA = 'FaynaTrading/1.0';
const MIN_GAP_MS = 2 * 60e3;          /* per user, between syncs */
const ACTIONS = new Set(['status', 'connect', 'sync', 'disconnect']);

/* ── XML (Flex output is flat, attribute-only rows) ── */
const unesc = s => String(s).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attrs(tag) {
  const out = {}; const rx = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g; let m;
  while ((m = rx.exec(tag))) out[m[1]] = unesc(m[2]);
  return out;
}
function rows(xml, names) {
  const rx = new RegExp(`<(${names.join('|')})\\b([^>]*?)\\/?>`, 'g'); const out = []; let m;
  while ((m = rx.exec(String(xml)))) out.push({ _tag: m[1], ...attrs(m[2]) });
  return out;
}
const tagText = (xml, name) => { const m = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(String(xml)); return m ? unesc(m[1].trim()) : ''; };

function parseFlexResponse(xml) {
  return { status: tagText(xml, 'Status'), ref: tagText(xml, 'ReferenceCode'), code: tagText(xml, 'ErrorCode'), msg: tagText(xml, 'ErrorMessage') };
}

/* "20261105;143012" | "2026-11-05;14:30:12" | "2026-11-05, 14:30:12" | "20261105 143012" | "20261105" */
function parseLocal(s) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:[;,\sT]+(\d{2}):?(\d{2}):?(\d{2})?)?/.exec(String(s || '').trim());
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
}
/* wall-clock time in an IANA zone → epoch ms */
function zonedToUtc(p, tz) {
  const guess = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  const off = at => {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const q = Object.fromEntries(f.formatToParts(new Date(at)).map(x => [x.type, x.value]));
    return Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second) - at;
  };
  let t = guess - off(guess); t = guess - off(t);
  return t;
}

/* one Flex execution row → the raw fill shape sync.cjs normalizes */
function rowToFill(r, tz) {
  if (r.levelOfDetail && !/EXECUTION/i.test(r.levelOfDetail)) return null;      /* skip ORDER / SYMBOL_SUMMARY rollups */
  const side = String(r.buySell || '').toUpperCase();
  if (!/^(BUY|SELL)$/.test(side)) return null;                                   /* "BUY (Ca.)" = cancelled */
  const when = parseLocal(r.dateTime || r.tradeDate);
  if (!when) return null;
  const id = r.ibExecID || r.execID || r.tradeID || r.transactionID;
  const sym = String(r.symbol || r.underlyingSymbol || '').replace(/\s+/g, '');
  return {
    id, account: r.accountId || r.acctAlias, symbol: sym, side: side.toLowerCase(),
    qty: Math.abs(parseFloat(r.quantity)), price: parseFloat(r.tradePrice || r.price),
    time: new Date(zonedToUtc(when, tz || 'America/New_York')).toISOString(),
    commission: r.ibCommission != null && r.ibCommission !== '' ? Math.abs(parseFloat(r.ibCommission)) : undefined,
    orderId: r.ibOrderID || r.orderID || undefined, exchange: r.exchange || undefined,
  };
}

function parseStatement(xml, tz) {
  const fills = [], skipped = [];
  rows(xml, ['Trade', 'TradeConfirm']).forEach(r => {
    const f = rowToFill(r, tz);
    if (!f) { skipped.push('row'); return; }
    const n = normalizeFill(f, 'ibkr');
    if (n.error) skipped.push(n.error); else fills.push(n);
  });
  const accounts = [...new Set(rows(xml, ['FlexStatement']).map(s => s.accountId).filter(Boolean))];
  return { fills, skipped, accounts };
}

async function fetchStatement(token, queryId, deps) {
  const get = async url => { const r = await deps.fetch(url, { headers: { 'User-Agent': UA } }); return r.text(); };
  const sent = parseFlexResponse(await get(`${BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`));
  if (sent.status !== 'Success' || !sent.ref) { const e = new Error('flex_' + (sent.code || 'send')); e.code = sent.code; e.detail = sent.msg; throw e; }
  for (let i = 0; i < 8; i++) {
    await deps.sleep(i ? 4000 : 2500);
    const body = await get(`${BASE}/GetStatement?t=${encodeURIComponent(token)}&q=${encodeURIComponent(sent.ref)}&v=3`);
    if (/<FlexQueryResponse|<FlexStatements/.test(body)) return body;
    const r = parseFlexResponse(body);
    if (r.code === '1019' || r.code === '1018') continue;                         /* still generating / too soon */
    const e = new Error('flex_' + (r.code || 'get')); e.code = r.code; e.detail = r.msg; throw e;
  }
  const e = new Error('flex_timeout'); e.code = 'timeout'; throw e;
}

async function syncUser(uid, link, deps, now) {
  const token = open(link.box, deps.cfg.tokenKey);
  const xml = await fetchStatement(token, link.queryId, deps);
  const { fills, skipped, accounts } = parseStatement(xml, link.tz);
  const stored = fills.length ? await deps.fillStore.writeFills(uid, fills.map(f => ({ fill: f.fill, docId: f.docId })), now) : 0;
  await deps.store.update(uid, { lastSync: now, lastFound: fills.length, lastStored: stored, lastError: null, accounts });
  return { found: fills.length, stored, skipped: skipped.length, accounts };
}

const ERR_HE = {
  '1003': 'השאילתה עדיין לא זמינה. נסה שוב בעוד כמה דקות.',
  '1012': 'קוד הגישה פג תוקף. צור קוד חדש ב-IBKR והדבק אותו שוב.',
  '1015': 'קוד הגישה לא תקין. בדוק שהעתקת אותו במלואו.',
  '1014': 'מספר השאילתה לא תקין. בדוק את ה-Query ID.',
  '1020': 'מספר השאילתה לא תקין. בדוק את ה-Query ID.',
  '1018': 'יותר מדי בקשות ל-IBKR. נסה שוב בעוד דקה.',
  timeout: 'IBKR לא סיימו להכין את הדוח בזמן. נסה שוב בעוד דקה.',
};

/* deps = { verifyIdToken, store: {get,set,update,del}, fillStore, fetch, sleep, cfg: {tokenKey}, now } */
async function handleIbkr({ method, headers, body }, deps) {
  if (method !== 'POST') return { status: 405, body: { error: 'method' } };
  const action = String(body?.action || '');
  if (!ACTIONS.has(action)) return { status: 400, body: { error: 'action' } };
  if (!deps.cfg?.tokenKey) return { status: 503, body: { error: 'not_configured' } };
  const m = /^Bearer\s+(.+)$/.exec(String(headers.authorization || headers.Authorization || ''));
  if (!m) return { status: 401, body: { error: 'unauthenticated' } };
  let uid; try { uid = (await deps.verifyIdToken(m[1])).uid; } catch (e) { return { status: 401, body: { error: 'unauthenticated' } }; }
  if (!uid) return { status: 401, body: { error: 'unauthenticated' } };
  const now = deps.now;
  const link = await deps.store.get(uid);
  const pub = l => l ? { connected: true, queryId: l.queryId, tz: l.tz, lastSync: l.lastSync || 0, lastStored: l.lastStored || 0, lastFound: l.lastFound || 0, lastError: l.lastError || null, accounts: l.accounts || [] } : { connected: false };

  if (action === 'status') return { status: 200, body: pub(link) };
  if (action === 'disconnect') { if (link) await deps.store.del(uid); return { status: 200, body: { connected: false } }; }

  if (action === 'connect') {
    const token = String(body.token || '').trim(), queryId = String(body.queryId || '').trim();
    const tz = String(body.tz || 'America/New_York');
    if (!/^\d{10,40}$/.test(token)) return { status: 400, body: { error: 'token', message: 'קוד הגישה צריך להיות מספר ארוך, כמו שמופיע ב-IBKR.' } };
    if (!/^\d{3,12}$/.test(queryId)) return { status: 400, body: { error: 'query', message: 'מספר השאילתה (Query ID) צריך להכיל ספרות בלבד.' } };
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch (e) { return { status: 400, body: { error: 'tz' } }; }
    const fresh = { box: seal(token, deps.cfg.tokenKey), queryId, tz, connectedAt: now };
    try {
      await deps.store.set(uid, fresh);
      const r = await syncUser(uid, fresh, deps, now);
      return { status: 200, body: { ...pub({ ...fresh, lastSync: now, lastStored: r.stored, lastFound: r.found, accounts: r.accounts }), result: r } };
    } catch (e) {
      await deps.store.del(uid);
      return { status: 400, body: { error: e.message, message: ERR_HE[e.code] || 'החיבור ל-IBKR נכשל. בדוק את קוד הגישה ואת מספר השאילתה.' } };
    }
  }

  /* sync */
  if (!link) return { status: 404, body: { error: 'not_connected' } };
  if (link.lastSync && now - link.lastSync < MIN_GAP_MS) return { status: 200, body: { ...pub(link), skipped: 'recent' } };
  try {
    const r = await syncUser(uid, link, deps, now);
    return { status: 200, body: { ...pub({ ...link, lastSync: now, lastStored: r.stored, lastFound: r.found, accounts: r.accounts }), result: r } };
  } catch (e) {
    await deps.store.update(uid, { lastError: e.code || e.message, lastErrorAt: now });
    return { status: 502, body: { error: e.message, message: ERR_HE[e.code] || 'הסנכרון עם IBKR נכשל. נסה שוב בעוד כמה דקות.' } };
  }
}

function firestoreLinkStore(db) {
  const ref = uid => db.doc(`ibkrLinks/${uid}`);
  return {
    async get(uid) { const s = await ref(uid).get(); return s.exists ? s.data() : null; },
    async set(uid, v) { await ref(uid).set(v); },
    async update(uid, v) { await ref(uid).set(v, { merge: true }); },
    async del(uid) { await ref(uid).delete(); },
    async all() { const q = await db.collection('ibkrLinks').get(); return q.docs.map(d => ({ uid: d.id, ...d.data() })); },
  };
}

module.exports = { handleIbkr, parseStatement, parseFlexResponse, rowToFill, zonedToUtc, parseLocal, fetchStatement, syncUser, firestoreLinkStore, MIN_GAP_MS };
