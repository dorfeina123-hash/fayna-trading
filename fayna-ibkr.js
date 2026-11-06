/* v119 — Interactive Brokers connection card (Settings → Connections).
   The trader pastes a Flex Web Service token and a Flex Query ID once. The server
   (functions/ibkr.cjs) stores the token encrypted, pulls executions every hour and on
   every login, and writes them to users/{uid}/syncFills, where fayna-sync.js turns
   them into journal trades exactly like the platform add-ons. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const OPEN_TO_ALL = false; /* same rollout flag as the add-on card */
  const URL = 'https://us-central1-fayna-trading.cloudfunctions.net/ibkrSync';
  const AUTO_GAP = 10 * 60e3;
  const visible = () => OPEN_TO_ALL || (typeof currentUser !== 'undefined' && currentUser?.isAdmin === true);
  const esc = v => (typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, k) => { try { showToast(m, k, 5000); } catch (e) {} };
  const ago = ms => { if (!ms) return 'עדיין לא'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'עכשיו' : m < 60 ? `לפני ${m} דק׳` : m < 1440 ? `לפני ${Math.round(m / 60)} שע׳` : new Date(ms).toLocaleDateString('he-IL'); };
  const uid = () => (typeof currentUser !== 'undefined' && currentUser?.uid) || '';
  const lsKey = () => 'fayna_ibkr_auto_' + uid();

  let st = { loaded: false, connected: false, busy: false, err: '' }, autoFor = '';

  async function call(action, extra = {}) {
    const u = window.firebase?.auth?.().currentUser; if (!u) throw Object.assign(new Error('signed_out'), { message: 'צריך להיות מחובר' });
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await u.getIdToken() }, body: JSON.stringify({ action, ...extra }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || 'השרת לא זמין כרגע. נסה שוב בעוד כמה דקות.'); e.code = j.error; e.status = r.status; throw e; }
    return j;
  }
  async function refresh() {
    try { const j = await call('status'); st = { ...st, ...j, loaded: true, err: '' }; }
    catch (e) { st = { ...st, loaded: true, err: e.status === 503 || e.status === 404 || !e.status ? 'החיבור ל-IBKR יופעל אחרי העלאת השרת.' : e.message }; }
    render();
  }
  async function connect(token, queryId) {
    st.busy = true; render();
    try {
      const j = await call('connect', { token, queryId, tz: 'America/New_York' });
      st = { ...st, ...j, err: '' };
      toast(`IBKR חובר. נמצאו ${j.result?.found || 0} ביצועים, הם נכנסים ליומן עכשיו.`, 'success');
    } catch (e) { st.err = e.message; }
    st.busy = false; render();
  }
  async function syncNow(silent) {
    if (st.busy) return; st.busy = !silent; render();
    try {
      const j = await call('sync'); st = { ...st, ...j, err: '' };
      try { localStorage.setItem(lsKey(), String(Date.now())); } catch (e) {}
      if (!silent) toast(j.skipped === 'recent' ? 'הסנכרון האחרון היה לפני פחות משתי דקות.' : `סונכרן מ-IBKR: ${j.result?.stored || 0} ביצועים חדשים.`, 'success');
    } catch (e) { if (!silent) st.err = e.message; }
    st.busy = false; render();
  }
  async function disconnect() {
    const ok = typeof customConfirm === 'function' ? await customConfirm('לנתק את Interactive Brokers? העסקאות שכבר ביומן יישארו.', { danger: true, okText: 'נתק', cancelText: 'ביטול' }) : true;
    if (!ok) return;
    try { await call('disconnect'); st = { loaded: true, connected: false, busy: false, err: '' }; toast('IBKR נותק', 'success'); } catch (e) { st.err = e.message; }
    render();
  }

  function render() {
    const page = document.getElementById('pa-connections'); if (!page) return;
    let card = document.getElementById('fib-card');
    if (!visible()) { card?.remove(); return; }
    if (!card) {
      card = document.createElement('div'); card.className = 'pa-card'; card.id = 'fib-card';
      (document.getElementById('fys-card') || page.querySelector('.pa-page-title'))?.after(card);
      card.addEventListener('submit', e => {
        e.preventDefault();
        const t = card.querySelector('#fib-token').value.replace(/\s+/g, ''), q = card.querySelector('#fib-query').value.trim();
        if (!t || !q) { st.err = 'צריך להדביק גם את קוד הגישה וגם את מספר השאילתה.'; render(); return; }
        connect(t, q);
      });
      card.addEventListener('click', e => { const b = e.target.closest('[data-fib]'); if (!b) return; if (b.dataset.fib === 'sync') syncNow(false); if (b.dataset.fib === 'off') disconnect(); });
    }
    if (!st.loaded) { card.innerHTML = '<div class="pa-card-title">Interactive Brokers</div><p class="fys-lead">טוען…</p>'; return; }
    const err = st.err ? `<p class="fib-err" role="alert">${esc(st.err)}</p>` : '';
    if (st.connected) {
      card.innerHTML = `<div class="pa-card-title">Interactive Brokers</div>
        <div class="fys-status" role="status"><span class="fys-dot ${st.lastSync && Date.now() - st.lastSync < 2 * 3600e3 ? 'on' : ''}"></span>סנכרון אחרון: ${esc(ago(st.lastSync))}${st.lastStored ? ` · ${st.lastStored} ביצועים חדשים` : ''}${st.accounts?.length ? ` · חשבונות <bdi dir="ltr">${esc(st.accounts.join(', '))}</bdi>` : ''}</div>
        <p class="fys-lead">העסקאות נמשכות לבד כל שעה ובכל כניסה למערכת. IBKR מעדכנים את הדוח פעם ביום אחרי סגירת המסחר, כך שעסקאות של היום מופיעות למחרת.</p>
        ${st.lastError ? `<p class="fib-err">הסנכרון האחרון נכשל. אם זה חוזר, ייתכן שקוד הגישה פג תוקף.</p>` : ''}${err}
        <div class="fib-actions"><button type="button" class="fyc-primary" data-fib="sync" ${st.busy ? 'disabled' : ''}>${st.busy ? 'מסנכרן…' : 'סנכרון עכשיו'}</button><button type="button" class="fyc-danger" data-fib="off">ניתוק</button></div>`;
      return;
    }
    card.innerHTML = `<div class="pa-card-title">Interactive Brokers</div>
      <p class="fys-lead">חיבור לקריאה בלבד דרך דוחות ה-Flex של IBKR. לא צריך סיסמה, ואי אפשר לבצע דרכו פקודות.</p>
      <details class="fib-how"><summary>איך יוצרים את שני הקודים (פעם אחת, כ-3 דקות)</summary><ol class="fys-steps">
        <li>נכנסים ל-<bdi>IBKR Client Portal</bdi>, ושם ל-<bdi>Performance &amp; Reports</bdi> ואז <bdi>Flex Queries</bdi>.</li>
        <li>ליד <bdi>Activity Flex Query</bdi> לוחצים על הפלוס ונותנים שם, למשל Fayna. בחלק <bdi>Sections</bdi> בוחרים <bdi>Trades</bdi> ומסמנים את כל השדות. בפורמט בוחרים <bdi>XML</bdi>, ובתקופה <bdi>Last 365 Calendar Days</bdi>. שומרים.</li>
        <li>לוחצים על סמל ה-i ליד השאילתה ומעתיקים את ה-<bdi>Query ID</bdi>.</li>
        <li>ב-<bdi>Settings</bdi> ואז <bdi>Account Settings</bdi>, בחלק <bdi>Reporting</bdi>, פותחים את <bdi>Flex Web Service</bdi>, מפעילים ויוצרים <bdi>Token</bdi> לתוקף של שנה. מעתיקים אותו.</li>
      </ol></details>
      <form class="fib-form" novalidate>
        <label for="fib-token">קוד גישה (Flex Web Service Token)</label><input id="fib-token" inputmode="numeric" autocomplete="off" dir="ltr" placeholder="1234567890123456789012345">
        <label for="fib-query">מספר שאילתה (Query ID)</label><input id="fib-query" inputmode="numeric" autocomplete="off" dir="ltr" placeholder="987654">
        ${err}<button type="submit" class="fyc-primary" ${st.busy ? 'disabled' : ''}>${st.busy ? 'מתחבר ומושך עסקאות…' : 'חיבור IBKR'}</button>
      </form>`;
  }

  /* on every login: once the user's data is in, ask the server for new executions */
  function tick() {
    const u = uid();
    if (!u) { if (autoFor) { autoFor = ''; st = { loaded: false, connected: false, busy: false, err: '' }; } return; }
    try { if (_cloudReadyUid !== u) return; } catch (e) { return; }
    if (autoFor === u) return;
    autoFor = u;
    refresh().then(() => {
      let last = 0; try { last = +localStorage.getItem(lsKey()) || 0; } catch (e) {}
      if (st.connected && Date.now() - Math.max(last, st.lastSync || 0) > AUTO_GAP) syncNow(true);
    });
  }
  function init() {
    const tp = document.getElementById('tp-personal');
    if (tp) new MutationObserver(() => { if (tp.classList.contains('active')) render(); }).observe(tp, { attributes: true, attributeFilter: ['class'] });
    setInterval(tick, 2000); tick();
  }
  window.FaynaIbkr = Object.freeze({ refresh, syncNow });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
