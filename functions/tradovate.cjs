'use strict';
/* Tradovate (NinjaTrader) — read-only sync over OAuth.
 *
 * Needs partner credentials from the NinjaTrader Ecosystem (TRADOVATE_CLIENT_ID / _SECRET). Until
 * they exist the endpoint answers { configured:false } and the web app shows nothing.
 *
 * Connect: the web app asks for an authorize URL (state = HMAC-signed uid + expiry), the trader
 * approves on trader.tradovate.com, Tradovate redirects back to this function with ?code&state,
 * we exchange the code (form body, Basic client auth), keep the access token encrypted at
 * tradovateLinks/{uid} (server-only) and pull fills right away.
 * Sync: tokens live ~80 minutes, so the scheduler renews them every 30 minutes; a lapsed token
 * marks the link needsReauth and the trader reconnects with one click.
 * Fills → users/{uid}/syncFills (source "tradovate"), deduplicated by fill id like the add-ons.
 */
const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');
const { seal, open } = require('./gmail.cjs');
const { normalizeFill } = require('./sync.cjs');

const HOSTS = {
  live: { auth: 'https://trader.tradovate.com/oauth', api: 'https://live.tradovateapi.com' },
  demo: { auth: 'https://trader.tradovate.com/oauth', api: 'https://demo.tradovateapi.com' },
};
const ACTIONS = new Set(['status', 'start', 'sync', 'disconnect']);
const STATE_TTL = 10 * 60e3, MIN_GAP_MS = 2 * 60e3, RENEW_BEFORE = 30 * 60e3;

class TvError extends Error { constructor(code, message) { super(message || code); this.code = code; } }

function config(env) {
  const e = env || {};
  const mode = e.TRADOVATE_ENV === 'demo' ? 'demo' : 'live';
  return {
    clientId: e.TRADOVATE_CLIENT_ID || '', clientSecret: e.TRADOVATE_CLIENT_SECRET || '', tokenKey: e.SYNC_TOKEN_KEY || '',
    mode, ...HOSTS[mode],
    redirectUri: e.TRADOVATE_REDIRECT_URI || 'https://us-central1-fayna-trading.cloudfunctions.net/tradovateAuth',
    appUrl: e.FAYNA_APP_URL || 'https://dorfeina123-hash.github.io/fayna-trading/',
  };
}
const configured = c => !!(c.clientId && c.clientSecret && c.tokenKey);

/* state: uid.expiry.nonce.signature — proves the callback belongs to the user who started it */
function signState(uid, key, now) {
  const body = `${Buffer.from(uid).toString('base64url')}.${now + STATE_TTL}.${randomBytes(8).toString('hex')}`;
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}
function readState(state, key, now) {
  const parts = String(state || '').split('.');
  if (parts.length !== 4) return null;
  const body = parts.slice(0, 3).join('.'), want = createHmac('sha256', key).update(body).digest();
  let got; try { got = Buffer.from(parts[3], 'base64url'); } catch (e) { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  if (!(Number(parts[1]) > now)) return null;
  return Buffer.from(parts[0], 'base64url').toString();
}
function authorizeUrl(cfg, state) {
  const q = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: cfg.redirectUri, state });
  return `${cfg.auth}?${q}`;
}

async function exchange(fetcher, cfg, code) {
  const r = await fetcher(`${cfg.api}/auth/oauthtoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new TvError('exchange_failed', j.error_description || j.error || `oauthtoken ${r.status}`);
  return { token: j.access_token, expiresAt: Date.now() + (Number(j.expires_in) || 4800) * 1000 };
}

async function api(fetcher, cfg, token, path) {
  const r = await fetcher(`${cfg.api}/v1/${path}`, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (r.status === 401) throw new TvError('unauthorized', 'token rejected');
  if (!r.ok) throw new TvError('api_' + r.status, `${path}: ${r.status}`);
  return r.json();
}
async function renew(fetcher, cfg, token) {
  const j = await api(fetcher, cfg, token, 'auth/renewAccessToken');
  if (!j?.accessToken) throw new TvError('renew_failed', j?.errorText || 'renew failed');
  return { token: j.accessToken, expiresAt: Date.parse(j.expirationTime) || Date.now() + 80 * 60e3 };
}
const chunks = (ids, n = 100) => { const out = []; for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n)); return out; };
async function items(fetcher, cfg, token, entity, ids) {
  const out = new Map();
  for (const c of chunks([...new Set(ids)].filter(x => x != null))) {
    const list = await api(fetcher, cfg, token, `${entity}/items?ids=${c.join(',')}`);
    (Array.isArray(list) ? list : []).forEach(x => out.set(x.id, x));
  }
  return out;
}

/* Tradovate fill → the raw shape sync.normalizeFill expects */
function toRaw(f, { orders, accounts, contracts, fees }) {
  const order = orders.get(f.orderId), acct = order && accounts.get(order.accountId), contract = contracts.get(f.contractId);
  const fee = fees.get(f.id);
  const commission = fee ? ['commission', 'clearingFee', 'exchangeFee', 'nfaFee', 'brokerageFee', 'ipFee', 'orderRoutingFee'].reduce((s, k) => s + (Number(fee[k]) || 0), 0) : undefined;
  return {
    id: String(f.id), orderId: String(f.orderId ?? ''), account: acct?.name || (order ? String(order.accountId) : ''),
    symbol: contract?.name || '', side: String(f.action || '').toLowerCase(), qty: f.qty, price: f.price,
    time: f.timestamp, commission,
  };
}

async function pullFills(fetcher, cfg, token) {
  const fills = (await api(fetcher, cfg, token, 'fill/list')).filter(f => f && f.active !== false);
  if (!fills.length) return { raw: [], accounts: [] };
  const [orders, contracts, fees, accountList] = await Promise.all([
    items(fetcher, cfg, token, 'order', fills.map(f => f.orderId)),
    items(fetcher, cfg, token, 'contract', fills.map(f => f.contractId)),
    items(fetcher, cfg, token, 'fillFee', fills.map(f => f.id)).catch(() => new Map()),
    api(fetcher, cfg, token, 'account/list'),
  ]);
  const accounts = new Map((accountList || []).map(a => [a.id, a]));
  return { raw: fills.map(f => toRaw(f, { orders, accounts, contracts, fees })), accounts: [...accounts.values()].map(a => a.name) };
}

/* one user: renew if close to expiry, pull, store */
async function syncUser(uid, link, deps, now) {
  const { cfg, fetch: fetcher, store, fillStore } = deps;
  let tok = JSON.parse(open(link.box, cfg.tokenKey));
  if (tok.expiresAt - now < RENEW_BEFORE) {
    try { tok = await renew(fetcher, cfg, tok.token); }
    catch (e) {
      if (tok.expiresAt <= now) { await store.update(uid, { needsReauth: true, lastError: 'expired', lastErrorAt: now }); throw new TvError('reauth', 'החיבור ל-Tradovate פג. צריך להתחבר מחדש'); }
    }
    await store.update(uid, { box: seal(JSON.stringify(tok), cfg.tokenKey), needsReauth: false });
  }
  const { raw, accounts } = await pullFills(fetcher, cfg, tok.token);
  const ok = [], seen = new Set(); let rejected = 0;
  raw.forEach(r => { const n = normalizeFill(r, 'tradovate'); if (n.error) rejected++; else if (!seen.has(n.docId)) { seen.add(n.docId); ok.push(n); } });
  const stored = ok.length ? await fillStore.writeFills(uid, ok, now) : 0;
  await store.update(uid, { lastSync: now, lastStored: stored, lastFound: ok.length, accounts, lastError: null });
  return { found: ok.length, stored, rejected };
}

/* POST actions from the web app (Bearer Firebase ID token) */
async function handleAction({ method, headers, body }, deps) {
  if (method !== 'POST') return { status: 405, body: { error: 'method' } };
  const { cfg, now } = deps;
  if (!configured(cfg)) return { status: 200, body: { configured: false } };
  const m = /^Bearer\s+(.+)$/.exec(String(headers.authorization || headers.Authorization || ''));
  let uid = null; try { if (m) uid = (await deps.verifyIdToken(m[1])).uid; } catch (e) { uid = null; }
  if (!uid) return { status: 401, body: { error: 'auth', message: 'צריך להיות מחובר' } };
  const action = String(body?.action || '');
  if (!ACTIONS.has(action)) return { status: 400, body: { error: 'action' } };
  const link = await deps.store.get(uid);
  const pub = l => l ? { connected: true, needsReauth: !!l.needsReauth, lastSync: l.lastSync || null, lastStored: l.lastStored || 0, accounts: l.accounts || [], lastError: l.lastError || null } : { connected: false };
  if (action === 'status') return { status: 200, body: { configured: true, ...pub(link) } };
  if (action === 'start') return { status: 200, body: { url: authorizeUrl(cfg, signState(uid, cfg.tokenKey, now)) } };
  if (action === 'disconnect') { await deps.store.remove(uid); return { status: 200, body: { configured: true, connected: false } }; }
  if (!link) return { status: 400, body: { error: 'not_connected', message: 'Tradovate לא מחובר' } };
  if (link.lastSync && now - link.lastSync < MIN_GAP_MS) return { status: 200, body: { configured: true, ...pub(link), skipped: 'recent' } };
  try {
    const result = await syncUser(uid, link, deps, now);
    return { status: 200, body: { configured: true, ...pub(await deps.store.get(uid)), result } };
  } catch (e) {
    return { status: e.code === 'reauth' ? 409 : 502, body: { error: e.code || 'sync', message: e.code === 'reauth' ? e.message : 'Tradovate לא ענו כרגע. ננסה שוב בסנכרון הבא.' } };
  }
}

/* GET ?code&state — Tradovate redirects the trader's browser here after approval */
async function handleCallback(query, deps) {
  const { cfg, now } = deps, back = cfg.appUrl.replace(/[?#].*$/, '');
  if (!configured(cfg)) return `${back}?tradovate=unavailable`;
  const uid = readState(query.state, cfg.tokenKey, now);
  if (!uid || !query.code) return `${back}?tradovate=failed`;
  try {
    const tok = await exchange(deps.fetch, cfg, String(query.code));
    const link = { box: seal(JSON.stringify(tok), cfg.tokenKey), connectedAt: now, needsReauth: false };
    await deps.store.set(uid, link);
    try { await syncUser(uid, link, deps, now); } catch (e) { /* first pull failing is fine; the scheduler retries */ }
    return `${back}?tradovate=connected`;
  } catch (e) { return `${back}?tradovate=failed`; }
}

function firestoreLinkStore(db) {
  const ref = uid => db.doc(`tradovateLinks/${uid}`);
  return {
    async get(uid) { const s = await ref(uid).get(); return s.exists ? s.data() : null; },
    async set(uid, v) { await ref(uid).set(v); },
    async update(uid, v) { await ref(uid).set(v, { merge: true }); },
    async remove(uid) { await ref(uid).delete(); },
    async all() { const q = await db.collection('tradovateLinks').get(); return q.docs.map(d => ({ uid: d.id, ...d.data() })); },
  };
}

module.exports = { config, configured, signState, readState, authorizeUrl, exchange, renew, pullFills, toRaw, syncUser, handleAction, handleCallback, firestoreLinkStore, TvError };
