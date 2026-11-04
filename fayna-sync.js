/* v110 — live trade sync from platform add-ons (ATAS, Quantower).
 *
 * Flow: add-on in the platform → syncIngest (server) → users/{uid}/syncFills →
 * this module listens, pairs executions into round-trip trades and adds the new
 * ones to the journal. Nothing here asks for or stores a broker password.
 *
 *  - core.buildTrades(): pure, FIFO per account+symbol, splits a fill that flips
 *    the position, keeps an unfinished position as "open" until it is flat.
 *  - Pairing keys: created in the browser; only the SHA-256 hash is saved.
 *  - Account mapping: platform account → journal account, auto by name, editable,
 *    saved on the user record (syncAccountMap) so every device uses the same map.
 *  - Dedupe: by the trade's sync id and by the import module's content key, so a
 *    trade already imported from a file is not added a second time.
 */
(function () {
  'use strict';
  const INGEST_URL = 'https://us-central1-fayna-trading.cloudfunctions.net/syncIngest';
  const WINDOW_DAYS = 120;
  /* Until the add-ons are released, only the admin sees the card (the server and rules must be deployed first). */
  const OPEN_TO_ALL = false;
  const visible = () => OPEN_TO_ALL || (typeof currentUser !== 'undefined' && currentUser?.isAdmin === true);
  const pad = n => String(n).padStart(2, '0');

  /* ═════════════ core (no DOM, testable in Node) ═════════════ */
  const cleanSym = s => String(s || '').toUpperCase().replace(/@.*$/, '').replace(/\s+/g, '').slice(0, 24);
  function localParts(ms) {
    const d = new Date(ms);
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` };
  }
  function dur(a, b) {
    let s = Math.max(0, Math.round((b - a) / 1000));
    if (s < 60) return s + 's';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${pad(m)}m` : `${m}m`;
  }
  const avg = list => { const q = list.reduce((s, x) => s + x.q, 0); return q ? list.reduce((s, x) => s + x.q * x.p, 0) / q : 0; };

  function buildTrades(fills, opts = {}) {
    const mult = opts.mult || (() => 1);
    const groups = new Map();
    fills.forEach(f => {
      const k = f.account + '|' + cleanSym(f.symbol);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    });
    const trades = [], open = [];
    groups.forEach(list => {
      list.sort((a, b) => a.time - b.time || String(a.id).localeCompare(String(b.id)));
      let pos = 0, cur = null;
      const finish = () => {
        const qty = cur.entries.reduce((s, x) => s + x.q, 0);
        const e = avg(cur.entries), x = avg(cur.exits);
        const buy = cur.dir === 'long' ? e : x, sell = cur.dir === 'long' ? x : e;
        const sym = cleanSym(cur.symbol);
        const t0 = cur.entries[0].t, t1 = cur.exits[cur.exits.length - 1].t;
        const a = localParts(t0), b = localParts(t1);
        const t = {
          sym, qty, buy: +buy.toFixed(4), sell: +sell.toFixed(4),
          pnl: +((sell - buy) * qty * mult(sym)).toFixed(2),
          date: a.date, btime: a.time, stime: b.time, dur: dur(t0, t1),
          dir: cur.dir, strategy: '', notes: '', stars: 0,
          src: cur.source + '-sync', extId: ('sync:' + cur.firstId).slice(0, 64),
          syncAccount: cur.account,
        };
        if (b.date !== a.date) t.exitDate = b.date;
        if (cur.fees > 0) t.commOverride = +cur.fees.toFixed(2);
        trades.push(t);
        cur = null;
      };
      list.forEach(f => {
        const q0 = Number(f.qty), sign = f.side === 'buy' ? 1 : -1;
        let left = q0;
        const feePer = Number(f.commission) > 0 ? Number(f.commission) / q0 : 0;
        while (left > 1e-9) {
          if (!cur) cur = { dir: sign > 0 ? 'long' : 'short', entries: [], exits: [], fees: 0, firstId: f.source + '_' + f.account + '_' + f.id, account: f.account, symbol: f.symbol, source: f.source };
          if (pos === 0 || Math.sign(pos) === sign) {
            cur.entries.push({ q: left, p: f.price, t: f.time }); cur.fees += feePer * left; pos += sign * left; left = 0;
          } else {
            const q = Math.min(left, Math.abs(pos));
            cur.exits.push({ q, p: f.price, t: f.time }); cur.fees += feePer * q; pos += sign * q; left -= q;
            if (Math.abs(pos) < 1e-9) { pos = 0; finish(); }
          }
        }
      });
      if (cur) open.push({ account: cur.account, symbol: cleanSym(cur.symbol), dir: cur.dir, qty: Math.abs(pos), avg: +avg(cur.entries).toFixed(4), since: cur.entries[0].t });
    });
    return { trades, open };
  }

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  /* platform account → journal account id: saved choice first, then a name match. */
  function resolveAccount(platformAcct, journalAccounts, savedMap) {
    if (savedMap && savedMap[platformAcct]) {
      const id = savedMap[platformAcct];
      if (journalAccounts.some(a => a.id === id && a.archived !== true)) return id;
    }
    const p = norm(platformAcct); if (!p) return '';
    const hits = journalAccounts.filter(a => a.archived !== true && a.active !== false && (norm(a.name).includes(p) || (norm(a.name).length >= 4 && p.includes(norm(a.name)))));
    return hits.length === 1 ? hits[0].id : '';
  }

  const core = { buildTrades, resolveAccount, cleanSym };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  /* ═════════════ browser ═════════════ */
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { unsub: null, uid: null, fills: [], open: [], unmapped: new Map(), lastAdded: 0, devices: [], devUnsub: null, waitTimer: null };
  const accountsList = () => (typeof accounts !== 'undefined' && Array.isArray(accounts) ? accounts : []);
  const savedMap = () => (typeof currentUser !== 'undefined' && currentUser?.syncAccountMap) || {};
  const multFn = sym => { try { return typeof _getFuturesMultiplier === 'function' ? (_getFuturesMultiplier(sym) || 1) : 1; } catch (e) { return 1; } };
  const ago = ms => { if (!ms) return 'עדיין לא'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'עכשיו' : m < 60 ? `לפני ${m} דק׳` : m < 1440 ? `לפני ${Math.round(m / 60)} שע׳` : new Date(ms).toLocaleDateString('he-IL'); };
  const tsMs = v => v?.toMillis ? v.toMillis() : (typeof v === 'number' ? v : 0);

  function apply() {
    if (typeof currentUser === 'undefined' || !currentUser?.uid || typeof tradesList === 'undefined') return;
    if (typeof _cloudReadyUid !== 'undefined' && _cloudReadyUid !== currentUser.uid) return; // never before the cloud read
    const { trades, open } = buildTrades(state.fills, { mult: multFn });
    state.open = open;
    state.unmapped = new Map();
    const ready = [];
    trades.forEach(t => {
      const acct = resolveAccount(t.syncAccount, accountsList(), savedMap());
      if (!acct) { state.unmapped.set(t.syncAccount, (state.unmapped.get(t.syncAccount) || 0) + 1); return; }
      const c = { ...t, acct }; delete c.syncAccount; ready.push(c);
    });
    let fresh = ready;
    try {
      const D = window.Import?._core?.dedupe;
      if (D) {
        const keys = tradesList.map(t => `${t.date}|${t.sym}|${t.buy}|${t.sell}|${(t.btime || '').slice(0, 5)}|${t.qty}`);
        const ext = tradesList.filter(t => t.extId).map(t => (t.src || '') + '|' + t.extId);
        fresh = D(ready, keys, ext).fresh;
      } else {
        const have = new Set(tradesList.map(t => t.extId).filter(Boolean));
        fresh = ready.filter(t => !have.has(t.extId));
      }
    } catch (e) {}
    if (fresh.length) {
      tradesList = tradesList.concat(fresh);
      try { if (typeof renderAll === 'function') renderAll(); } catch (e) {}
      try { if (typeof saveData === 'function') saveData(); } catch (e) {}
      state.lastAdded = Date.now();
      const gross = fresh.reduce((s, t) => s + t.pnl, 0);
      try { showToast(`סונכרנו ${fresh.length} עסקאות חדשות מהפלטפורמה · ${gross >= 0 ? '+' : ''}$${gross.toFixed(2)}`, 'success', 5000); } catch (e) {}
    }
    renderCard();
  }

  function start() {
    if (typeof currentUser === 'undefined' || !currentUser?.uid || typeof db === 'undefined') return;
    if (state.uid === currentUser.uid && state.unsub) return;
    stop();
    state.uid = currentUser.uid;
    try {
      const since = Date.now() - WINDOW_DAYS * 864e5;
      state.unsub = db.collection('users').doc(state.uid).collection('syncFills').where('time', '>=', since)
        .onSnapshot(snap => { state.fills = snap.docs.map(d => d.data()); waitAndApply(); }, err => console.warn('sync fills', err));
      state.devUnsub = db.collection('syncDevices').where('uid', '==', state.uid)
        .onSnapshot(snap => { state.devices = snap.docs.map(d => ({ hash: d.id, ...d.data() })); renderCard(); }, () => {});
    } catch (e) { console.warn('sync start', e); }
  }
  function waitAndApply() {
    clearTimeout(state.waitTimer);
    const go = () => { if (typeof _cloudReadyUid !== 'undefined' && _cloudReadyUid !== currentUser?.uid) { state.waitTimer = setTimeout(go, 1500); return; } apply(); };
    go();
  }
  function stop() {
    try { state.unsub && state.unsub(); } catch (e) {} try { state.devUnsub && state.devUnsub(); } catch (e) {}
    state.unsub = state.devUnsub = null; state.uid = null; state.fills = []; state.devices = [];
  }

  /* ── pairing keys ── */
  const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function sha256hex(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  async function createKey(platform) {
    const key = 'fyn_' + b64url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sha256hex(key);
    await db.collection('syncDevices').doc(hash).set({ uid: currentUser.uid, label: String(platform).slice(0, 60), createdAt: firebase.firestore.FieldValue.serverTimestamp(), revoked: false });
    return key;
  }
  async function revoke(hash) {
    const ok = typeof customConfirm === 'function' ? await customConfirm('לנתק את החיבור? התוסף יפסיק לשלוח עסקאות עד שתזין מפתח חדש.', { danger: true, okText: 'נתק', cancelText: 'ביטול' }) : true;
    if (!ok) return;
    try { await db.collection('syncDevices').doc(hash).update({ revoked: true }); showToast?.('החיבור נותק', 'success'); } catch (e) { showToast?.('הניתוק נכשל, נסה שוב', 'error'); }
  }
  async function saveMap(platformAcct, journalId) {
    const map = { ...savedMap(), [platformAcct]: journalId };
    try { await db.collection('users').doc(currentUser.uid).set({ syncAccountMap: map }, { merge: true }); currentUser.syncAccountMap = map; apply(); }
    catch (e) { showToast?.('שמירת השיוך נכשלה', 'error'); }
  }

  function keyDialog(key, platform) {
    const o = document.createElement('div'); o.className = 'fyc-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'fys-k-t');
    const steps = platform === 'Quantower'
      ? ['מורידים את התוסף ומעתיקים את הקובץ FaynaSync.dll לתיקייה Settings\\Scripts\\Strategies של Quantower.', 'ב־Quantower פותחים Strategies Manager, בוחרים "Fayna Sync" ומדביקים את המפתח.', 'לוחצים Run. כל ביצוע יופיע ביומן תוך דקה.']
      : ['מורידים את התוסף ומעתיקים את FaynaSync.dll לתיקייה Documents\\ATAS\\Indicators.', 'ב־ATAS פותחים גרף כלשהו, מוסיפים את האינדיקטור "Fayna Sync" ומדביקים את המפתח בהגדרות שלו.', 'משאירים את הגרף פתוח. כל ביצוע בכל החשבונות יופיע ביומן תוך דקה.'];
    o.innerHTML = `<div class="fyc-box" dir="rtl" tabindex="-1"><h2 id="fys-k-t">מפתח החיבור ל־${esc(platform)}</h2>
      <p>המפתח מוצג פעם אחת בלבד. העתק אותו עכשיו והדבק בתוסף. אם יאבד, פשוט צור מפתח חדש.</p>
      <div class="fys-key"><code dir="ltr">${esc(key)}</code><button type="button" class="fyc-primary" data-copy>העתקה</button></div>
      <ol class="fys-steps">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="fys-note">התוסף שולח רק את הביצועים שלך (סימבול, כיוון, כמות, מחיר, זמן ועמלה). הוא לא שולח סיסמה ולא יכול לבצע פקודות.</p>
      <div class="fyc-actions"><button type="button" class="fyc-ghost" data-close>סגירה</button></div></div>`;
    document.body.appendChild(o);
    const box = o.querySelector('.fyc-box'); setTimeout(() => box.focus(), 30);
    o.querySelector('[data-copy]').onclick = async e => { try { await navigator.clipboard.writeText(key); e.target.textContent = 'הועתק ✓'; } catch (er) { e.target.textContent = 'סמן והעתק ידנית'; } };
    o.querySelector('[data-close]').onclick = () => o.remove();
    o.addEventListener('keydown', e => { if (e.key === 'Escape') o.remove(); });
  }

  /* ── the card in Settings → Connections ── */
  function renderCard() {
    const page = document.getElementById('pa-connections'); if (!page) return;
    if (!visible()) { document.getElementById('fys-card')?.remove(); return; }
    let card = document.getElementById('fys-card');
    if (!card) {
      card = document.createElement('div'); card.className = 'pa-card'; card.id = 'fys-card';
      page.querySelector('.pa-page-title')?.after(card);
      card.addEventListener('click', async e => {
        const b = e.target.closest('[data-fys]'); if (!b) return;
        if (b.dataset.fys === 'new') {
          if (!currentUser?.uid) return;
          const platform = card.querySelector('#fys-platform').value;
          b.disabled = true;
          try { keyDialog(await createKey(platform), platform); } catch (er) { showToast?.('יצירת המפתח נכשלה. ודא שאתה מחובר ונסה שוב.', 'error'); }
          b.disabled = false;
        } else if (b.dataset.fys === 'revoke') revoke(b.dataset.hash);
      });
      card.addEventListener('change', e => { const s = e.target.closest('[data-map]'); if (s && s.value) saveMap(s.dataset.map, s.value); });
    }
    const devs = state.devices.filter(d => d.revoked !== true).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    const accs = accountsList().filter(a => a.archived !== true);
    const unm = [...state.unmapped.entries()];
    const lastSeen = Math.max(0, ...devs.map(d => tsMs(d.lastSeen)));
    card.innerHTML = `<div class="pa-card-title">סנכרון אוטומטי של עסקאות</div>
      <p class="fys-lead">התוסף רץ בתוך פלטפורמת המסחר שלך ושולח לפיינה כל ביצוע, מכל החשבונות שמחוברים לפלטפורמה (Rithmic או Tradovate). בלי סיסמאות ובלי ייבוא קבצים.</p>
      <div class="fys-status" role="status">${devs.length ? `<span class="fys-dot ${lastSeen && Date.now() - lastSeen < 15 * 60e3 ? 'on' : ''}"></span>עדכון אחרון מהתוסף: ${esc(ago(lastSeen))}` : 'עדיין לא חובר תוסף.'}${state.open.length ? ' · ' + (state.open.length === 1 ? 'פוזיציה פתוחה אחת תתווסף כשתיסגר' : state.open.length + ' פוזיציות פתוחות יתווספו כשייסגרו') : ''}</div>
      <div class="fys-new"><label for="fys-platform">פלטפורמה</label><select id="fys-platform"><option>ATAS</option><option>Quantower</option></select>
        <button type="button" class="fyc-primary" data-fys="new">יצירת מפתח חיבור</button>
        <a class="fys-dl" href="sync/" target="_blank" rel="noopener">הורדת התוסף והוראות התקנה</a></div>
      ${devs.length ? `<ul class="fys-devs" aria-label="חיבורים פעילים">${devs.map(d => `<li><div><b>${esc(d.label || 'תוסף')}</b><small>נוצר ${esc(tsMs(d.createdAt) ? new Date(tsMs(d.createdAt)).toLocaleDateString('he-IL') : '')} · פעילות ${esc(ago(tsMs(d.lastSeen)))}${d.fills ? ` · ${d.fills} ביצועים` : ''}</small></div><button type="button" class="fyc-danger" data-fys="revoke" data-hash="${esc(d.hash)}">ניתוק</button></li>`).join('')}</ul>` : ''}
      ${unm.length ? `<div class="fys-map"><h3>חשבונות שממתינים לשיוך</h3><p>עסקאות מהחשבונות האלה ייכנסו ליומן אחרי שתבחר לאיזה חשבון מסחר הן שייכות.</p>${unm.map(([p, n]) => `<div class="fys-map-row"><label for="fys-m-${esc(norm(p))}"><b dir="ltr">${esc(p)}</b><small>${n} עסקאות</small></label><select id="fys-m-${esc(norm(p))}" data-map="${esc(p)}"><option value="">בחר חשבון ביומן…</option>${accs.map(a => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('')}</select></div>`).join('')}</div>` : ''}`;
  }

  function wrapShowApp() {
    const prev = window.showApp; if (typeof prev !== 'function' || prev._fys) return;
    const w = function () { const r = prev.apply(this, arguments); setTimeout(start, 1200); return r; };
    w._fys = true; window.showApp = w; try { showApp = w; } catch (e) {}
  }
  function wrapLogout() {
    const prev = window.doLogout; if (typeof prev !== 'function' || prev._fys) return;
    const w = async function () { stop(); return prev.apply(this, arguments); };
    w._fys = true; window.doLogout = w; try { doLogout = w; } catch (e) {}
  }
  function init() {
    wrapShowApp(); wrapLogout();
    const tp = document.getElementById('tp-personal');
    if (tp) new MutationObserver(() => { if (tp.classList.contains('active')) renderCard(); }).observe(tp, { attributes: true, attributeFilter: ['class'] });
    renderCard();
    if (typeof currentUser !== 'undefined' && currentUser?.uid) start();
  }
  window.FaynaSync = Object.freeze({ core, start, stop, apply, INGEST_URL, _state: state });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', () => { wrapShowApp(); wrapLogout(); });
})();
