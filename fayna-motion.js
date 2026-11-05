/* v116 — motion for the home dashboard.
   One load sequence the first time the home screen is shown in a visit: cards rise in
   turn, the KPI numbers count up, the cumulative curve is revealed left to right, the
   daily bars grow out of the zero line, the gauges and the score shape fill, and the
   calendar days appear. Later re-renders (period, account, month) are not animated.
   Pure presentation: it reads the rendered DOM and never touches data. Respects
   prefers-reduced-motion. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let played = false;

  const NUM = /^([+\-−]?)(\$|₪)?([\d,]+(?:\.\d+)?)(%|[kKM])?$/;
  function countUp(el, delay) {
    const final = el.textContent, m = NUM.exec(final.trim());
    if (!m) return;
    const to = parseFloat(m[3].replace(/,/g, '')), dec = (m[3].split('.')[1] || '').length, grouped = m[3].includes(',');
    if (!isFinite(to) || to === 0) return;
    const start = performance.now() + delay, dur = 1300;
    (function tick(t) {
      const k = Math.min(1, Math.max(0, (t - start) / dur)), e = 1 - Math.pow(1 - k, 4);
      if (k >= 1) { el.textContent = final; return; }
      const v = to * e;
      el.textContent = m[1] + (m[2] || '') + (grouped ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec)) + (m[4] || '');
      requestAnimationFrame(tick);
    })(performance.now());
  }

  function play(root) {
    root.classList.remove('fm-intro'); void root.offsetWidth; root.classList.add('fm-intro');
    let i = 0;
    root.querySelectorAll('.fy-onboarding, .trh-kpis > .trh-card, .trh-charts > .trh-card, .trh-lower > .trh-card').forEach(c => c.style.setProperty('--fm-i', i++));
    root.querySelectorAll('.trh-kpi strong').forEach((el, n) => countUp(el, 250 + n * 90));
    /* cumulative curve: reveal the whole chart left to right */
    root.querySelectorAll('.trh-plot svg').forEach(svg => {
      if (!svg.querySelector('polyline')) return;
      svg.classList.add('fm-reveal');
    });
    /* daily bars grow from the zero line */
    root.querySelectorAll('.trh-plot svg rect.trh-up, .trh-plot svg rect.trh-down').forEach((r, n) => {
      r.classList.add('fm-bar'); r.style.setProperty('--fm-b', n);
    });
    /* gauges */
    root.querySelectorAll('.trh-gauge path').forEach((p, n) => {
      p.setAttribute('pathLength', '1'); p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1';
      p.getBoundingClientRect();
      p.style.transition = `stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1) ${400 + (n % 3) * 180}ms`;
      p.style.strokeDashoffset = '0';
    });
    root.querySelectorAll('.trh-radar .trh-area').forEach(a => a.classList.add('fm-grow'));
    root.querySelectorAll('.trh-day').forEach((d, n) => d.style.setProperty('--fm-d', n));
    root.querySelectorAll('.trh-trade').forEach((t, n) => t.style.setProperty('--fm-t', n));
    setTimeout(() => root.classList.remove('fm-intro'), 2800);
  }

  function check() {
    if (played) return;
    const root = document.getElementById('home-dashboard');
    if (!root || !root.querySelector('.trh-kpis') || root.offsetParent === null) return;
    /* only for a signed-in user, once their own data has loaded (never behind the landing page) */
    try { if (typeof currentUser === 'undefined' || !currentUser?.uid || _cloudReadyUid !== currentUser.uid) return; } catch (e) { return; }
    const auth = document.getElementById('auth-screen'); if (auth && getComputedStyle(auth).display !== 'none') return;
    /* start only once the dashboard stopped re-rendering for a moment */
    if (Date.now() - lastMutation < 350) return;
    played = true;
    if (RM.matches) return;
    play(root);
  }
  let lastMutation = 0;

  function boot() {
    const root = document.getElementById('home-dashboard');
    if (root && window.MutationObserver) new MutationObserver(() => { lastMutation = Date.now(); }).observe(root, { childList: true });
    const t = setInterval(() => { check(); if (played) clearInterval(t); }, 150);
  }
  window.FaynaMotion = Object.freeze({ replay() { const r = document.getElementById('home-dashboard'); if (r && !RM.matches) play(r); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
