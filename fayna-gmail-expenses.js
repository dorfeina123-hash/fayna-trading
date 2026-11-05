/* v112 — trading expenses from Gmail.
 *
 * The user connects Google (read-only Gmail), the browser searches receipts from
 * prop firms, platforms and data vendors, pulls the charged amount from each one
 * and offers them as expense-log records (records[]), which also feed "ניהול עסקי".
 *
 * Privacy: everything runs in the user's browser. The Google access token lives in
 * memory only (about an hour), no mail content is sent to any Fayna server, and only
 * the resulting expense rows (date, company, amount, subject) are saved.
 *
 * Google setup (once, in the fayna-trading Google Cloud project): enable the Gmail
 * API and add the gmail.readonly scope to the OAuth consent screen. Until Google
 * verifies the app, only test users listed there can connect, so the feature is
 * shown to the admin only (OPEN_TO_ALL).
 */
(function (root) {
  'use strict';

  /* ───────────── pure parsing (also used by tests in Node) ───────────── */

  const VENDORS = [
    { name: 'Apex Trader Funding', dom: ['apextraderfunding.com'], kw: ['apex trader funding', 'apextraderfunding'] },
    { name: 'Bulenox', dom: ['bulenox.com'], kw: ['bulenox'] },
    { name: 'Lucid Trading', dom: ['lucidtrading.com'], kw: ['lucid trading', 'lucidtrading'] },
    { name: 'MFFU', dom: ['myfundedfutures.com'], kw: ['my funded futures', 'myfundedfutures', 'mffu'] },
    { name: 'TakeProfit Trader', dom: ['takeprofittrader.com'], kw: ['take profit trader', 'takeprofittrader', 'takeprofit trader'] },
    { name: 'Topstep', dom: ['topstep.com', 'topsteptrader.com'], kw: ['topstep'] },
    { name: 'Tradeify', dom: ['tradeify.co'], kw: ['tradeify'] },
    { name: 'Earn2Trade', dom: ['earn2trade.com'], kw: ['earn2trade'] },
    { name: 'Alpha Futures', dom: ['alpha-futures.com', 'alphafutures.io'], kw: ['alpha futures'] },
    { name: 'FundedNext', dom: ['fundednext.com'], kw: ['fundednext', 'funded next'] },
    { name: 'Elite Trader Funding', dom: ['elitetraderfunding.com'], kw: ['elite trader funding'] },
    { name: 'Tradovate', dom: ['tradovate.com'], kw: ['tradovate'], cat: 'כלי' },
    { name: 'Rithmic', dom: ['rithmic.com'], kw: ['rithmic'], cat: 'כלי' },
    { name: 'NinjaTrader', dom: ['ninjatrader.com'], kw: ['ninjatrader'], cat: 'כלי' },
    { name: 'TradingView', dom: ['tradingview.com'], kw: ['tradingview'], cat: 'כלי' },
    { name: 'ATAS', dom: ['atas.net'], kw: ['atas platform', 'orderflowtrading'], cat: 'כלי' },
    { name: 'Quantower', dom: ['quantower.com'], kw: ['quantower'], cat: 'כלי' },
    { name: 'Sierra Chart', dom: ['sierrachart.com'], kw: ['sierra chart'], cat: 'כלי' },
    { name: 'Bookmap', dom: ['bookmap.com'], kw: ['bookmap'], cat: 'כלי' },
    { name: 'Tradezella', dom: ['tradezella.com'], kw: ['tradezella'], cat: 'כלי' },
  ];
  /* payment processors that send receipts on behalf of a vendor */
  const PROCESSORS = ['stripe.com', 'whop.com', 'paddle.com', 'fastspring.com', '2checkout.com', 'paypal.com', 'paypal.co.il', 'lemonsqueezy.com', 'chargebee.com', 'recurly.com', 'shopify.com', 'gumroad.com'];

  const RECEIPT_RX = /receipt|invoice|payment (?:received|confirm|success|complete)|your payment|order (?:confirm|#|number|receipt|complete)|purchase|thank(?:s| you) for (?:your )?(?:order|purchase|payment)|you(?:'ve| have)? paid|charged|renewal|subscription (?:confirm|renew)|קבלה|חשבונית|אישור תשלום|אישור הזמנה|תודה על הרכישה/i;
  const SKIP_RX = /payout|withdraw|refund(?!able)|payment (?:failed|declined|unsuccessful)|failed payment|card (?:was )?declined|upcoming (?:payment|renewal)|will (?:be )?(?:charged|renew)|trial (?:ends|ending)|abandon|left in your cart|reset your password|verify your|zahlung fehlgeschlagen|החזר כספי|משיכה/i;
  const PROMO_RX = /\d+\s?% ?off|% הנחה|\bsale\b|discount|coupon|promo|black friday|cyber monday|deal\b|last chance|limited time|flash|giveaway|webinar|newsletter/i;

  const TOTAL_LABELS = [
    'amount paid', 'total paid', 'amount charged', 'total charged', 'payment amount', 'paid amount',
    'grand total', 'order total', 'total due', 'total amount', 'invoice total', 'total',
    'סה"כ לתשלום', 'סה״כ לתשלום', 'סה"כ', 'סה״כ', 'סכום ששולם', 'סכום', 'amount',
  ];
  const CUR = '(US\\$|\\$|USD|₪|ILS|NIS|€|EUR)';
  const NUM = '(-?\\d{1,3}(?:[,.\\s]\\d{3})*(?:[.,]\\d{1,2})?|-?\\d+(?:[.,]\\d{1,2})?)';
  const AMT_RX = new RegExp(`${CUR}\\s?${NUM}|${NUM}\\s?${CUR}`, 'g');

  function parseNum(s) {
    s = String(s).replace(/\s/g, '');
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (ld > -1 && /\.\d{3}$/.test(s) && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }
  function curCode(c) {
    c = String(c || '').toUpperCase();
    if (c === '₪' || c === 'ILS' || c === 'NIS') return 'ILS';
    if (c === '€' || c === 'EUR') return 'EUR';
    return 'USD';
  }
  function amountsIn(text) {
    const out = []; let m; AMT_RX.lastIndex = 0;
    while ((m = AMT_RX.exec(text))) {
      const cur = m[1] || m[4], num = m[2] || m[3];
      const v = parseNum(num);
      if (Number.isFinite(v)) out.push({ value: v, currency: curCode(cur), at: m.index });
    }
    return out;
  }

  /* The charged amount: the highest-priority "total" label followed closely by an
     amount wins; otherwise a single distinct amount in the mail; otherwise unsure. */
  function extractAmount(text) {
    const t = String(text || '').replace(/ /g, ' ');
    const low = t.toLowerCase();
    for (const label of TOTAL_LABELS) {
      let idx = -1, best = null;
      while ((idx = low.indexOf(label, idx + 1)) > -1) {
        if (label === 'total' && /sub\s?$/.test(low.slice(Math.max(0, idx - 4), idx))) continue;
        if (label === 'amount' && /discount\s?$/.test(low.slice(Math.max(0, idx - 9), idx))) continue;
        const win = t.slice(idx + label.length, idx + label.length + 48);
        const a = amountsIn(win)[0];
        if (a && a.value > 0) best = a; /* last occurrence: totals sit at the bottom */
      }
      if (best) return { ...best, sure: true, via: label };
    }
    const all = amountsIn(t).filter(a => a.value > 0);
    const distinct = [...new Map(all.map(a => [a.currency + a.value.toFixed(2), a])).values()];
    if (distinct.length === 1) return { ...distinct[0], sure: true, via: 'single' };
    if (distinct.length) return { ...distinct.reduce((x, y) => (y.value > x.value ? y : x)), sure: false, via: 'max' };
    return null;
  }

  function domainOf(from) {
    const m = /@([a-z0-9.-]+)/i.exec(String(from || ''));
    return m ? m[1].toLowerCase() : '';
  }
  const domMatch = (d, list) => list.some(x => d === x || d.endsWith('.' + x));

  function findVendor(from, subject, body) {
    const d = domainOf(from);
    const direct = VENDORS.find(v => domMatch(d, v.dom));
    if (direct) return direct;
    const head = (String(from) + ' ' + String(subject)).toLowerCase();
    const byHead = VENDORS.find(v => v.kw.some(k => head.includes(k)));
    if (byHead && (domMatch(d, PROCESSORS) || RECEIPT_RX.test(subject))) return byHead;
    if (domMatch(d, PROCESSORS)) {
      const b = String(body || '').toLowerCase().slice(0, 4000);
      return VENDORS.find(v => v.kw.some(k => b.includes(k)) || v.dom.some(x => b.includes(x))) || null;
    }
    return null;
  }

  function category(vendor, subject, body) {
    const t = (String(subject) + ' ' + String(body).slice(0, 1500)).toLowerCase();
    if (/\breset\b|ריסט|איפוס/.test(t)) return 'ריסט';
    if (/course|mentorship|coaching|bootcamp|academy|קורס|ליווי/.test(t)) return 'קורס';
    if (vendor && vendor.cat) return vendor.cat;
    if (/activation|activate|funded account fee|\bpa\b|performance account|live account|express funded|funded fee|הפעלה/.test(t)) return 'לייב';
    if (/data fee|market data|cme |platform fee|license|data subscription/.test(t)) return 'כלי';
    return 'מבחן';
  }

  /* One Gmail message (already decoded) → { ok, reason, item }. */
  function classify(msg) {
    const subject = String(msg.subject || ''), from = String(msg.from || ''), body = String(msg.body || '');
    const vendor = findVendor(from, subject, body);
    if (!vendor) return { ok: false, reason: 'vendor' };
    const head = subject + ' ' + body.slice(0, 600);
    if (SKIP_RX.test(subject) || SKIP_RX.test(body.slice(0, 400))) return { ok: false, reason: 'skip' };
    const receiptish = RECEIPT_RX.test(subject) || RECEIPT_RX.test(body.slice(0, 2500));
    if (!receiptish) return { ok: false, reason: 'not_receipt' };
    if (PROMO_RX.test(subject) && !RECEIPT_RX.test(subject)) return { ok: false, reason: 'promo' };
    const amt = extractAmount(subject + '\n' + body);
    if (!amt) return { ok: false, reason: 'amount' };
    if (amt.value <= 0 || amt.value > 50000) return { ok: false, reason: 'amount' };
    return {
      ok: true,
      item: {
        gmailId: String(msg.id || ''),
        date: msg.date,
        company: vendor.name,
        cat: category(vendor, subject, head + ' ' + body),
        amount: Math.round(amt.value * 100) / 100,
        currency: amt.currency,
        sure: amt.sure,
        subject: subject.slice(0, 120),
        sender: domainOf(from),
      },
    };
  }

  /* Gmail payload → plain text */
  function b64url(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    try {
      const bin = (typeof atob === 'function') ? atob(s) : Buffer.from(s, 'base64').toString('binary');
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) { return ''; }
  }
  function htmlToText(h) {
    return String(h)
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#36;|&dollar;/gi, '$').replace(/&#8362;/g, '₪')
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
  }
  function payloadText(p) {
    let plain = '', html = '';
    (function walk(x) {
      if (!x) return;
      const mt = String(x.mimeType || '');
      if (x.body && x.body.data) {
        if (mt === 'text/plain' && !plain) plain = b64url(x.body.data);
        else if (mt === 'text/html' && !html) html = b64url(x.body.data);
      }
      (x.parts || []).forEach(walk);
    })(p);
    /* html keeps table rows ("Total  $150.00") together better than many plain versions */
    return html ? htmlToText(html) : plain;
  }
  function decodeMessage(m) {
    const hs = (m.payload && m.payload.headers) || [];
    const h = n => (hs.find(x => String(x.name).toLowerCase() === n) || {}).value || '';
    const d = new Date(Number(m.internalDate) || Date.parse(h('date')) || Date.now());
    const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { id: m.id, from: h('from'), subject: h('subject'), date, body: payloadText(m.payload) };
  }

  function gmailQueries(afterSec) {
    const doms = [...new Set(VENDORS.flatMap(v => v.dom))];
    return [
      `from:(${doms.join(' OR ')}) after:${afterSec}`,
      `from:(${PROCESSORS.join(' OR ')}) after:${afterSec}`,
    ];
  }

  /* Split classified items into: new and certain (added on their own), to review, and
     already known. Two mails count as one purchase only when the amount matches to the
     cent, the dates are at most 2 days apart AND they came from different senders (the
     vendor's own confirmation next to the Stripe/PayPal receipt). Two receipts from the
     same sender are two purchases: buying two $167 evaluations the same day is common.
     An expense already in the log (typed by hand) absorbs exactly one matching mail. */
  function dedupe(items, existing, seen, toUsd) {
    const day = d => Date.parse(d) / 864e5;
    const same = (a, b) => Math.abs(a.usd - b.usd) < 0.01 && Math.abs(day(a.date) - day(b.date)) <= 2;
    const known = (existing || []).filter(r => r && r.type !== 'הכנסה' && r.type !== 'משיכה')
      .map(r => ({ usd: +r.amount || 0, date: r.date, gmailId: r.gmailId, used: !!r.gmailId }));
    const ids = new Set([...(seen || []), ...known.map(k => k.gmailId).filter(Boolean)]);
    const out = { auto: [], review: [], dup: [], skipped: [] };
    const kept = [];
    items.slice().sort((a, b) => a.date.localeCompare(b.date) || (b.sure - a.sure)).forEach(it => {
      if (!it.gmailId || ids.has(it.gmailId)) { out.skipped.push(it); return; }
      ids.add(it.gmailId);
      const x = { ...it, usd: toUsd(it) };
      const k = known.find(k => !k.used && same(k, x));
      if (k) { k.used = true; out.dup.push(x); return; }
      const twin = kept.find(o => !o.paired && same(o, x) && o.sender && x.sender && o.sender !== x.sender);
      if (twin) { twin.paired = true; out.review.push({ ...x, maybeDup: true }); return; }
      kept.push(x);
      (x.sure && x.currency !== 'EUR' ? out.auto : out.review).push(x);
    });
    const byDate = (a, b) => b.date.localeCompare(a.date);
    out.auto.sort(byDate); out.review.sort(byDate); out.dup.sort(byDate);
    out.auto.forEach(x => delete x.paired);
    return out;
  }

  const core = { VENDORS, extractAmount, findVendor, category, classify, decodeMessage, htmlToText, parseNum, gmailQueries, dedupe };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;


  /* ───────────── browser side ───────────── */

  const OPEN_TO_ALL = false; /* switch to true after Google verifies the gmail.readonly scope */
  const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const AUTH_URL = 'https://us-central1-fayna-trading.cloudfunctions.net/gmailAuth';
  const AUTO_EVERY = 5 * 60e3; /* a reload within 5 minutes does not re-scan */
  const visible = () => OPEN_TO_ALL || (typeof currentUser !== 'undefined' && currentUser?.isAdmin === true);
  const esc = v => (typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, k) => { try { showToast(m, k); } catch (e) {} };
  const uid = () => (typeof currentUser !== 'undefined' && currentUser?.uid) || '';
  const LS = k => `fayna_gmx_${k}_${uid() || 'anon'}`;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(LS(k)); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch (e) {} };
  const recs = () => (typeof records !== 'undefined' && Array.isArray(records) ? records : []);
  const cloudReady = () => { try { return !!uid() && _cloudReadyUid === uid(); } catch (e) { return false; } };

  let token = null, tokenExp = 0, busy = false, serverCfg = null, autoDoneFor = '', pending = [];

  /* ── server: long-lived permission so sync runs on every login without a popup ── */
  async function server(action, extra = {}) {
    const u = root.firebase?.auth?.().currentUser; if (!u) throw new Error('signed_out');
    const r = await fetch(AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await u.getIdToken() }, body: JSON.stringify({ action, ...extra }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'http_' + r.status); e.status = r.status; throw e; }
    return j;
  }
  async function config() {
    if (serverCfg) return serverCfg;
    try { serverCfg = await server('config'); } catch (e) { serverCfg = { offline: true }; }
    return serverCfg;
  }
  function loadGis() {
    if (root.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('gis_load')); document.head.appendChild(s);
    });
  }
  /* one popup, once: Google returns a one-time code the server swaps for a lasting permission */
  async function connectServer(cfg) {
    await loadGis();
    const code = await new Promise((res, rej) => {
      root.google.accounts.oauth2.initCodeClient({
        client_id: cfg.clientId, scope: SCOPE, ux_mode: 'popup',
        hint: (typeof currentUser !== 'undefined' && currentUser?.email) || undefined,
        callback: r => (r.error ? rej(new Error(r.error)) : res(r.code)),
        error_callback: e => rej(new Error(e?.type === 'popup_closed' ? 'popup-closed-by-user' : e?.type || 'popup')),
      }).requestCode();
    });
    const j = await server('connect', { code });
    serverCfg = { ...cfg, connected: true };
    token = j.accessToken; tokenExp = Date.now() + (j.expiresIn || 3600) * 1000;
  }
  async function silentToken() {
    const j = await server('token');
    token = j.accessToken; tokenExp = Date.now() + (j.expiresIn || 3600) * 1000;
  }

  /* ── fallback before the server is deployed: Firebase's Google popup, every time ── */
  function gauth() {
    const fb = root.firebase;
    let app = (fb.apps || []).find(x => x.name === 'fayna-gmail');
    if (!app) app = fb.initializeApp(fb.app().options, 'fayna-gmail');
    return app.auth();
  }
  async function popupToken() {
    const a = gauth();
    try { await a.setPersistence(root.firebase.auth.Auth.Persistence.NONE); } catch (e) {}
    const p = new root.firebase.auth.GoogleAuthProvider(); p.addScope(SCOPE);
    const hint = (typeof currentUser !== 'undefined' && currentUser?.email) || '';
    p.setCustomParameters(hint ? { login_hint: hint } : { prompt: 'select_account' });
    let res;
    try { res = await a.signInWithPopup(p); } catch (e) { throw new Error(String(e.code || e.message || 'popup').replace(/^auth\//, '')); }
    const t = res.credential && res.credential.accessToken;
    try { await a.signOut(); } catch (e) {}
    if (!t) throw new Error('no_token');
    token = t; tokenExp = Date.now() + 55 * 60e3;
  }

  /* interactive=true may open a Google window (needs a click); false never does */
  async function ensureToken(interactive) {
    if (token && Date.now() < tokenExp - 60e3) return;
    const cfg = await config();
    if (cfg.connected) {
      try { await silentToken(); return; }
      catch (e) { if (e.status === 410) serverCfg = { ...cfg, connected: false }; else if (!interactive) throw e; }
    }
    if (!interactive) throw new Error('needs_click');
    if (cfg.clientId) await connectServer(cfg); else await popupToken();
  }

  async function gget(path) {
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) { token = null; throw new Error('auth'); }
    if (r.status === 403) { const t = JSON.stringify(await r.json().catch(() => ({}))); throw new Error(/has not been used|disabled/i.test(t) ? 'api_disabled' : /insufficient|scope/i.test(t) ? 'scope_denied' : 'forbidden'); }
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  }
  async function listIds(q, cap = 600) {
    const ids = []; let pt = '';
    do {
      const j = await gget(`/messages?maxResults=100&q=${encodeURIComponent(q)}${pt ? '&pageToken=' + pt : ''}`);
      (j.messages || []).forEach(m => ids.push(m.id)); pt = j.nextPageToken || '';
    } while (pt && ids.length < cap);
    return ids;
  }
  async function fetchAll(ids, onProgress) {
    const out = []; let i = 0, done = 0;
    async function worker() {
      while (i < ids.length) {
        const id = ids[i++];
        try { out.push(decodeMessage(await gget(`/messages/${id}?format=full`))); } catch (e) { if (e.message === 'auth') throw e; }
        onProgress?.(++done, ids.length);
      }
    }
    await Promise.all(Array.from({ length: 5 }, worker));
    return out;
  }

  /* ── what was already handled: kept on the user's profile so every device agrees ── */
  async function loadState() {
    let st = { seen: lsGet('seen', []), last: lsGet('last', 0) };
    try {
      const d = (await db.collection('users').doc(uid()).get()).data() || {};
      st = { seen: [...new Set([...(d.gmailSeen || []), ...st.seen])], last: Math.max(+d.gmailLastSync || 0, st.last) };
    } catch (e) {}
    return st;
  }
  async function markSeen(ids, last) {
    const all = [...new Set([...lsGet('seen', []), ...ids])].slice(-4000);
    lsSet('seen', all); if (last) lsSet('last', last);
    try {
      const upd = {}; if (ids.length) upd.gmailSeen = root.firebase.firestore.FieldValue.arrayUnion(...ids.slice(-400));
      if (last) upd.gmailLastSync = last;
      if (Object.keys(upd).length) await db.collection('users').doc(uid()).set(upd, { merge: true });
    } catch (e) {}
  }

  const rate = d => { try { return histRate(d); } catch (e) { return 3.7; } };
  const toUsd = it => (it.currency === 'ILS' ? Math.round(it.amount / rate(it.date) * 100) / 100 : it.amount);
  function companyName(name) {
    const list = recs().map(r => r && r.company).filter(Boolean);
    const first = name.split(' ')[0].toLowerCase();
    return list.find(c => c.toLowerCase() === name.toLowerCase()) || list.find(c => c.toLowerCase().startsWith(first)) || name;
  }
  function addRecords(list) {
    let n = 0;
    list.forEach(it => {
      if (recs().some(r => r && r.gmailId === it.gmailId)) return; /* last guard against a double add */
      recs().push({
        id: Date.now() + '_g' + n, date: it.date, type: 'הוצאה', amount: Math.round(it.usd * 100) / 100,
        rate: rate(it.date), done: false, company: companyName(it.company), cat: it.cat, portVal: 0,
        note: 'Gmail: ' + String(it.subject || '').slice(0, 80), src: 'gmail', gmailId: it.gmailId,
      });
      n++;
    });
    if (n) { try { renderAll(); saveData(); } catch (e) {} }
    return n;
  }

  /* auto=false: button click, may open Google, always shows the result.
     auto=true: on login, silent; certain receipts are added, the rest wait for review. */
  async function scan(auto = false) {
    if (busy || !cloudReady()) { if (!auto && !cloudReady()) toast('הנתונים עוד נטענים, נסה שוב בעוד רגע', 'info'); return; }
    busy = true; renderButtons();
    const dlg = auto ? { set() {}, close() {} } : progressDialog();
    try {
      await ensureToken(!auto);
      const st = await loadState();
      const after = Math.floor((st.last ? st.last - 3 * 864e5 : Date.now() - 365 * 864e5) / 1000);
      dlg.set('מחפש קבלות במייל…');
      const ids = [...new Set((await Promise.all(gmailQueries(after).map(q => listIds(q)))).flat())];
      const seen = new Set(st.seen);
      const todo = ids.filter(id => !seen.has(id) && !recs().some(r => r && r.gmailId === id));
      const msgs = await fetchAll(todo, (d, n) => dlg.set(`קורא מיילים ${d}/${n}…`));
      const found = []; const notReceipts = [];
      msgs.forEach(m => { const r = classify(m); if (r.ok) found.push(r.item); else notReceipts.push(m.id); });
      const split = dedupe(found, recs(), st.seen, toUsd);
      dlg.close();
      const now = Date.now();
      if (auto) {
        const n = addRecords(split.auto);
        await markSeen([...notReceipts, ...split.auto, ...split.skipped, ...split.dup].map(x => x.gmailId || x), now);
        pending = split.review;
        if (n) toast(`נוספו ${n} הוצאות מסחר מהמייל`, 'success');
        if (pending.length) toast(`${pending.length} הוצאות מהמייל מחכות לבדיקה שלך`, 'info');
      } else {
        await markSeen([...notReceipts, ...split.skipped].map(x => x.gmailId || x), now);
        pending = [];
        review([...split.auto, ...split.review, ...split.dup.map(x => ({ ...x, isDup: true }))], msgs.length);
      }
    } catch (e) {
      dlg.close();
      console.warn('gmail-expenses', e);
      if (!auto) errorDialog(e.message);
    } finally { busy = false; renderButtons(); }
  }

  function errorDialog(code) {
    const ENABLE = 'https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=fayna-trading';
    const msg = {
      'popup-closed-by-user': 'החלון של Google נסגר לפני האישור. נסה שוב והשלם את האישור.',
      'cancelled-popup-request': 'החלון של Google נסגר לפני האישור. נסה שוב.',
      'popup-blocked': 'הדפדפן חסם את החלון של Google. אפשר חלונות קופצים לאתר ונסה שוב.',
      'popup_failed_to_open': 'הדפדפן חסם את החלון של Google. אפשר חלונות קופצים לאתר ונסה שוב.',
      'access_denied': 'לא ניתנה הרשאה לקרוא את המייל.',
      'scope_denied': 'בחלון של Google צריך לסמן את ההרשאה לצפייה בהודעות האימייל ואז לאשר.',
      'api_disabled': 'שירות Gmail עדיין לא מופעל בפרויקט של המערכת. זו הגדרה חד־פעמית: לחץ על הקישור, בחר Enable, חכה דקה ונסה שוב.',
      'unauthorized-domain': 'הדומיין של האתר לא מאושר בהתחברות של Firebase.',
      'operation-not-allowed': 'ההתחברות עם Google כבויה ב־Firebase.',
      'exchange_failed': 'Google לא אישר את החיבור. נסה שוב.',
      'no_refresh_token': 'Google לא נתן הרשאה קבועה. נסה שוב, ובחלון של Google אשר את כל ההרשאות.',
      'no_token': 'Google לא החזיר הרשאה לקריאת המייל. נסה שוב.',
    }[code] || 'הסנכרון נכשל. נסה שוב בעוד רגע.';
    const admin = typeof currentUser !== 'undefined' && currentUser?.isAdmin === true;
    const o = document.createElement('div'); o.className = 'fyc-overlay'; o.setAttribute('role', 'alertdialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = `<div class="fyc-box" dir="rtl" tabindex="-1"><h2>הסנכרון מ־Gmail לא הצליח</h2><p>${esc(msg)}</p>
      ${code === 'api_disabled' && admin ? `<p><a href="${ENABLE}" target="_blank" rel="noopener" class="fys-dl">הפעלת Gmail API בפרויקט fayna-trading</a></p>` : ''}
      ${admin ? `<p class="fys-note" dir="ltr" style="text-align:left">code: ${esc(code)}</p>` : ''}
      <div class="fyc-actions"><button type="button" class="fyc-primary" data-retry>נסה שוב</button><button type="button" class="fyc-ghost" data-close>סגירה</button></div></div>`;
    document.body.appendChild(o);
    setTimeout(() => o.querySelector('.fyc-box').focus(), 30);
    o.querySelector('[data-close]').onclick = () => o.remove();
    o.querySelector('[data-retry]').onclick = () => { o.remove(); scan(false); };
    o.addEventListener('keydown', e => { if (e.key === 'Escape') o.remove(); });
  }

  function progressDialog() {
    const o = document.createElement('div'); o.className = 'fyc-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = '<div class="fyc-box" dir="rtl"><h2>סנכרון הוצאות מ־Gmail</h2><p class="fyc-msg" aria-live="polite">מתחבר ל־Google…</p></div>';
    document.body.appendChild(o);
    return { set: t => { o.querySelector('.fyc-msg').textContent = t; }, close: () => o.remove() };
  }

  const CATS = ['מבחן', 'לייב', 'ריסט', 'כלי', 'קורס', 'אחר'];
  /* items carry .usd; .dup ones are matched to an expense already in the log */
  function review(items, scanned) {
    const o = document.createElement('div'); o.className = 'fyc-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'gmx-t');
    const rows = items.map((it, i) => {
      const dup = !!it.isDup || !!it.maybeDup;
      const orig = it.currency !== 'USD' ? `<small dir="ltr">${it.currency === 'ILS' ? '₪' : '€'}${it.amount.toFixed(2)}</small>` : '';
      const flag = it.isDup ? '<em class="gmx-flag">כבר רשום ביומן</em>' : it.maybeDup ? '<em class="gmx-flag">כנראה אותה רכישה ממייל נוסף</em>' : (!it.sure || it.currency === 'EUR') ? '<em class="gmx-flag">בדוק סכום</em>' : '';
      return `<li class="gmx-row"><label class="gmx-chk"><input type="checkbox" data-i="${i}" ${dup ? '' : 'checked'} aria-label="להוסיף את ${esc(it.company)} מ־${esc(it.date)}"></label>
        <div class="gmx-main"><b>${esc(it.company)}</b><small>${esc(it.date)} · ${esc(it.subject)}</small>${flag}</div>
        <select data-cat="${i}" aria-label="קטגוריה">${CATS.map(c => `<option${c === it.cat ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <div class="gmx-amt"><span>$</span><input type="number" step="0.01" min="0" inputmode="decimal" dir="ltr" data-amt="${i}" value="${it.usd.toFixed(2)}" aria-label="סכום בדולר">${orig}</div></li>`;
    }).join('');
    const lead = items.length
      ? (scanned != null ? `סרקתי ${scanned} מיילים מחברות פרופ, פלטפורמות וספקי דאטה. ` : '') + 'סמן מה להוסיף ליומן ההוצאות ולניהול העסקי. מה שלא תסמן לא יוצג שוב.'
      : (scanned ? `סרקתי ${scanned} מיילים חדשים ולא מצאתי קבלות שלא רשומות כבר.` : 'אין מיילים חדשים מאז הסנכרון האחרון. כל ההוצאות כבר ביומן.');
    o.innerHTML = `<div class="fyc-box gmx-box" dir="rtl" tabindex="-1"><h2 id="gmx-t">${items.length ? `נמצאו ${items.length} הוצאות מסחר` : 'הכל מעודכן'}</h2><p>${lead}</p>
      ${items.length ? `<ul class="gmx-list">${rows}</ul>` : ''}
      <div class="fyc-actions">${items.length ? '<button type="button" class="fyc-primary" data-add>שמירה</button>' : ''}<button type="button" class="fyc-ghost" data-close>${items.length ? 'אחר כך' : 'סגירה'}</button></div></div>`;
    document.body.appendChild(o);
    setTimeout(() => o.querySelector('.fyc-box').focus(), 30);
    const close = () => o.remove();
    o.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    o.querySelector('[data-close]').onclick = () => { pending = items; close(); renderButtons(); };
    o.querySelector('[data-add]')?.addEventListener('click', async () => {
      const take = [];
      o.querySelectorAll('[data-i]').forEach(c => {
        const i = +c.dataset.i, it = items[i];
        if (!c.checked) return;
        const usd = parseFloat(o.querySelector(`[data-amt="${i}"]`).value);
        if (usd > 0) take.push({ ...it, usd, cat: o.querySelector(`[data-cat="${i}"]`).value });
      });
      const n = addRecords(take);
      await markSeen(items.map(it => it.gmailId));
      pending = [];
      toast(n ? `נוספו ${n} הוצאות ליומן` : 'נשמר. ההוצאות שלא סומנו לא יוצגו שוב', 'success');
      close(); renderButtons();
    });
  }

  async function disconnect() {
    try { if ((await config()).connected) await server('disconnect'); } catch (e) {}
    try { if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }); } catch (e) {}
    token = null; tokenExp = 0; serverCfg = null; pending = [];
    toast('החיבור ל־Gmail נותק', 'success'); renderButtons();
  }

  function onButton() { if (pending.length && !busy) review(pending, null); else scan(false); }
  function renderButtons() {
    const show = visible();
    const label = busy ? 'מסנכרן…' : pending.length ? `${pending.length} הוצאות לבדיקה` : 'סנכרון מ־Gmail';
    const last = lsGet('last', 0);
    const title = last ? `סנכרון אחרון: ${new Date(last).toLocaleString('he-IL')}` : 'מוצא קבלות של חברות פרופ ופלטפורמות במייל ומוסיף אותן כהוצאות';
    [['gmx-exp', () => document.querySelector('#tp-expenses .btn-p')], ['gmx-biz', () => document.querySelector('#tp-biz .ws-toolbar')]].forEach(([id, anchor]) => {
      let b = document.getElementById(id);
      if (!show) { b?.remove(); return; }
      const a = anchor(); if (!a) return;
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.id = id; b.addEventListener('click', onButton);
        if (id === 'gmx-exp') { b.className = 'gmx-btn'; a.before(b); } else { b.className = 'bn'; a.appendChild(b); }
      }
      b.textContent = label; b.title = title; b.disabled = busy;
      b.classList.toggle('gmx-pending', !!pending.length);
    });
    const set = document.getElementById('gmx-disc');
    if (show && serverCfg?.connected) {
      if (!set) {
        const host = document.querySelector('#actdd-exp .act-dd-menu'); if (!host) return;
        const x = document.createElement('button'); x.className = 'act-mi'; x.id = 'gmx-disc'; x.type = 'button'; x.textContent = 'ניתוק Gmail';
        x.onclick = disconnect; host.appendChild(x);
      }
    } else set?.remove();
  }

  /* every login: once the user's data finished loading, re-scan in the background */
  async function autoTick() {
    if (!visible() || !cloudReady() || busy) return;
    const u = uid(); if (autoDoneFor === u) return;
    autoDoneFor = u;
    if (Date.now() - lsGet('autoAt', 0) < AUTO_EVERY) return;
    const cfg = await config(); renderButtons();
    if (!cfg.connected) return;
    lsSet('autoAt', Date.now());
    scan(true);
  }

  root.FaynaGmailExpenses = { core, scan, disconnect, review };
  const boot = () => {
    renderButtons();
    setInterval(() => { if (uid() !== autoDoneFor && autoDoneFor) { serverCfg = null; pending = []; token = null; autoDoneFor = ''; } renderButtons(); autoTick(); }, 3000);
    const biz = document.getElementById('tp-biz');
    if (biz && root.MutationObserver) { let q = 0; new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; if (!document.getElementById('gmx-biz')) renderButtons(); }); }).observe(biz, { childList: true, subtree: true }); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
