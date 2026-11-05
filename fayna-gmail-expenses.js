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

  const core = { VENDORS, extractAmount, findVendor, category, classify, decodeMessage, htmlToText, parseNum, gmailQueries };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  /* ───────────── browser side ───────────── */

  const OPEN_TO_ALL = false; /* switch to true after Google verifies the gmail.readonly scope */
  const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const visible = () => OPEN_TO_ALL || (typeof currentUser !== 'undefined' && currentUser?.isAdmin === true);
  const esc = v => (typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, k) => { try { showToast(m, k); } catch (e) {} };
  const uid = () => (typeof currentUser !== 'undefined' && currentUser?.uid) || 'anon';
  const LS = k => `fayna_gmx_${k}_${uid()}`;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(LS(k)); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch (e) {} };

  let token = null, tokenExp = 0, busy = false;

  /* Google access token through Firebase's own Google sign-in, in a separate app
     instance that stores nothing, so the user's Fayna session is never touched.
     Firebase already allows this site, so no extra OAuth origin setup is needed. */
  function gauth() {
    const fb = root.firebase;
    if (!fb?.initializeApp) throw new Error('no_firebase');
    let app = (fb.apps || []).find(x => x.name === 'fayna-gmail');
    if (!app) app = fb.initializeApp(fb.app().options, 'fayna-gmail');
    return app.auth();
  }
  async function getToken() {
    if (token && Date.now() < tokenExp - 60e3) return token;
    const a = gauth();
    try { await a.setPersistence(root.firebase.auth.Auth.Persistence.NONE); } catch (e) {}
    const p = new root.firebase.auth.GoogleAuthProvider();
    p.addScope(SCOPE);
    const hint = (typeof currentUser !== 'undefined' && currentUser?.email) || '';
    p.setCustomParameters(hint ? { login_hint: hint, prompt: 'consent' } : { prompt: 'select_account consent' });
    let res;
    try { res = await a.signInWithPopup(p); }
    catch (e) { throw new Error(String(e.code || e.message || 'popup').replace(/^auth\//, '')); }
    const t = res.credential && res.credential.accessToken;
    try { await a.signOut(); } catch (e) {}
    if (!t) throw new Error('no_token');
    token = t; tokenExp = Date.now() + 55 * 60e3;
    return token;
  }
  async function gget(path) {
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) { token = null; throw new Error('auth'); }
    if (r.status === 403) { const j = await r.json().catch(() => ({})); const t = JSON.stringify(j); throw new Error(/has not been used|disabled/i.test(t) ? 'api_disabled' : /insufficient|scope/i.test(t) ? 'scope_denied' : 'forbidden'); }
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  }
  async function listIds(q, cap = 600) {
    const ids = []; let pt = '';
    do {
      const j = await gget(`/messages?maxResults=100&q=${encodeURIComponent(q)}${pt ? '&pageToken=' + pt : ''}`);
      (j.messages || []).forEach(m => ids.push(m.id));
      pt = j.nextPageToken || '';
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

  const rate = d => { try { return histRate(d); } catch (e) { return 3.7; } };
  function usdOf(it) {
    if (it.currency === 'ILS') return Math.round(it.amount / rate(it.date) * 100) / 100;
    return it.amount; /* EUR is rare; kept as-is and flagged as unsure */
  }
  function companyName(name) {
    const list = (typeof records !== 'undefined' ? records : []).map(r => r && r.company).filter(Boolean);
    const first = name.split(' ')[0].toLowerCase();
    return list.find(c => c.toLowerCase() === name.toLowerCase()) || list.find(c => c.toLowerCase().startsWith(first)) || name;
  }
  function existingMatch(it, usd) {
    const day = Date.parse(it.date);
    return (typeof records !== 'undefined' ? records : []).find(r => r && r.type !== 'הכנסה' &&
      (r.gmailId === it.gmailId ||
       (Math.abs((+r.amount || 0) - usd) < 0.01 && Math.abs(Date.parse(r.date) - day) <= 2 * 864e5)));
  }

  async function scan() {
    if (busy) return; busy = true;
    const dlg = progressDialog();
    try {
      await getToken(); lsSet('granted', true);
      const last = lsGet('last', 0);
      const after = Math.floor((last ? last - 3 * 864e5 : Date.now() - 365 * 864e5) / 1000);
      dlg.set('מחפש קבלות במייל…');
      const ids = [...new Set((await Promise.all(gmailQueries(after).map(q => listIds(q)))).flat())];
      const ignored = new Set(lsGet('ignored', []));
      const todo = ids.filter(id => !ignored.has(id) && !(records || []).some(r => r && r.gmailId === id));
      dlg.set(todo.length ? `קורא ${todo.length} מיילים…` : 'לא נמצאו מיילים חדשים');
      const msgs = await fetchAll(todo, (d, n) => dlg.set(`קורא מיילים ${d}/${n}…`));
      const found = [];
      msgs.forEach(m => { const r = classify(m); if (r.ok) found.push(r.item); });
      found.sort((a, b) => b.date.localeCompare(a.date));
      lsSet('last', Date.now());
      dlg.close();
      review(found, msgs.length);
    } catch (e) {
      dlg.close();
      console.warn('gmail-expenses', e);
      errorDialog(e.message);
    } finally { busy = false; renderButtons(); }
  }

  function errorDialog(code) {
    const ENABLE = 'https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=fayna-trading';
    const msg = {
      'popup-closed-by-user': 'החלון של Google נסגר לפני האישור. נסה שוב והשלם את האישור.',
      'cancelled-popup-request': 'החלון של Google נסגר לפני האישור. נסה שוב.',
      'popup-blocked': 'הדפדפן חסם את החלון של Google. אפשר חלונות קופצים לאתר ונסה שוב.',
      'access_denied': 'לא ניתנה הרשאה לקרוא את המייל.',
      'scope_denied': 'בחלון של Google צריך לסמן את ההרשאה "צפייה בהודעות האימייל" ואז לאשר.',
      'api_disabled': 'שירות Gmail עדיין לא מופעל בפרויקט של המערכת. זו הגדרה חד־פעמית: לחץ על הקישור, בחר Enable, חכה דקה ונסה שוב.',
      'unauthorized-domain': 'הדומיין של האתר לא מאושר בהתחברות של Firebase.',
      'operation-not-allowed': 'ההתחברות עם Google כבויה ב־Firebase.',
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
    o.querySelector('[data-retry]').onclick = () => { o.remove(); scan(); };
    o.addEventListener('keydown', e => { if (e.key === 'Escape') o.remove(); });
  }

  function progressDialog() {
    const o = document.createElement('div'); o.className = 'fyc-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = '<div class="fyc-box" dir="rtl"><h2>סנכרון הוצאות מ־Gmail</h2><p class="fyc-msg" aria-live="polite">מתחבר ל־Google…</p></div>';
    document.body.appendChild(o);
    return { set: t => { o.querySelector('.fyc-msg').textContent = t; }, close: () => o.remove() };
  }

  const CATS = ['מבחן', 'לייב', 'ריסט', 'כלי', 'קורס', 'אחר'];
  function review(items, scanned) {
    const o = document.createElement('div'); o.className = 'fyc-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'gmx-t');
    const rows = items.map((it, i) => {
      const usd = usdOf(it), dup = existingMatch(it, usd);
      it._usd = usd; it._dup = !!dup;
      const orig = it.currency !== 'USD' ? `<small dir="ltr">${it.currency === 'ILS' ? '₪' : '€'}${it.amount.toFixed(2)}</small>` : '';
      const flag = dup ? '<em class="gmx-flag">כנראה כבר רשום</em>' : (!it.sure || it.currency === 'EUR') ? '<em class="gmx-flag">בדוק סכום</em>' : '';
      return `<li class="gmx-row"><label class="gmx-chk"><input type="checkbox" data-i="${i}" ${dup ? '' : 'checked'} aria-label="להוסיף את ${esc(it.company)} מ־${esc(it.date)}"></label>
        <div class="gmx-main"><b>${esc(it.company)}</b><small>${esc(it.date)} · ${esc(it.subject)}</small>${flag}</div>
        <select data-cat="${i}" aria-label="קטגוריה">${CATS.map(c => `<option${c === it.cat ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <div class="gmx-amt"><span>$</span><input type="number" step="0.01" min="0" inputmode="decimal" dir="ltr" data-amt="${i}" value="${usd.toFixed(2)}" aria-label="סכום בדולר">${orig}</div></li>`;
    }).join('');
    o.innerHTML = `<div class="fyc-box gmx-box" dir="rtl" tabindex="-1"><h2 id="gmx-t">נמצאו ${items.length} הוצאות מסחר</h2>
      <p>${items.length ? `סרקתי ${scanned} מיילים מחברות פרופ, פלטפורמות וספקי דאטה. סמן מה להוסיף ליומן ההוצאות ולניהול העסקי.` : `סרקתי ${scanned} מיילים ולא מצאתי קבלות חדשות.`}</p>
      ${items.length ? `<ul class="gmx-list">${rows}</ul>` : ''}
      <div class="fyc-actions">${items.length ? '<button type="button" class="fyc-primary" data-add>הוספה</button><button type="button" class="fyc-ghost" data-ignore>התעלם מהלא מסומנים</button>' : ''}<button type="button" class="fyc-ghost" data-close>סגירה</button></div></div>`;
    document.body.appendChild(o);
    setTimeout(() => o.querySelector('.fyc-box').focus(), 30);
    const close = () => o.remove();
    o.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    o.querySelector('[data-close]').onclick = close;
    const picked = () => [...o.querySelectorAll('[data-i]')].map(c => ({ c, it: items[+c.dataset.i] }));
    o.querySelector('[data-ignore]')?.addEventListener('click', () => {
      const ign = new Set(lsGet('ignored', []));
      picked().filter(p => !p.c.checked).forEach(p => ign.add(p.it.gmailId));
      lsSet('ignored', [...ign].slice(-3000)); toast('המיילים שלא סומנו לא יוצגו שוב', 'info');
    });
    o.querySelector('[data-add]')?.addEventListener('click', () => {
      let n = 0;
      picked().forEach(({ c, it }) => {
        if (!c.checked) return;
        const i = c.dataset.i;
        const amt = parseFloat(o.querySelector(`[data-amt="${i}"]`).value);
        if (!(amt > 0)) return;
        const cat = o.querySelector(`[data-cat="${i}"]`).value;
        records.push({
          id: Date.now() + '_g' + n, date: it.date, type: 'הוצאה', amount: Math.round(amt * 100) / 100,
          rate: rate(it.date), done: false, company: companyName(it.company), cat, portVal: 0,
          note: 'Gmail: ' + it.subject.slice(0, 80), src: 'gmail', gmailId: it.gmailId,
        });
        n++;
      });
      if (n) { try { renderAll(); saveData(); } catch (e) {} toast(`נוספו ${n} הוצאות ליומן`, 'success'); }
      const ign = new Set(lsGet('ignored', []));
      picked().filter(p => !p.c.checked).forEach(p => ign.add(p.it.gmailId));
      lsSet('ignored', [...ign].slice(-3000));
      close();
    });
  }

  function disconnect() {
    try { if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }); } catch (e) {}
    token = null; lsSet('granted', false); lsSet('last', 0);
    toast('החיבור ל־Gmail נותק', 'success'); renderButtons();
  }

  function button(id) {
    const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'gmx-btn';
    b.addEventListener('click', scan);
    return b;
  }
  function renderButtons() {
    const show = visible();
    const last = lsGet('last', 0);
    const label = busy ? 'מסנכרן…' : 'סנכרון מ־Gmail';
    const title = last ? `סנכרון אחרון: ${new Date(last).toLocaleString('he-IL')}` : 'מוצא קבלות של חברות פרופ ופלטפורמות במייל ומוסיף אותן כהוצאות';
    [['gmx-exp', () => document.querySelector('#tp-expenses .btn-p')], ['gmx-biz', () => document.querySelector('#tp-biz .ws-toolbar')]].forEach(([id, anchor]) => {
      let b = document.getElementById(id);
      if (!show) { b?.remove(); return; }
      const a = anchor(); if (!a) return;
      if (!b) {
        b = button(id);
        if (id === 'gmx-exp') a.before(b);
        else { b.className = 'bn'; a.appendChild(b); }
      }
      b.textContent = label; b.title = title; b.disabled = busy;
    });
    const set = document.getElementById('gmx-disc');
    if (lsGet('granted', false) && show) {
      if (!set) {
        const host = document.querySelector('#actdd-exp .act-dd-menu'); if (!host) return;
        const x = document.createElement('button'); x.className = 'act-mi'; x.id = 'gmx-disc'; x.type = 'button'; x.textContent = 'ניתוק Gmail';
        x.onclick = disconnect; host.appendChild(x);
      }
    } else set?.remove();
  }

  root.FaynaGmailExpenses = { core, scan, disconnect, review };
  const boot = () => {
    renderButtons(); setInterval(renderButtons, 4000);
    const biz = document.getElementById('tp-biz');
    if (biz && root.MutationObserver) { let q = 0; new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; if (!document.getElementById('gmx-biz')) renderButtons(); }); }).observe(biz, { childList: true, subtree: true }); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
