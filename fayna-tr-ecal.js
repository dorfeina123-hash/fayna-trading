/* v104 — TradeReport-style economic calendar.
   A table view on top of the existing tab: impact and currency filters, last/this/next
   week, events grouped by day in the viewer's local time. It reads the same
   ForexFactory feed through the existing _ffFetch(); the alert schedule
   (_fetchEcalEvents/_scheduleTodayAlerts and its _ecalCache) is NOT touched, so the
   pop-up reminders before events keep working exactly as before.
   Filter choices are kept in localStorage as a per-viewer convenience. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const he = x => (window.FaynaEcalHe ? window.FaynaEcalHe.t(x) : x);
  const cname = c => (window.FaynaEcalHe ? window.FaynaEcalHe.country(c) : c);
  const UNIT = { K: 'אלף', M: 'מיליון', B: 'מיליארד', T: 'טריליון' };
  const val = v => { const m = /^(-?[\d.,]+)\s?([KMBT])$/i.exec(String(v || '').trim()); return m ? `${m[1]} ${UNIT[m[2].toUpperCase()]}` : (v || '—'); };
  const esc = v => (typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? ''));
  const KEY = 'fayna_ecal_full_v2', PREF = 'fayna_ecal_view_v1';
  const CUR = ['USD', 'EUR', 'GBP', 'AUD', 'JPY', 'CAD', 'CHF', 'NZD', 'CNY'];
  const CUR_COLOR = { USD: '#3b82f6', EUR: '#1d4ed8', GBP: '#be123c', AUD: '#0f766e', JPY: '#dc2626', CAD: '#ef4444', CHF: '#e11d48', NZD: '#111827', CNY: '#b91c1c' };
  const IMP = [['Low', 'נמוכה'], ['Medium', 'בינונית'], ['High', 'גבוהה']];
  const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  /* ForexFactory publishes only the current week; last week comes from our hourly mirror. */
  const WEEKS = [['lastweek', 'שבוע שעבר'], ['thisweek', 'שבוע נוכחי']];
  let pref = { imp: ['High'], cur: ['USD'], week: 'thisweek' };
  try { pref = { ...pref, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch (e) {}
  if (!WEEKS.some(w => w[0] === pref.week)) pref.week = 'thisweek';
  const save = () => { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) {} };
  let data = {}, loading = {}, dayPick = 'all'; /* day filter: 'all' or a local YYYY-MM-DD */
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const parse = d => (typeof _ffParseDate === 'function' ? _ffParseDate(d) : new Date(d));
  const effImp = ev => (typeof ecalEffectiveImpact === 'function' && ev.impact !== 'Holiday' ? ecalEffectiveImpact(ev) : ev.impact);
  async function load(week) {
    const today = (typeof _localToday === 'function' ? _localToday() : new Date().toISOString().slice(0, 10));
    if (data[week]) return data[week];
    try { const c = JSON.parse(localStorage.getItem(KEY) || '{}'); if (c.day === today && Array.isArray(c[week])) return (data[week] = c[week]); } catch (e) {}
    if (loading[week]) return loading[week];
    loading[week] = (async () => {
      let list = [];
      try { list = typeof _ffFetch === 'function' ? await _ffFetch(week) : []; } catch (e) { list = []; }
      const seen = new Set();
      list = (list || []).filter(ev => { const k = ev.date + ev.title + ev.country; if (seen.has(k)) return false; seen.add(k); return true; })
        .map(ev => ({ t: ev.title, c: ev.country, i: ev.impact, raw: String(ev.date || ''), d: (parse(ev.date) || new Date(ev.date)).toISOString(), f: ev.forecast || '', p: ev.previous || '', a: ev.actual || '' }));
      if (list.length) { data[week] = list; try { const c = JSON.parse(localStorage.getItem(KEY) || '{}'); const next = c.day === today ? c : { day: today }; next[week] = list; localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {} }
      loading[week] = null;
      return list;
    })();
    return loading[week];
  }

  function rowsFor(list) {
    return list.filter(ev => (dayPick === 'all' || ymd(new Date(ev.d)) === dayPick) && pref.cur.includes(ev.c) && (ev.i === 'Holiday' ? pref.imp.includes('High') : pref.imp.includes(effImp({ title: ev.t, impact: ev.i }))))
      .sort((a, b) => a.d.localeCompare(b.d));
  }
  const two = n => String(n).padStart(2, '0');
  function table(list) {
    const rows = rowsFor(list);
    if (!rows.length) return `<div class="tre-empty">${list.length ? 'אין אירועים שמתאימים לסינון. נסו להוסיף רמת השפעה או מדינה.' : (pref.week === 'lastweek' ? 'הנתונים של השבוע שעבר עדיין לא נשמרו. הם יופיעו כאן מהשבוע הבא.' : 'לא הצלחנו לטעון את היומן כרגע. לחצו על רענון או נסו שוב בעוד כמה דקות.')}</div>`;
    const now = Date.now(); let next = rows.find(r => new Date(r.d).getTime() > now && r.i !== 'Holiday');
    let html = '', day = '';
    rows.forEach(r => {
      const d = new Date(r.d), key = d.toDateString();
      if (key !== day) { day = key; const isToday = key === new Date().toDateString(); html += `<tr class="tre-day${isToday ? ' today' : ''}"><td colspan="7">${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} · ${DAYS[d.getDay()]}${isToday ? ' <b>היום</b>' : ''}</td></tr>`; }
      const allDay = r.i === 'Holiday' || /T00:00(:00)?/.test(r.raw || '');
      const imp = r.i === 'Holiday' ? 'Holiday' : effImp({ title: r.t, impact: r.i });
      const label = imp === 'Holiday' ? 'חג' : (IMP.find(x => x[0] === imp) || ['', imp])[1];
      const past = d.getTime() < now && !allDay;
      html += `<tr class="${past ? 'past' : ''}${r === next ? ' next' : ''}"><td class="tre-time">${allDay ? 'כל היום' : two(d.getHours()) + ':' + two(d.getMinutes())}${r === next ? '<small>הבא בתור</small>' : ''}</td>
        <td><span class="tre-cur" title="${esc(r.c)}"><i style="background:${CUR_COLOR[r.c] || '#64748b'}"></i>${esc(cname(r.c))}</span></td>
        <td><span class="tre-imp tre-${esc(imp)}">${label}</span></td>
        <td class="tre-title">${(() => { const h = he(r.t); return h !== r.t ? `<b>${esc(h)}</b><small dir="ltr">${esc(r.t)}</small>` : `<b dir="ltr">${esc(r.t)}</b>`; })()}</td>
        <td>${esc(val(r.p))}</td><td>${esc(val(r.f))}</td><td class="tre-act">${esc(val(r.a))}</td></tr>`;
    });
    return `<div class="tre-scroll"><table class="tre-table"><thead><tr><th>שעה</th><th>מדינה</th><th>השפעה</th><th>אירוע</th><th>קודם</th><th>תחזית</th><th>בפועל</th></tr></thead><tbody>${html}</tbody></table></div>`;
  }
  /* one chip per day that has events this week, plus the whole week */
  function days(list) {
    const set = [...new Set(list.map(ev => ymd(new Date(ev.d))))].sort();
    if (!set.length) return '';
    if (dayPick !== 'all' && !set.includes(dayPick)) dayPick = 'all';
    const today = ymd(new Date());
    const chip = (v, l) => `<button type="button" role="tab" data-tre-day="${v}" aria-selected="${dayPick === v}">${l}</button>`;
    return `<div class="tre-days" role="tablist" aria-label="יום">${chip('all', 'כל השבוע')}${set.map(v => { const d = new Date(v + 'T12:00:00'); return chip(v, (v === today ? 'היום · ' : '') + DAYS[d.getDay()] + ' ' + two(d.getDate()) + '/' + two(d.getMonth() + 1)); }).join('')}</div>`;
  }
  async function render() {
    const tp = document.getElementById('tp-ecal'); if (!tp) return;
    let root = document.getElementById('tre-root');
    if (!root) {
      const legacy = document.createElement('details'); legacy.className = 'simple-details tre-legacy';
      legacy.innerHTML = '<summary>יומן כלכלי של Investing.com בעברית ואירועים חשובים (תצוגה קודמת)</summary>';
      while (tp.firstChild) legacy.appendChild(tp.firstChild);
      root = document.createElement('div'); root.id = 'tre-root';
      tp.appendChild(root); tp.appendChild(legacy);
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-tre-imp],[data-tre-cur],[data-tre-week],[data-tre-refresh],[data-tre-day]'); if (!b) return;
        if (b.dataset.treDay) { dayPick = b.dataset.treDay; const box = root.querySelector('.tre-card'); if (box) box.innerHTML = days(data[pref.week] || []) + table(data[pref.week] || []); return; }
        if (b.dataset.treImp) { const v = b.dataset.treImp; pref.imp = pref.imp.includes(v) ? pref.imp.filter(x => x !== v) : [...pref.imp, v]; }
        else if (b.dataset.treCur) { const v = b.dataset.treCur; pref.cur = pref.cur.includes(v) ? pref.cur.filter(x => x !== v) : [...pref.cur, v]; }
        else if (b.dataset.treWeek) { if (pref.week !== b.dataset.treWeek) dayPick = 'all'; pref.week = b.dataset.treWeek; }
        else if (b.dataset.treRefresh !== undefined) { data = {}; try { localStorage.removeItem(KEY); } catch (er) {} }
        save(); render();
      });
    }
    const alerts = typeof ecalMinImpact === 'function' ? { High: 'גבוהה בלבד', Medium: 'בינונית וגבוהה', Low: 'כל הרמות' }[ecalMinImpact()] : '';
    root.innerHTML = `<header class="tre-head"><div><h1>יומן כלכלי</h1><p>אירועים כלכליים לפי השפעה ומדינה, בשעון שלך</p></div><button type="button" class="trx-ib" data-tre-refresh title="רענון" aria-label="רענון היומן"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button></header>
      <section class="tre-filters"><div class="tre-fgroup"><span>השפעה</span><div class="tre-seg tre-imps">${IMP.map(([v, l]) => `<button type="button" data-tre-imp="${v}" aria-pressed="${pref.imp.includes(v)}"><i class="tre-dot tre-${v}"></i>${l}</button>`).join('')}</div></div>
        <div class="tre-fgroup"><span>מדינות</span><div class="tre-seg tre-curs">${CUR.map(c => `<button type="button" data-tre-cur="${c}" aria-pressed="${pref.cur.includes(c)}" title="${c}"><i style="background:${CUR_COLOR[c]}"></i>${esc(cname(c))}</button>`).join('')}</div></div></section>
      <div class="tre-weeks" role="tablist" aria-label="שבוע">${WEEKS.map(([v, l]) => `<button type="button" role="tab" data-tre-week="${v}" aria-selected="${pref.week === v}">${l}</button>`).join('')}</div>
      <section class="tre-card" aria-live="polite"><div class="tre-loading">טוען אירועים…</div></section>
      <p class="tre-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>התראות קופצות לפני אירועים בארה״ב נשארות פעילות (15, 10 ו-5 דקות לפני)${alerts ? ' · רמת השפעה להתראות: ' + alerts : ''}.</p>`;
    const week = pref.week, list = await load(week);
    if (pref.week !== week) return;
    const box = root.querySelector('.tre-card'); if (box) box.innerHTML = days(list || []) + table(list || []);
  }
  function watch() {
    const tp = document.getElementById('tp-ecal'); if (!tp) return;
    const check = () => { if (tp.classList.contains('active')) render(); };
    new MutationObserver(check).observe(tp, { attributes: true, attributeFilter: ['class'] });
    check();
  }
  window.FaynaEcal = Object.freeze({ render });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
