/* v103 — TradeReport-style business management summary.
   Wraps financeRender(): on the summary view the KPI strip is replaced by four cards and
   three charts (monthly income vs expenses, expense structure, profitability status).
   Every number comes from financeCombinedRows()/financeTotals()/financeBreakdown(), the
   same functions the page already uses, so nothing is counted twice. Read-only. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const esc = v => (typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? ''));
  const cur = () => (typeof financeCurrency !== 'undefined' && financeCurrency === 'ILS' ? '₪' : '$');
  const fm = n => { const v = Number(n) || 0; return (v < 0 ? '-' : '') + cur() + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const short = n => { const a = Math.abs(n), s = n < 0 ? '-' : ''; return s + cur() + (a >= 1000 ? (a / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(a)); };
  const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
  const PALETTE = ['#a855f7', '#f45050', '#f59e0b', '#38bdf8', '#4ade80', '#ec4899', '#94a3b8', '#14b8a6'];
  const ICO = {
    bal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v12H3zM16 13h2M3 7l3-4h12l3 4"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/></svg>',
    pct: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>'
  };

  /* rows for every month of the selected year, read with the page's own functions */
  function yearRows() {
    const keep = financeRange;
    try { financeRange = 'year'; return financeCombinedRows(); } catch (e) { return []; } finally { financeRange = keep; }
  }
  function monthly(rows) {
    const out = MONTHS.map(() => ({ inc: 0, exp: 0 }));
    rows.forEach(e => { const m = +String(e.date || '').slice(5, 7) - 1; if (m < 0 || m > 11) return; if (e.type === 'income') out[m].inc += +e.amount || 0; else if (e.type === 'expense') out[m].exp += +e.amount || 0; });
    return out;
  }
  function barsChart(data) {
    const max = Math.max(1, ...data.flatMap(d => [d.inc, d.exp]));
    if (!data.some(d => d.inc || d.exp)) return empty('עדיין אין רשומות בשנה הזו', 'bars');
    const now = new Date(), y = financeDate.getFullYear();
    return `<div class="trb-mbars">${data.map((d, i) => `<div class="trb-mcol${y === now.getFullYear() && i === now.getMonth() ? ' now' : ''}" title="${MONTHS[i]}: הכנסות ${esc(fm(d.inc))} · הוצאות ${esc(fm(d.exp))}"><div class="trb-mplot"><i class="inc" style="height:${(d.inc / max * 100).toFixed(1)}%"></i><i class="exp" style="height:${(d.exp / max * 100).toFixed(1)}%"></i></div><span>${MONTHS[i]}</span></div>`).join('')}</div>`;
  }
  function donut(rows) {
    const cats = new Map();
    rows.filter(e => e.type === 'expense').forEach(e => { const k = e.category || (e.wdFee ? 'עמלות משיכה' : 'כללי'); cats.set(k, (cats.get(k) || 0) + (+e.amount || 0)); });
    const list = [...cats].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!list.length) return empty('עדיין אין הוצאות', 'donut');
    const top = list.slice(0, 6), rest = list.slice(6).reduce((s, [, v]) => s + v, 0); if (rest) top.push(['אחר', rest]);
    const total = top.reduce((s, [, v]) => s + v, 0), R = 54, C = 2 * Math.PI * R; let off = 0;
    const arcs = top.map(([k, v], i) => { const len = v / total * C; const a = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="20" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(k)}: ${esc(fm(v))}</title></circle>`; off += len; return a; }).join('');
    return `<div class="trb-donut"><svg viewBox="0 0 140 140" role="img" aria-label="מבנה ההוצאות לפי קטגוריה"><g transform="rotate(-90 70 70)">${arcs}</g><text x="70" y="66" text-anchor="middle" class="trb-dt">סה״כ</text><text x="70" y="84" text-anchor="middle" class="trb-dv">${esc(short(total))}</text></svg><ul>${top.map(([k, v], i) => `<li><i style="background:${PALETTE[i % PALETTE.length]}"></i><span>${esc(k)}</span><b dir="ltr">${esc(short(v))}</b><small>${Math.round(v / total * 100)}%</small></li>`).join('')}</ul></div>`;
  }
  function status(total) {
    const inc = total.income, exp = total.expense;
    if (!inc && !exp) return empty('עדיין אין רשומות', 'scale');
    const state = total.net > 0 ? ['רווחי', 'cg', 'ההכנסות גבוהות מההוצאות'] : total.net < 0 ? ['בהפסד', 'cr', 'ההוצאות גבוהות מההכנסות'] : ['באיזון', '', 'ההכנסות שוות להוצאות'];
    const max = Math.max(inc, exp, 1), per = exp ? inc / exp : null;
    return `<div class="trb-status"><div class="trb-badge ${state[1]}">${state[0]}</div><p>${state[2]}</p>
      <div class="trb-vs"><div><span>הכנסות</span><b class="cg" dir="ltr">${esc(fm(inc))}</b></div><div class="trb-meter"><i class="inc" style="width:${(inc / max * 100).toFixed(1)}%"></i></div>
      <div><span>הוצאות</span><b class="cr" dir="ltr">${esc(fm(exp))}</b></div><div class="trb-meter"><i class="exp" style="width:${(exp / max * 100).toFixed(1)}%"></i></div></div>
      ${per !== null ? `<small>על כל ${cur()}1 הוצאה נכנסו <b dir="ltr">${cur()}${per.toFixed(2)}</b></small>` : ''}</div>`;
  }
  function empty(text, kind) {
    const art = { bars: '<path d="M6 34V20M14 34V12M22 34V24M30 34V8"/>', donut: '<circle cx="20" cy="20" r="13"/><circle cx="20" cy="20" r="5"/>', scale: '<path d="M20 6v28M8 34h24M8 12h24M8 12l-5 10h10zM32 12l-5 10h10z"/>' }[kind];
    return `<div class="trb-empty"><svg viewBox="0 0 40 40" aria-hidden="true">${art}</svg><p>${text}</p></div>`;
  }
  function dashboard() {
    const rows = financeCombinedRows(), total = financeTotals(rows), brk = financeBreakdown(rows);
    const roi = total.expense ? total.net / total.expense * 100 : null, y = financeDate.getFullYear();
    const card = (icon, label, value, cls, sub) => `<div class="trb-kcard"><div class="trb-khead"><span>${label}</span><i>${icon}</i></div><b class="${cls}" dir="ltr">${value}</b><small>${sub}</small></div>`;
    return `<div class="trb-dash">
      <div class="trb-kgrid">
        ${card(ICO.bal, 'סה״כ רווח והפסד', esc(fm(total.net)), total.net > 0 ? 'cg' : total.net < 0 ? 'cr' : '', total.net > 0 ? 'ברווח' : total.net < 0 ? 'בהפסד' : 'בנקודת איזון')}
        ${card(ICO.up, 'סה״כ הכנסות', esc(fm(total.income)), 'cg', brk.wd ? `מתוכן משיכות ${esc(fm(brk.wd))}` : `${rows.filter(e => e.type === 'income').length} רשומות`)}
        ${card(ICO.down, 'סה״כ הוצאות', esc(fm(total.expense)), 'cr', brk.fee ? `כולל עמלות משיכה ${esc(fm(brk.fee))}` : `${rows.filter(e => e.type === 'expense').length} רשומות`)}
        ${card(ICO.pct, 'תשואה', roi === null ? '—' : (roi > 0 ? '+' : '') + roi.toFixed(1) + '%', roi > 0 ? 'cg' : roi < 0 ? 'cr' : '', 'רווח נקי חלקי הוצאות')}
      </div>
      <div class="trb-cgrid">
        <section class="trb-ccard trb-wide"><div class="trb-chead"><h2>הכנסות מול הוצאות · ${y}</h2><div class="trb-legend"><span><i class="inc"></i>הכנסות ומשיכות</span><span><i class="exp"></i>הוצאות</span></div></div>${barsChart(monthly(yearRows()))}</section>
        <section class="trb-ccard"><div class="trb-chead"><h2>מבנה הוצאות</h2></div>${donut(rows)}</section>
        <section class="trb-ccard"><div class="trb-chead"><h2>סטטוס רווחיות</h2></div>${status(total)}</section>
      </div></div>`;
  }
  function install() {
    const prev = window.financeRender;
    if (typeof prev !== 'function' || prev._trb) return;
    const wrapped = function () {
      prev.apply(this, arguments);
      try {
        if (typeof financeView !== 'undefined' && financeView !== 'summary') return;
        const el = document.getElementById('finance-workspace'); if (!el) return;
        const html = dashboard(), kpis = el.querySelector('.ws-kpis');
        if (kpis) kpis.outerHTML = html; else el.querySelector('#finance-content')?.insertAdjacentHTML('beforebegin', html);
        const recent = el.querySelector('#finance-content .ws-panel-title h2'); if (recent && recent.textContent.trim() === 'תנועות אחרונות') recent.textContent = 'רשומות אחרונות';
      } catch (e) { console.warn('business summary', e); }
    };
    wrapped._trb = true;
    window.financeRender = wrapped;
    try { financeRender = wrapped; } catch (e) {}
    if (document.getElementById('finance-workspace')?.offsetParent) wrapped();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('load', install);
})();
