/* ══════════════════════════════════════════════════════════════════════════
   FAYNA — STRATEGY MERGE (v47)

   Pick two or more strategies and read their combined statistics as if they
   were one. Loaded on demand the first time the tab is opened, so it costs
   nothing to a user who never goes there.

   Everything numeric comes from Metrics (fayna-metrics.js). This module owns
   selection, memoisation and rendering — it computes nothing itself, which is
   what keeps one Profit Factor in the system instead of four.

   Reads from the app: tradesList · tradeNet · tradeComm ·
   _getFuturesMultiplier · _safeChart · escHtml · showToast
   ════════════════════════════════════════════════════════════════════════ */

const Merge = (function () {
  'use strict';

  const LS_COMBOS = 'fx_merge_combos';

  /* the app owns the commission rule; this module must not re-derive it */
  const netOf  = t => (typeof tradeNet === 'function') ? tradeNet(t) : (+t.pnl || 0);
  const commOf = t => (typeof tradeComm === 'function') ? tradeComm(t) : 0;
  const multOf = s => (typeof _getFuturesMultiplier === 'function') ? _getFuturesMultiplier(s) : 1;
  const esc    = s => (typeof escHtml === 'function') ? escHtml(s) : String(s == null ? '' : s);
  const toast  = (m, k) => { try { showToast(m, k || 'info'); } catch (e) {} };

  const fmt = v => v == null ? '—'
    : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const cls = v => v > 0 ? 'mg-pos' : v < 0 ? 'mg-neg' : '';

  const S = {
    sel: new Set(),
    combos: {},
    charts: [],
    whatIf: { drop: '', size: 1, hourFrom: 0, hourTo: 23, weekdays: 'all' },
    cache: new Map(),
    query: '',
    built: false,
  };

  const allTrades = () => (typeof tradesList !== 'undefined' && Array.isArray(tradesList)) ? tradesList : [];

  function strategies() {
    const c = {};
    allTrades().forEach(t => {
      const s = (t.strategy || '').trim();
      if (s) c[s] = (c[s] || 0) + 1;
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }

  /* ─────────── selection + what-if → trade list ─────────── */
  function filtered() {
    const w = S.whatIf;
    let list = allTrades().filter(t => S.sel.has((t.strategy || '').trim()));
    if (w.drop) list = list.filter(t => (t.strategy || '').trim() !== w.drop);
    if (w.hourFrom > 0 || w.hourTo < 23) {
      list = list.filter(t => {
        const h = parseInt(String(t.btime || '').slice(0, 2), 10);
        return isNaN(h) ? false : (h >= w.hourFrom && h <= w.hourTo);
      });
    }
    if (w.weekdays !== 'all') {
      const keep = w.weekdays.split(',').map(Number);
      list = list.filter(t => keep.includes(new Date(t.date + 'T00:00:00').getDay()));
    }
    /* size multiplier scales P&L, contracts and commission together —
       scaling only the profit would flatter every result */
    if (w.size !== 1) list = list.map(t => Object.assign({}, t, {
      pnl: +((+t.pnl || 0) * w.size).toFixed(2),
      qty: (+t.qty || 0) * w.size,
      commOverride: +((commOf(t)) * w.size).toFixed(2),
    }));
    return list;
  }

  /* Memoised on selection + what-if. Re-rendering an unchanged key costs
     nothing, which is what keeps this responsive with thousands of trades. */
  const cacheKey = () => [...S.sel].sort().join('|') + '::' + JSON.stringify(S.whatIf);

  function result() {
    const k = cacheKey();
    if (S.cache.has(k)) return S.cache.get(k);

    const list = filtered();
    const m = Metrics.compute(list, { netOf, commOf, multOf });

    const per = {};
    [...S.sel].forEach(name => {
      const sub = list.filter(t => (t.strategy || '').trim() === name);
      if (sub.length) per[name] = Metrics.compute(sub, { netOf, commOf, multOf });
    });

    /* Correlation is computed only for the chosen set. The number of pairs
       grows with the square of the selection, so it is never precomputed
       across every strategy in the journal. */
    const keys = Object.keys(per), corr = {}, rs = [];
    keys.forEach(a => {
      corr[a] = {};
      keys.forEach(b => {
        if (a === b) { corr[a][b] = { r: 1, overlap: null }; return; }
        const c = Metrics.correlation(per[a].byDay, per[b].byDay);
        corr[a][b] = c;
        if (a < b && c.r != null) rs.push(Math.abs(c.r));
      });
    });
    const corrAvg = rs.length ? +(rs.reduce((x, y) => x + y, 0) / rs.length).toFixed(3) : null;

    const out = { m, per, corr, corrAvg, scores: Metrics.scores(m, corrAvg) };
    S.cache.set(k, out);
    if (S.cache.size > 40) S.cache.delete(S.cache.keys().next().value);
    return out;
  }

  /* ─────────── rendering ─────────── */
  function renderPicker() {
    const q = S.query.trim().toLowerCase();
    const opts = document.getElementById('mg-opts');
    const chips = document.getElementById('mg-chips');
    if (!opts) return;

    const list = strategies();
    if (!list.length) {
      opts.innerHTML = '<div class="mg-muted" style="padding:10px;font-size:12px">' +
        'אין אסטרטגיות ביומן. הוסף שדה "אסטרטגיה" לעסקאות כדי להשתמש במסך הזה.</div>';
      if (chips) chips.innerHTML = '';
      return;
    }

    opts.innerHTML = list
      .filter(([n]) => !q || n.toLowerCase().includes(q))
      .map(([n, c]) => {
        const on = S.sel.has(n);
        return `<div class="mg-opt${on ? ' on' : ''}" role="checkbox" tabindex="0" aria-checked="${on}"
             data-n="${esc(n)}" onclick="Merge.toggle(this.dataset.n)"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();Merge.toggle(this.dataset.n)}">
             <span>${esc(n)}</span><span class="mg-n">${c}</span></div>`;
      }).join('') || '<div class="mg-muted" style="padding:10px;font-size:12px">אין תוצאה לחיפוש</div>';

    if (chips) chips.innerHTML = [...S.sel].map(n =>
      `<span class="mg-chip">${esc(n)}<button data-n="${esc(n)}" onclick="Merge.toggle(this.dataset.n)"
        aria-label="הסר ${esc(n)}">✕</button></span>`).join('') ||
      '<span class="mg-muted" style="font-size:12px">לא נבחרה אסטרטגיה</span>';
  }

  function render() {
    renderPicker();
    S.charts.forEach(c => { try { c.destroy(); } catch (e) {} });
    S.charts = [];

    const out = document.getElementById('mg-out');
    if (!out) return;

    if (S.sel.size < 2) {
      out.innerHTML = '<div class="mg-card"><div class="mg-empty">' +
        'בחר לפחות שתי אסטרטגיות כדי לראות סטטיסטיקה מאוחדת</div></div>';
      return;
    }
    const { m, per, corr, corrAvg, scores } = result();
    if (!m.count) {
      out.innerHTML = '<div class="mg-card"><div class="mg-empty">' +
        'אין עסקאות שתואמות את הסינון הנוכחי</div></div>';
      return;
    }
    out.innerHTML = kpis(m) + scoreCard(scores, corrAvg) + chartShells() +
                    compare(per) + corrCard(corr, per) + mc(m) + whatIf(m);
    drawCharts(m);
  }

  const K = (l, v, note, k, tip) =>
    `<div class="mg-kpi"><div class="mg-l">${l}${tip ? `<span class="mg-i" title="${esc(tip)}">i</span>` : ''}</div>
     <div class="mg-v ${k || ''}">${v}</div>${note ? `<div class="mg-note">${note}</div>` : ''}</div>`;

  function kpis(m) {
    const hrs = m.avgTradeTimeMin == null ? '—'
      : m.avgTradeTimeMin >= 60 ? (m.avgTradeTimeMin / 60).toFixed(1) + ' שע׳'
      : Math.round(m.avgTradeTimeMin) + ' דק׳';
    const pfk = m.profitFactor == null ? '' : m.profitFactor >= 1.5 ? 'mg-pos' : m.profitFactor < 1 ? 'mg-neg' : 'mg-warn';
    return `<div class="mg-card"><div class="mg-ct">נתונים מאוחדים
      <small>${m.count} עסקאות · ${m.firstDate} → ${m.lastDate}</small></div>
      <div class="mg-kpis">
        ${K('מספר עסקאות', m.count)}
        ${K('Win Rate', m.winRate + '%', `${m.wins}W / ${m.losses}L${m.scratch ? ' / ' + m.scratch + 'S' : ''}`)}
        ${K('Profit Factor', m.profitFactor == null ? '—' : m.profitFactor, m.profitFactorNote || '', pfk)}
        ${K('Expectancy', fmt(m.expectancy), 'לעסקה', cls(m.expectancy))}
        ${K('Net Profit', fmt(m.netProfit), '', cls(m.netProfit))}
        ${K('Gross Profit', fmt(m.grossProfit), '', 'mg-pos')}
        ${K('Gross Loss', fmt(-m.grossLoss), '', 'mg-neg')}
        ${K('Average Winner', fmt(m.avgWinner), '', 'mg-pos')}
        ${K('Average Loser', fmt(m.avgLoser), '', 'mg-neg')}
        ${K('Average R', m.avgR == null ? '—' : m.avgR + 'R',
            `מחושב על ${m.rCoverage.withStop} מתוך ${m.rCoverage.total}`, cls(m.avgR),
            'R מחושב רק לעסקאות עם סטופ. הכיוון נגזר ממיקום הסטופ; עסקה בלי סטופ אינה נכללת ואינה מנוחשת.')}
        ${K('Max Drawdown', fmt(-m.maxDrawdown), m.maxDrawdownPct + '% מהשיא', 'mg-neg')}
        ${K('רצף מנצח', m.maxWinStreak, '', 'mg-pos')}
        ${K('רצף מפסיד', m.maxLossStreak, '', 'mg-neg')}
        ${K('זמן בעסקה', hrs, `${m.timeCoverage.withTime}/${m.timeCoverage.total} עם שעות`)}
        ${K('סה״כ חוזים', m.totalContracts)}
        ${K('סה״כ עמלות', fmt(-m.totalCommission), 'כולל fees', 'mg-neg',
            'המערכת שומרת עמלות ו-fees כשדה אחד, ולכן אין הפרדה ביניהם.')}
        ${K('רווח יומי ממוצע', fmt(m.avgDailyProfit), m.tradingDays + ' ימי מסחר', cls(m.avgDailyProfit))}
        ${K('רווח שבועי ממוצע', fmt(m.avgWeeklyProfit), '', cls(m.avgWeeklyProfit))}
        ${K('רווח חודשי ממוצע', fmt(m.avgMonthlyProfit), '', cls(m.avgMonthlyProfit))}
        ${K('עסקאות ליום', m.avgTradesPerDay)}
      </div></div>`;
  }

  function scoreCard(s, corrAvg) {
    const col = v => v >= 66 ? 'var(--gr)' : v >= 40 ? 'var(--go)' : 'var(--re)';
    return `<div class="mg-card"><div class="mg-ct">ציון איכות השילוב
      <small>הפירוק גלוי כדי שאפשר יהיה לחלוק עליו</small></div>
      <div class="mg-score-head">
        <div class="mg-ring" style="background:conic-gradient(${col(s.total)} ${s.total * 3.6}deg, var(--bg4) 0)">
          <div class="mg-ring-in" style="color:${col(s.total)}">${s.total}</div>
        </div>
        <div style="font-size:12px;color:var(--t2);flex:1;min-width:180px">
          ${s.total >= 66 ? 'שילוב יציב' : s.total >= 40 ? 'שילוב סביר עם נקודות לשיפור' : 'שילוב חלש — ראה פירוק'}
          ${corrAvg != null ? `<div class="mg-muted" style="margin-top:4px">מתאם ממוצע בין האסטרטגיות: ${corrAvg}</div>` : ''}
        </div>
      </div>
      ${s.parts.map(p => `
        <div class="mg-part">
          <div class="mg-pl">${esc(p.label)}</div>
          <div class="mg-pb"><div class="mg-pf" style="width:${p.value}%;background:${col(p.value)}"></div></div>
          <div class="mg-pv">${p.value}</div>
        </div>
        <div class="mg-pd">${esc(p.detail)} · משקל ${Math.round(p.weight * 100)}%</div>`).join('')}
      <div class="mg-warn-box">הציון אינו מדד תקני. הוא סכום משוקלל של חמשת המרכיבים שלמעלה.</div>
    </div>`;
  }

  function chartShells() {
    const c = (id, t) => `<div class="mg-card"><div class="mg-ct">${t}</div>
      <div class="mg-chart"><canvas id="${id}"></canvas></div></div>`;
    return `<div class="mg-grid2">
      ${c('mgEq', 'Equity Curve מאוחדת')}${c('mgDd', 'Drawdown')}
      ${c('mgMon', 'ביצועים חודשיים')}${c('mgDist', 'התפלגות רווח והפסד')}
      ${c('mgPie', 'Win / Loss')}${c('mgHour', 'שעות רווחיות')}
      ${c('mgDow', 'ימי השבוע')}${c('mgR', 'היסטוגרמת R')}
      ${c('mgDaily', 'P&L יומי')}${c('mgCum', 'רווח מצטבר')}
    </div>`;
  }

  function compare(per) {
    const rows = Object.entries(per);
    if (!rows.length) return '';
    const best = (f, dir) => rows.reduce((a, b) => {
      const av = f(a[1]), bv = f(b[1]);
      if (av == null) return b; if (bv == null) return a;
      return (dir > 0 ? bv > av : bv < av) ? b : a;
    })[0];
    const bP = best(x => x.netProfit, 1), bD = best(x => x.maxDrawdown, -1),
          bW = best(x => x.winRate, 1),   bE = best(x => x.expectancy, 1);

    return `<div class="mg-card"><div class="mg-ct">השוואה בין האסטרטגיות</div>
      <div class="mg-scroll"><table class="mg-tbl">
      <thead><tr><th>אסטרטגיה</th><th>רווח</th><th>Win Rate</th><th>PF</th>
        <th>Drawdown</th><th>Expectancy</th><th>עסקאות</th></tr></thead>
      <tbody>${rows.map(([n, x]) => {
        const b = (n === bP ? '<span class="mg-badge" title="הכי רווחית">🏆</span>' : '') +
                  (n === bD ? '<span class="mg-badge" title="דראו-דאון נמוך">🛡️</span>' : '') +
                  (n === bW ? '<span class="mg-badge" title="אחוז הצלחה גבוה">🎯</span>' : '') +
                  (n === bE ? '<span class="mg-badge" title="Expectancy גבוה">⚡</span>' : '');
        return `<tr><td>${b}${esc(n)}</td>
          <td class="${cls(x.netProfit)}">${fmt(x.netProfit)}</td>
          <td>${x.winRate}%</td>
          <td>${x.profitFactor == null ? '—' : x.profitFactor}</td>
          <td class="mg-neg">${fmt(-x.maxDrawdown)}</td>
          <td class="${cls(x.expectancy)}">${fmt(x.expectancy)}</td>
          <td class="mg-muted">${x.count}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }

  function corrCard(corr, per) {
    const ks = Object.keys(per);
    if (ks.length < 2) return '';
    const cell = c => {
      if (c.r == null) return `<td class="mg-muted" title="${esc(c.reason || '')}">—</td>`;
      const a = Math.abs(c.r);
      const bg = c.r > 0 ? `rgba(239,68,68,${(0.10 + a * 0.45).toFixed(2)})`
                         : `rgba(34,197,94,${(0.10 + a * 0.45).toFixed(2)})`;
      return `<td style="background:${bg}" title="חפיפה: ${c.overlap} ימים">${c.r.toFixed(2)}</td>`;
    };
    return `<div class="mg-card"><div class="mg-ct">מטריצת מתאם
      <small>על סדרות P&L יומיות, רק בימים שבהם שתי האסטרטגיות פעלו</small></div>
      <div class="mg-scroll"><table class="mg-tbl mg-cm">
      <thead><tr><th></th>${ks.map(k => `<th>${esc(k.slice(0, 12))}</th>`).join('')}</tr></thead>
      <tbody>${ks.map(a => `<tr><th style="text-align:start">${esc(a)}</th>${ks.map(b => cell(corr[a][b])).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <div class="mg-warn-box">אדום = נעות יחד (פיזור נמוך) · ירוק = נעות הפוך (פיזור אמיתי).
      תא ריק פירושו שלא היו מספיק ימי חפיפה כדי לחשב מתאם אמין — עדיף ריק ממספר שנראה אמין ואינו.</div>
    </div>`;
  }

  function mc(m) {
    const r = Metrics.monteCarlo(m.netsSorted, { runs: 1500, seed: 987 });
    if (!r.ok) return `<div class="mg-card"><div class="mg-ct">Monte Carlo</div>
      <div class="mg-empty">${esc(r.reason)}</div></div>`;
    return `<div class="mg-card"><div class="mg-ct">Monte Carlo
      <small>${r.runs} הרצות · דגימה חוזרת עם החזרה</small></div>
      <div class="mg-kpis">
        ${K('בפועל', fmt(r.observed), 'מה שקרה באמת', cls(r.observed))}
        ${K('תרחיש גרוע (P5)', fmt(r.final.p5), '5% מהתרחישים גרועים יותר', cls(r.final.p5))}
        ${K('חציון (P50)', fmt(r.final.p50), '', cls(r.final.p50))}
        ${K('תרחיש טוב (P95)', fmt(r.final.p95), '', cls(r.final.p95))}
        ${K('דראו-דאון חציוני', fmt(-r.drawdown.p50), '', 'mg-neg')}
        ${K('דראו-דאון P95', fmt(-r.drawdown.p95), '', 'mg-neg')}
        ${K('סיכוי לסיים ברווח', r.probProfit + '%', '', r.probProfit > 60 ? 'mg-pos' : 'mg-warn')}
      </div>
      <div class="mg-warn-box">${esc(r.assumption)}</div></div>`;
  }

  function whatIf(m) {
    const w = S.whatIf;
    return `<div class="mg-card"><div class="mg-ct">What If
      <small>שינוי ההנחות ומחשוב מחדש של הכל</small></div>
      <div class="mg-wi">
        <label>בלי האסטרטגיה
          <select onchange="Merge.wi('drop',this.value)">
            <option value="">— כולן —</option>
            ${[...S.sel].map(s => `<option value="${esc(s)}"${w.drop === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
          </select></label>
        <label>מכפיל גודל פוזיציה
          <select onchange="Merge.wi('size',+this.value)">
            ${[0.5, 1, 1.5, 2, 3].map(v => `<option value="${v}"${w.size === v ? ' selected' : ''}>×${v}</option>`).join('')}
          </select></label>
        <label>משעה<input type="number" min="0" max="23" value="${w.hourFrom}"
          onchange="Merge.wi('hourFrom',+this.value)"></label>
        <label>עד שעה<input type="number" min="0" max="23" value="${w.hourTo}"
          onchange="Merge.wi('hourTo',+this.value)"></label>
        <label>ימים
          <select onchange="Merge.wi('weekdays',this.value)">
            <option value="all"${w.weekdays === 'all' ? ' selected' : ''}>כל הימים</option>
            <option value="0,1,2,3,4"${w.weekdays === '0,1,2,3,4' ? ' selected' : ''}>א׳–ה׳</option>
            <option value="1,2,3"${w.weekdays === '1,2,3' ? ' selected' : ''}>ב׳–ד׳</option>
            <option value="4,5"${w.weekdays === '4,5' ? ' selected' : ''}>ה׳–ו׳</option>
          </select></label>
      </div>
      <div class="mg-delta">
        <div>Net Profit<b class="${cls(m.netProfit)}">${fmt(m.netProfit)}</b></div>
        <div>Profit Factor<b>${m.profitFactor == null ? '—' : m.profitFactor}</b></div>
        <div>Max Drawdown<b class="mg-neg">${fmt(-m.maxDrawdown)}</b></div>
        <div>Win Rate<b>${m.winRate}%</b></div>
        <div>עסקאות<b class="mg-muted">${m.count}</b></div>
        <div>&nbsp;<b><button class="fb" onclick="Merge.resetWi()">אפס</button></b></div>
      </div></div>`;
  }

  /* ─────────── charts (via the app's guarded Chart.js wrapper) ─────────── */
  const AX = { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#5f6b80', font: { size: 10 } } };
  const BASE = { responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
                 plugins: { legend: { display: false } }, scales: { x: AX, y: AX } };

  function add(id, cfg) {
    const el = document.getElementById(id);
    if (!el) return;
    const c = (typeof _safeChart === 'function') ? _safeChart(el, cfg)
            : (typeof Chart !== 'undefined' ? new Chart(el, cfg) : null);
    if (c) S.charts.push(c);
  }
  const green = 'rgba(34,197,94,.75)', red = 'rgba(239,68,68,.75)';

  function drawCharts(m) {
    const idx = m.equity.map((_, i) => i + 1);
    add('mgEq', { type: 'line', data: { labels: idx, datasets: [{ data: m.equity.map(e => e.equity),
      borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.12)', fill: true, tension: .25,
      pointRadius: 0, borderWidth: 2 }] }, options: BASE });

    add('mgDd', { type: 'line', data: { labels: idx, datasets: [{ data: m.ddSeries.map(d => d.dd),
      borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.14)', fill: true, tension: .2,
      pointRadius: 0, borderWidth: 1.5 }] }, options: BASE });

    const mk = Object.keys(m.byMonth).sort();
    add('mgMon', { type: 'bar', data: { labels: mk, datasets: [{ data: mk.map(k => m.byMonth[k]),
      backgroundColor: mk.map(k => m.byMonth[k] >= 0 ? green : red), borderRadius: 4 }] }, options: BASE });

    const nets = m.netsSorted;
    if (nets.length) {
      const lo = Math.min.apply(null, nets), hi = Math.max.apply(null, nets);
      const B = 16, w = (hi - lo) / B || 1, bins = new Array(B).fill(0);
      nets.forEach(v => { bins[Math.min(B - 1, Math.floor((v - lo) / w))]++; });
      add('mgDist', { type: 'bar', data: { labels: bins.map((_, i) => Math.round(lo + i * w)),
        datasets: [{ data: bins, backgroundColor: bins.map((_, i) => (lo + i * w) >= 0 ? green : red),
        borderRadius: 3 }] }, options: BASE });
    }

    add('mgPie', { type: 'doughnut', data: { labels: ['מנצחות', 'מפסידות', 'ללא'],
      datasets: [{ data: [m.wins, m.losses, m.scratch],
      backgroundColor: ['#22c55e', '#ef4444', '#5f6b80'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { color: '#9aa5b8', font: { size: 11 }, padding: 12 } } } } });

    const hk = Object.keys(m.byHour).filter(k => k !== '—').sort();
    add('mgHour', { type: 'bar', data: { labels: hk, datasets: [{ data: hk.map(k => m.byHour[k].net),
      backgroundColor: hk.map(k => m.byHour[k].net >= 0 ? green : red), borderRadius: 4 }] }, options: BASE });

    const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
    const dk = Object.keys(m.byWeekday).filter(k => k !== '—').sort((a, b) => a - b);
    add('mgDow', { type: 'bar', data: { labels: dk.map(k => DOW[k] || k),
      datasets: [{ data: dk.map(k => m.byWeekday[k].net),
      backgroundColor: dk.map(k => m.byWeekday[k].net >= 0 ? green : red), borderRadius: 4 }] }, options: BASE });

    /* R histogram — drawn only from trades that actually carried a stop */
    if (m.rValues.length) {
      const RB = [-3, -2, -1, 0, 1, 2, 3, 4], rb = new Array(RB.length).fill(0);
      m.rValues.forEach(v => { let i = RB.findIndex(x => v < x); if (i < 0) i = RB.length - 1; rb[i]++; });
      add('mgR', { type: 'bar', data: { labels: RB.map(v => v + 'R'), datasets: [{ data: rb,
        backgroundColor: RB.map(v => v >= 0 ? green : red), borderRadius: 3 }] }, options: BASE });
    } else {
      const el = document.getElementById('mgR');
      if (el && el.parentElement) el.parentElement.innerHTML =
        '<div class="mg-empty" style="padding:24px">אין עסקאות עם סטופ בבחירה הזו</div>';
    }

    const dkeys = Object.keys(m.byDay).sort();
    const TICK = { ...BASE, scales: { x: { ...AX, ticks: { ...AX.ticks, maxTicksLimit: 10 } }, y: AX } };
    add('mgDaily', { type: 'bar', data: { labels: dkeys, datasets: [{ data: dkeys.map(k => m.byDay[k]),
      backgroundColor: dkeys.map(k => m.byDay[k] >= 0 ? green : red) }] }, options: TICK });

    let run = 0;
    add('mgCum', { type: 'line', data: { labels: dkeys, datasets: [{ data: dkeys.map(k => (run += m.byDay[k])),
      borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,.12)', fill: true, tension: .25,
      pointRadius: 0, borderWidth: 2 }] }, options: TICK });
  }

  /* ─────────── saved combinations ─────────── */
  function loadCombos() {
    try { S.combos = JSON.parse(localStorage.getItem(LS_COMBOS) || '{}'); } catch (e) { S.combos = {}; }
  }
  function persistCombos() {
    try { localStorage.setItem(LS_COMBOS, JSON.stringify(S.combos)); } catch (e) {}
  }
  function refreshCombos() {
    const el = document.getElementById('mg-combos');
    if (!el) return;
    const names = Object.keys(S.combos);
    el.innerHTML = '<option value="">שילובים שמורים…</option>' +
      names.map(n => `<option value="${esc(n)}">${S.combos[n].fav ? '⭐ ' : ''}${esc(n)}</option>`).join('');
    const bar = document.getElementById('mg-combo-actions');
    if (bar) bar.style.display = names.length ? '' : 'none';
  }

  /* ─────────── public ─────────── */
  return {
    open() {
      if (!S.built) {
        loadCombos();
        const q = document.getElementById('mg-q');
        if (q) q.addEventListener('input', e => { S.query = e.target.value; renderPicker(); });
        /* preselect the two most-traded strategies so the screen is never
           an empty shell on first visit */
        const list = strategies();
        if (!S.sel.size && list.length >= 2) { S.sel.add(list[0][0]); S.sel.add(list[1][0]); }
        S.built = true;
      }
      refreshCombos();
      S.cache.clear();          // trades may have changed since the last visit
      render();
    },
    toggle(n) { S.sel.has(n) ? S.sel.delete(n) : S.sel.add(n); render(); },
    all()  { strategies().forEach(([n]) => S.sel.add(n)); render(); },
    none() { S.sel.clear(); render(); },
    wi(k, v) { S.whatIf[k] = v; render(); },
    resetWi() { S.whatIf = { drop: '', size: 1, hourFrom: 0, hourTo: 23, weekdays: 'all' }; render(); },

    save() {
      if (S.sel.size < 2) return toast('בחר לפחות שתי אסטרטגיות', 'error');
      const n = prompt('שם השילוב:');
      if (!n || !n.trim()) return;
      S.combos[n.trim()] = { list: [...S.sel], fav: false };
      persistCombos(); refreshCombos();
      toast('השילוב נשמר', 'success');
    },
    load(n) {
      if (!n || !S.combos[n]) return;
      S.sel = new Set(S.combos[n].list);
      render();
    },
    remove() {
      const el = document.getElementById('mg-combos');
      const n = el && el.value;
      if (!n || !S.combos[n]) return toast('בחר שילוב למחיקה', 'error');
      delete S.combos[n];
      persistCombos(); refreshCombos();
      toast('השילוב נמחק', 'info');
    },
    fav() {
      const el = document.getElementById('mg-combos');
      const n = el && el.value;
      if (!n || !S.combos[n]) return toast('בחר שילוב', 'error');
      S.combos[n].fav = !S.combos[n].fav;
      persistCombos(); refreshCombos();
      toast(S.combos[n].fav ? 'סומן כמועדף' : 'הוסר מהמועדפים', 'info');
    },
    _state: S,
  };
})();

window.Merge = Merge;
