/* Admin panel layout: tabs and a visual overview. The existing sections keep their ids and
   handlers; they are moved into tabs here, so nothing the panel saves or reads changes. */
window.FaynaAdmin = (() => {
  const TABS = [['overview', 'סקירה'], ['users', 'משתמשים'], ['comms', 'תקשורת'], ['plans', 'מנויים ותשלום'], ['system', 'מערכת']];
  let current = 'overview', organized = false;
  const esc = v => escHtml(String(v ?? ''));
  const time = v => (v?.toDate ? v.toDate() : new Date(v || 0)).getTime();

  function organize() {
    const root = document.getElementById('tp-admin');
    if (organized || !root) return;
    organized = true;
    const nav = document.createElement('nav');
    nav.className = 'adm-tabs';
    nav.setAttribute('aria-label', 'אזורי ניהול');
    nav.innerHTML = TABS.map(([id, label]) => `<button type="button" data-adm-tab="${id}">${label}</button>`).join('');
    const panels = document.createElement('div');
    panels.innerHTML = TABS.map(([id]) => `<section class="adm-panel" data-adm-panel="${id}" hidden></section>`).join('');
    const overview = panels.querySelector('[data-adm-panel="overview"]');
    overview.innerHTML = '<div class="adm-attention" id="adm-attention"></div><div class="adm-visuals"><section class="admin-section"><div class="admin-section-title">הרשמות ב־30 הימים האחרונים</div><div id="adm-signups"></div></section><section class="admin-section"><div class="admin-section-title">משתמשים לפי חבילה</div><div id="adm-plan-bars"></div></section></div>';
    root.querySelectorAll('[data-admin-tab]').forEach(el => {
      const panel = panels.querySelector(`[data-adm-panel="${el.dataset.adminTab}"]`);
      if (el.dataset.adminTitle) {
        const box = document.createElement('section');
        box.className = 'admin-section';
        box.innerHTML = `<div class="admin-section-title">${esc(el.dataset.adminTitle)}</div>`;
        box.appendChild(el);
        el.style.cssText = '';
        panel.appendChild(box);
      } else panel.appendChild(el);
    });
    root.querySelectorAll('[data-admin-old]').forEach(el => {
      const box = document.createElement('details');
      box.className = 'adm-old';
      box.innerHTML = `<summary>${esc(el.dataset.adminOld)}</summary>`;
      el.replaceWith(box);
      box.appendChild(el);
    });
    root.querySelectorAll('[data-admin-empty]').forEach(el => el.remove());
    document.getElementById('admin-metrics')?.setAttribute('hidden', '');
    const heading = root.querySelector('[data-admin-head]');
    heading.after(nav, panels);
    nav.addEventListener('click', e => { const b = e.target.closest('[data-adm-tab]'); if (b) show(b.dataset.admTab); });
    show(current);
  }

  function show(tab) {
    current = tab;
    document.querySelectorAll('[data-adm-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.admTab === tab));
    document.querySelectorAll('[data-adm-panel]').forEach(p => { p.hidden = p.dataset.admPanel !== tab; });
    // Chart.js cannot measure a hidden canvas, so the chart is drawn when its tab opens.
    if (tab === 'overview' && typeof renderAdminActivityChart === 'function') renderAdminActivityChart();
  }

  function openUsers(filter) {
    show('users');
    const button = document.querySelector(`[data-uf="${filter}"]`);
    if (button) setUserFilter(filter, button);
  }

  function attention(users) {
    const now = Date.now(), week = 7 * 864e5;
    const items = [
      [users.filter(u => u.status === 'pending').length, 'ממתינים לאישור', 'pending'],
      [users.filter(u => u.cancelAtPeriodEnd === true).length, 'ביקשו ביטול מנוי', 'all'],
      [users.filter(u => { const end = time(u.planExpiresAt); return u.planExpiresAt && end > now && end - now < week; }).length, 'מנוי מסתיים תוך שבוע', 'all'],
      [users.filter(u => u.status === 'blocked').length, 'חסומים', 'blocked'],
    ].filter(([n]) => n);
    const waitlist = Number(window._adminWaitlistCount) || 0;
    const el = document.getElementById('adm-attention');
    if (!el) return;
    el.innerHTML = (items.length || waitlist) ? '<h2>דורש תשומת לב</h2><div>' + items.map(([n, label, filter]) => `<button type="button" onclick="FaynaAdmin.openUsers('${filter}')"><b>${n}</b>${esc(label)}</button>`).join('') + (waitlist ? `<span><b>${waitlist}</b>ברשימת המתנה</span>` : '') + '</div>' : '<p>✓ אין כרגע משתמשים שדורשים טיפול.</p>';
  }

  function signups(users) {
    const el = document.getElementById('adm-signups');
    if (!el) return;
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 29 + i); return { key: d.getTime(), label: d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }), n: 0 }; });
    users.forEach(u => { const d = new Date(time(u.registeredAt)); d.setHours(0, 0, 0, 0); const day = days.find(x => x.key === d.getTime()); if (day) day.n++; });
    const max = Math.max(...days.map(d => d.n), 1), total = days.reduce((s, d) => s + d.n, 0);
    el.innerHTML = `<div class="adm-bars" role="img" aria-label="${total} הרשמות ב־30 ימים">${days.map(d => `<i style="height:${Math.max(d.n / max * 100, 2)}%" title="${esc(d.label)}: ${d.n}"></i>`).join('')}</div><p class="adm-caption">${total} הרשמות · שיא יומי ${days.reduce((m, d) => Math.max(m, d.n), 0)}</p>`;
  }

  function plans(users) {
    const el = document.getElementById('adm-plan-bars');
    if (!el) return;
    const rows = PLAN_ORDER.map(p => [PLAN_META[p].label, users.filter(u => _normPlan(u.plan) === p).length]);
    const max = Math.max(...rows.map(r => r[1]), 1);
    el.innerHTML = rows.map(([label, n]) => `<div class="adm-plan"><span>${esc(label)}</span><div><i style="width:${n / max * 100}%"></i></div><b>${n}</b></div>`).join('');
  }

  async function refresh() {
    let users = (_adminUsersCache && _adminUsersCache.length) ? _adminUsersCache : await _getUsers(); if (!Array.isArray(users)) users = [];
    attention(users); signups(users); plans(users);
    show(current);
  }

  return { organize, refresh, show, openUsers };
})();
