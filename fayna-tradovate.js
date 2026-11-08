/* v123 — Tradovate connection card (Settings → Connections).
   One click: the trader approves read-only access on trader.tradovate.com and comes back here.
   The server (functions/tradovate.cjs) keeps the token encrypted, pulls fills every 30 minutes and
   on every login, and writes them to users/{uid}/syncFills, where fayna-sync.js turns them into
   journal trades like the add-ons. The card stays hidden until the server answers configured:true
   (partner credentials from the NinjaTrader Ecosystem). */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const OPEN_TO_ALL = false; /* same rollout flag as the other sync cards */
  const URL = 'https://us-central1-fayna-trading.cloudfunctions.net/tradovateAuth';
  const AUTO_GAP = 10 * 60e3;
  const visible = () => OPEN_TO_ALL || (typeof currentUser !== 'undefined' && currentUser?.isAdmin === true);
  const esc = v => (typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, k) => { try { showToast(m, k, 5000); } catch (e) {} };
  const ago = ms => { if (!ms) return 'עדיין לא'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'עכשיו' : m < 60 ? `לפני ${m} דק׳` : m < 1440 ? `לפני ${Math.round(m / 60)} שע׳` : new Date(ms).toLocaleDateString('he-IL'); };
  const uid = () => (typeof currentUser !== 'undefined' && currentUser?.uid) || '';
  const lsKey = () => 'fayna_tv_auto_' + uid();

  let st = { loaded: false }, autoFor = '';

  async function call(action) {
    const u = window.firebase?.auth?.().currentUser; if (!u) throw new Error('צריך להיות מחובר');
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await u.getIdToken() }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || 'השרת לא זמין כרגע. נסה שוב בעוד כמה דקות.'); e.code = j.error; throw e; }
    return j;
  }
  async function refresh() {
    try { st = { ...(await call('status')), loaded: true }; }
    catch (e) { st = { loaded: true, configured: false }; } /* server not deployed: show nothing */
    render();
  }
  async function connect() {
    st.busy = true; render();
    try { const j = await call('start'); if (!/^https:\/\//.test(j.url || '')) throw new Error('לא התקבל קישור התחברות'); location.href = j.url; }
    catch (e) { st.err = e.message; st.busy = false; render(); }
  }
  async function syncNow(silent) {
    if (st.busy) return; st.busy = !silent; render();
    try {
      const j = await call('sync'); st = { ...st, ...j, err: '' };
      try { localStorage.setItem(lsKey(), String(Date.now())); } catch (e) {}
      if (!silent) toast(j.skipped === 'recent' ? 'הסנכרון האחרון היה לפני פחות משתי דקות.' : `סונכרן מ-Tradovate: ${j.result?.stored || 0} ביצועים חדשים.`, 'success');
    } catch (e) { if (!silent || e.code === 'reauth') st.err = e.message; if (e.code === 'reauth') st.needsReauth = true; }
    st.busy = false; render();
  }
  async function disconnect() {
    const ok = typeof customConfirm === 'function' ? await customConfirm('לנתק את Tradovate? העסקאות שכבר ביומן יישארו.', { danger: true, okText: 'נתק', cancelText: 'ביטול' }) : true;
    if (!ok) return;
    try { await call('disconnect'); st = { loaded: true, configured: true, connected: false }; toast('Tradovate נותק', 'success'); } catch (e) { st.err = e.message; }
    render();
  }

  function render() {
    const page = document.getElementById('pa-connections'); if (!page) return;
    let card = document.getElementById('ftv-card');
    if (!visible() || !st.loaded || !st.configured) { card?.remove(); return; }
    if (!card) {
      card = document.createElement('div'); card.className = 'pa-card'; card.id = 'ftv-card';
      (document.getElementById('fib-card') || document.getElementById('fys-card') || page.querySelector('.pa-page-title'))?.after(card);
      card.addEventListener('click', e => { const b = e.target.closest('[data-ftv]'); if (!b) return; ({ connect, sync: () => syncNow(false), off: disconnect })[b.dataset.ftv]?.(); });
    }
    const err = st.err ? `<p class="fib-err" role="alert">${esc(st.err)}</p>` : '';
    if (st.connected && !st.needsReauth) {
      card.innerHTML = `<div class="pa-card-title">Tradovate</div>
        <div class="fys-status" role="status"><span class="fys-dot ${st.lastSync && Date.now() - st.lastSync < 2 * 3600e3 ? 'on' : ''}"></span>סנכרון אחרון: ${esc(ago(st.lastSync))}${st.lastStored ? ` · ${st.lastStored} ביצועים חדשים` : ''}${st.accounts?.length ? ` · חשבונות <bdi dir="ltr">${esc(st.accounts.join(', '))}</bdi>` : ''}</div>
        <p class="fys-lead">העסקאות נמשכות לבד כל חצי שעה ובכל כניסה למערכת.</p>${err}
        <div class="fib-actions"><button type="button" class="fyc-primary" data-ftv="sync" ${st.busy ? 'disabled' : ''}>${st.busy ? 'מסנכרן…' : 'סנכרון עכשיו'}</button><button type="button" class="fyc-danger" data-ftv="off">ניתוק</button></div>`;
      return;
    }
    card.innerHTML = `<div class="pa-card-title">Tradovate</div>
      <p class="fys-lead">${st.needsReauth ? 'החיבור ל-Tradovate פג. מתחברים שוב בלחיצה אחת, והעסקאות ממשיכות מאותה נקודה.' : 'חיבור לקריאה בלבד: מאשרים פעם אחת באתר של Tradovate וחוזרים לכאן. לא צריך סיסמה אצלנו, ואי אפשר לבצע דרכו פקודות.'}</p>${err}
      <div class="fib-actions"><button type="button" class="fyc-primary" data-ftv="connect" ${st.busy ? 'disabled' : ''}>${st.busy ? 'מעביר ל-Tradovate…' : st.needsReauth ? 'התחברות מחדש' : 'חיבור Tradovate'}</button>${st.needsReauth ? '<button type="button" class="fyc-danger" data-ftv="off">ניתוק</button>' : ''}</div>`;
  }

  function tick() {
    const u = uid();
    if (!u) { if (autoFor) { autoFor = ''; st = { loaded: false }; } return; }
    try { if (_cloudReadyUid !== u) return; } catch (e) { return; }
    if (autoFor === u || !visible()) return;
    autoFor = u;
    refresh().then(() => {
      let last = 0; try { last = +localStorage.getItem(lsKey()) || 0; } catch (e) {}
      if (st.configured && st.connected && !st.needsReauth && Date.now() - Math.max(last, st.lastSync || 0) > AUTO_GAP) syncNow(true);
    });
  }
  /* back from Tradovate: ?tradovate=connected|failed */
  function returned() {
    const m = /[?&]tradovate=(connected|failed|unavailable)\b/.exec(location.search); if (!m) return;
    history.replaceState(null, '', location.pathname + location.hash);
    const msg = { connected: ['Tradovate חובר. העסקאות נכנסות ליומן עכשיו.', 'success'], failed: ['החיבור ל-Tradovate לא הושלם. אפשר לנסות שוב מההגדרות.', 'error'], unavailable: ['החיבור ל-Tradovate עדיין לא זמין.', 'info'] }[m[1]];
    const w = setInterval(() => { if (uid()) { clearInterval(w); toast(...msg); } }, 500); setTimeout(() => clearInterval(w), 30000);
  }
  function init() {
    returned();
    const tp = document.getElementById('tp-personal');
    if (tp) new MutationObserver(() => { if (tp.classList.contains('active')) render(); }).observe(tp, { attributes: true, attributeFilter: ['class'] });
    setInterval(tick, 2000); tick();
  }
  window.FaynaTradovate = Object.freeze({ refresh, syncNow });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
