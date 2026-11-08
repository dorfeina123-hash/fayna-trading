/* v102 — TradeReport-style statistics overview.
   A "סקירה מפורטת" tab at the top of the stats page; the existing analyses move to a
   second tab ("ניתוח מתקדם") unchanged. Read-only: computed from the active trades
   (account filter + the top-bar period). Nothing is saved. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const esc = v => (typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? ''));
  const sym = () => (typeof _fxSym === 'function' ? _fxSym() : '$');
  const netOf = t => { const n = typeof _fxNet === 'function' ? _fxNet(t) : tradeNet(t); return Number.isFinite(n) ? n : (Number(t.pnl) || 0); };
  const money = (n, plus) => { const v = Number(n) || 0; return (v < 0 ? '-' : plus && v > 0 ? '+' : '') + sym() + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }); };
  const short = n => { const v = Number(n) || 0, a = Math.abs(v), s = v < 0 ? '-' : ''; return s + sym() + (a >= 1000 ? (a / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : a.toFixed(0)); };
  const pct = v => v === null || !isFinite(v) ? '—' : v.toFixed(2) + '%';
  const tone = n => n > 0 ? 'cg' : n < 0 ? 'cr' : '';
  const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const dirOf = t => (typeof _tradeDir === 'function' ? _tradeDir(t) : (t.dir === 'long' || t.dir === 'short' ? t.dir : null));
  const resultOf = t => (window.FaynaJournal?.resultOf ? FaynaJournal.resultOf(t) : (tradeNet(t) > 0 ? 'win' : tradeNet(t) < 0 ? 'loss' : 'be'));
  const secOf = s => { const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(s || '')); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null; };
  const durOf = t => { const a = secOf(t.btime), b = secOf(t.stime); if (a === null || b === null) return null; let d = b - a; if (d < 0) d += 86400; return d; };
  const durTxt = s => { if (s === null || !isFinite(s)) return '—'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h} שע׳ ו-${m} דק׳` : `${m} דקות ו-${x} שניות`; };
  const info = t => `<span class="trs-i" tabindex="0" role="img" aria-label="${esc(t)}" title="${esc(t)}">i</span>`;
  const badge = s => (window.FaynaTR?.badge ? FaynaTR.badge(s) : '');
  const rootOf = s => (window.FaynaTR?.rootOf ? FaynaTR.rootOf(s) : String(s || '').toUpperCase());
  let view = 'overview';

  function rows() {
    let list = typeof getActiveTrades === 'function' ? getActiveTrades() : (typeof tradesList !== 'undefined' ? tradesList : []);
    list = list.filter(t => /^\d{4}-\d{2}-\d{2}/.test(t.date || ''));
    const p = typeof _homePeriod !== 'undefined' ? _homePeriod : 'all';
    if (p !== 'all') {
      const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      list = list.filter(t => p === 'today' ? t.date.slice(0, 10) === today : t.date.slice(0, 7) === today.slice(0, 7));
    }
    return list.slice().sort((a, b) => (a.date + (a.btime || '')).localeCompare(b.date + (b.btime || '')));
  }

  function compute(all) {
    const list = all.filter(t => !t.isManual), nets = list.map(netOf);
    const res = list.map(resultOf), W = [], L = [], B = [];
    list.forEach((t, i) => (res[i] === 'win' ? W : res[i] === 'loss' ? L : B).push(i));
    const sum = a => a.reduce((x, y) => x + y, 0);
    const gw = sum(W.map(i => nets[i])), gl = -sum(L.map(i => nets[i]));
    const avgW = W.length ? gw / W.length : 0, avgL = L.length ? gl / L.length : 0;
    const n = list.length, net = sum(nets), mean = n ? net / n : 0;
    const sd = n > 1 ? Math.sqrt(sum(nets.map(v => (v - mean) ** 2)) / (n - 1)) : 0;
    // equity uses every record (manual day summaries count toward the curve)
    let eq = 0, peak = 0, maxDD = 0, ddPeak = 0; const curve = [], dd = [];
    all.forEach(t => { eq += netOf(t); if (eq > peak) peak = eq; const d = peak - eq; if (d > maxDD) { maxDD = d; ddPeak = peak; } curve.push(eq); dd.push(-d); });
    const totalAll = eq;
    // streaks
    let cw = 0, cl = 0, mw = 0, ml = 0; res.forEach(r => { if (r === 'win') { cw++; cl = 0; } else if (r === 'loss') { cl++; cw = 0; } mw = Math.max(mw, cw); ml = Math.max(ml, cl); });
    const daily = {}; all.forEach(t => { daily[t.date.slice(0, 10)] = (daily[t.date.slice(0, 10)] || 0) + netOf(t); });
    let dw = 0, dl = 0, mdw = 0, mdl = 0; Object.keys(daily).sort().forEach(k => { const v = daily[k]; if (v > 0) { dw++; dl = 0; } else if (v < 0) { dl++; dw = 0; } mdw = Math.max(mdw, dw); mdl = Math.max(mdl, dl); });
    // by weekday / hour
    const wd = DAYS.map(() => ({ n: 0, pnl: 0, w: 0, d: 0 })), hr = Array.from({ length: 24 }, () => ({ n: 0, w: 0, d: 0 }));
    list.forEach((t, i) => {
      const day = new Date(t.date.slice(0, 10) + 'T12:00:00').getDay(), r = res[i];
      wd[day].n++; wd[day].pnl += nets[i]; if (r !== 'be') { wd[day].d++; if (r === 'win') wd[day].w++; }
      const s = secOf(t.btime); if (s !== null) { const h = Math.floor(s / 3600) % 24; hr[h].n++; if (r !== 'be') { hr[h].d++; if (r === 'win') hr[h].w++; } }
    });
    // by asset
    const assets = {}; list.forEach((t, i) => { const k = rootOf(t.sym) || '—'; (assets[k] = assets[k] || { pnl: 0, n: 0, sym: t.sym }).pnl += nets[i]; assets[k].n++; });
    const aList = Object.entries(assets).sort((a, b) => b[1].pnl - a[1].pnl);
    // by side
    const side = d => {
      const idx = list.map((t, i) => i).filter(i => dirOf(list[i]) === d), ws = idx.filter(i => res[i] === 'win'), ls = idx.filter(i => res[i] === 'loss');
      const g = sum(ws.map(i => nets[i])), l = -sum(ls.map(i => nets[i])), durs = idx.map(i => durOf(list[i])).filter(x => x !== null);
      return { n: idx.length, w: ws.length, l: ls.length, rate: ws.length + ls.length ? ws.length / (ws.length + ls.length) * 100 : null, avgW: ws.length ? g / ws.length : 0, avgL: ls.length ? l / ls.length : 0, total: sum(idx.map(i => nets[i])), per: idx.length ? sum(idx.map(i => nets[i])) / idx.length : 0, ratio: ls.length && l ? (g / ws.length || 0) / (l / ls.length) : null, hold: durs.length ? sum(durs) / durs.length : null };
    };
    const durAvg = ix => { const d = ix.map(i => durOf(list[i])).filter(x => x !== null); return d.length ? sum(d) / d.length : null; };
    const qty = list.map(t => Number(t.qty)).filter(q => q > 0);
    return {
      list, all, nets, n, net, totalAll, W: W.length, L: L.length, B: B.length, gw, gl, avgW, avgL, mean, sd, maxDD, ddPeak, curve, dd,
      rate: W.length + L.length ? W.length / (W.length + L.length) * 100 : null,
      ratio: avgL ? avgW / avgL : (avgW ? Infinity : null), pf: gl ? gw / gl : (gw ? Infinity : null),
      recovery: maxDD ? totalAll / maxDD : null, maxWin: nets.length ? Math.max(0, ...nets) : 0, maxLoss: nets.length ? Math.min(0, ...nets) : 0,
      mw, ml, mdw, mdl, wd, hr, aList, long: side('long'), short: side('short'),
      dur: durAvg(list.map((t, i) => i)), durW: durAvg(W), durL: durAvg(L), durB: durAvg(B), qty: qty.length ? sum(qty) / qty.length : null
    };
  }

  /* ── small chart builders (HTML/SVG, no library) ── */
  function bars(items, kind, fmt) {
    const vals = items.map(x => x.v), hi = Math.max(0, ...vals), lo = Math.min(0, ...vals), range = (hi - lo) || 1;
    if (!vals.some(v => v)) return '<div class="trs-empty">אין נתונים לתקופה</div>';
    const zero = hi / range * 100;
    return `<div class="trs-bars" style="--zero:${zero.toFixed(2)}%">${items.map(x => {
      const h = Math.abs(x.v) / range * 100, pos = x.v >= 0;
      const cls = kind === 'pnl' ? (pos ? 'up' : 'down') : 'ac';
      return `<div class="trs-bar" title="${esc(x.l)}: ${esc(fmt(x.v))}${x.n !== undefined ? ' · ' + x.n + ' עסקאות' : ''}"><div class="trs-bar-plot"><i class="${cls}" style="height:${x.v ? Math.max(h, 1.5).toFixed(2) : 0}%;${pos ? `bottom:calc(100% - var(--zero))` : 'top:var(--zero)'}">${x.v ? `<em>${esc(fmt(x.v))}</em>` : ''}</i></div><span>${esc(x.l)}</span></div>`;
    }).join('')}</div>`;
  }
  function lineChart(series, kind) {
    if (series.length < 2) return '<div class="trs-empty">צריך לפחות שתי עסקאות</div>';
    const hi = Math.max(0, ...series), lo = Math.min(0, ...series), range = (hi - lo) || 1, W = 600, H = 200;
    const y = v => (H - 8 - (v - lo) / range * (H - 16)).toFixed(1), pts = series.map((v, i) => (i / (series.length - 1) * W).toFixed(1) + ',' + y(v)).join(' ');
    const col = kind === 'dd' ? 'var(--re)' : 'var(--ac)';
    return `<div class="trs-line"><div class="trs-ax" dir="ltr"><span>${esc(short(hi))}</span><span>${esc(short((hi + lo) / 2))}</span><span>${esc(short(lo))}</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${kind === 'dd' ? 'ירידה מהשיא לאורך זמן' : 'רווח והפסד מצטבר לאורך זמן'}"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="trs-zero"/><polygon points="0,${y(0)} ${pts} ${W},${y(0)}" fill="${col}" fill-opacity=".14"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg></div>`;
  }
  function scatter(list, nets) {
    const pts = list.map((t, i) => ({ x: secOf(t.btime), y: nets[i], t })).filter(p => p.x !== null);
    if (!pts.length) return '<div class="trs-empty">אין שעות פתיחה שמורות</div>';
    const hi = Math.max(0, ...pts.map(p => p.y)), lo = Math.min(0, ...pts.map(p => p.y)), range = (hi - lo) || 1, W = 600, H = 200;
    const y = v => (H - 10 - (v - lo) / range * (H - 20)).toFixed(1);
    const grid = [0, 4, 8, 12, 16, 20, 24].map(h => `<line x1="${h / 24 * W}" x2="${h / 24 * W}" y1="0" y2="${H}" class="trs-grid"/>`).join('');
    return `<div class="trs-line"><div class="trs-ax" dir="ltr"><span>${esc(short(hi))}</span><span>${esc(short(0))}</span><span>${esc(short(lo))}</span></div><div class="trs-sc"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="עסקאות לפי שעת פתיחה ותוצאה">${grid}<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="trs-zero"/>${pts.map(p => `<circle cx="${(p.x / 86400 * W).toFixed(1)}" cy="${y(p.y)}" r="4" class="${p.y >= 0 ? 'up' : 'down'}" vector-effect="non-scaling-stroke"><title>${esc(p.t.date.slice(0, 10))} ${esc(String(p.t.btime).slice(0, 5))} · ${esc(money(p.y, true))}</title></circle>`).join('')}</svg><div class="trs-hx" dir="ltr">${['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'].map(h => `<span>${h}</span>`).join('')}</div></div></div>`;
  }

  const card = (label, value, sub, cls, tip) => `<div class="trs-card"><div class="trs-lbl">${tip ? info(tip) : ''}<span>${label}</span></div><b class="${cls || ''}" dir="auto">${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const head = (t, s) => `<div class="trs-head"><h2>${t}</h2><p>${s}</p></div>`;

  function sideCard(name, s, cls) {
    const rate = s.rate === null ? 0 : s.rate;
    return `<div class="trs-card trs-side"><div class="trs-side-t ${cls}"><i></i>${name}</div>
      <div class="trs-side-rate"><span>אחוזי הצלחה</span><b class="${rate >= 50 ? 'cg' : 'cr'}">${pct(s.rate)}</b></div>
      <div class="trs-meter"><i style="width:${rate.toFixed(1)}%"></i></div>
      <div class="trs-wl"><span><i class="cgd"></i>${s.w} ניצחונות</span><span><i class="crd"></i>${s.l} הפסדים</span></div>
      <dl>${[['רווח ממוצע', money(s.avgW), 'cg'], ['הפסד ממוצע', s.avgL ? '-' + money(s.avgL) : money(0), 'cr'], ['ממוצע לעסקה', money(s.per), tone(s.per)], ['רווח/הפסד (סה״כ)', short(s.total), tone(s.total)], ['ממוצע רווח/הפסד לעסקה', s.ratio === null ? '—' : s.ratio.toFixed(2), 'trs-blue'], ['זמן החזקה ממוצע', s.hold === null ? '—' : Math.round(s.hold / 60) + ' דקות', '']].map(([k, v, c]) => `<div><dt>${k}</dt><dd class="${c}" dir="ltr">${v}</dd></div>`).join('')}</dl></div>`;
  }

  function overview(m) {
    if (!m.all.length) return '<div class="trs-empty trs-empty-big"><b>אין עדיין עסקאות בתקופה הזו</b><p>ייבא דוח או הוסף עסקה כדי לראות כאן את הסטטיסטיקה.</p></div>';
    const fx = v => v === Infinity ? '∞' : v === null ? '—' : v.toFixed(2);
    const wdPnl = m.wd.map((d, i) => ({ i, ...d })).filter(d => d.n);
    const active = wdPnl.slice().sort((a, b) => b.n - a.n)[0], best = wdPnl.slice().sort((a, b) => b.pnl - a.pnl)[0], worst = wdPnl.slice().sort((a, b) => a.pnl - b.pnl)[0];
    const longPct = m.long.n + m.short.n ? m.long.n / (m.long.n + m.short.n) * 100 : 50;
    const span = Math.max(m.maxWin, -m.maxLoss) || 1;
    const bestA = m.aList[0], worstA = m.aList[m.aList.length - 1];
    const assetCard = (lbl, a, cls) => `<div class="trs-card"><div class="trs-lbl"><span>${lbl}</span></div>${a ? `<div class="trs-asset">${badge(a[1].sym)}<b>${esc(a[0])}</b></div><b class="${tone(a[1].pnl)}" dir="ltr">${short(a[1].pnl)}</b><small>${a[1].n} עסקאות</small>` : '<b>—</b>'}</div>`;
    const hrs = m.hr.map((h, i) => ({ ...h, i })), first = hrs.findIndex(h => h.n), last = 23 - hrs.slice().reverse().findIndex(h => h.n);
    const hrRange = first < 0 ? [] : hrs.slice(Math.max(0, first - 1), Math.min(24, last + 2));
    const wdRange = m.wd.map((d, i) => ({ ...d, l: DAYS[i] }));
    return `
    <section>${head('סקירה מהירה', 'המספרים החשובים ביותר על הביצועים שלך')}
      <div class="trs-grid trs-g5">${card('אחוזי הצלחה', pct(m.rate), '', '', 'ניצחונות חלקי ניצחונות והפסדים, בלי עסקאות באיזון')}${card('ממוצע רווח/הפסד לעסקה', fx(m.ratio), '', '', 'רווח ממוצע חלקי הפסד ממוצע')}${card('פאקטור רווח', fx(m.pf), '', '', 'סך הרווחים חלקי סך ההפסדים')}${card('רווח ממוצע', money(m.avgW), '', 'cg')}${card('הפסד ממוצע', m.avgL ? '-' + money(m.avgL) : money(0), '', 'cr')}</div></section>
    <section>${head('סיכון וציפיות', 'מה השיטה מייצרת לעסקה ומה הסיכון המקסימלי')}
      <div class="trs-grid trs-g4">${card('ציפייה לעסקה', money(m.mean), 'ממוצע צפוי לעסקה', tone(m.mean), 'רווח נטו ממוצע לעסקה')}${card('ירידה מקסימלית מהשיא', m.maxDD ? '-' + money(m.maxDD) : money(0), m.ddPeak ? (m.maxDD / m.ddPeak * 100).toFixed(1) + '% מהשיא' : '', m.maxDD ? 'cr' : '', 'הירידה הגדולה ביותר של עקומת ההון מנקודת שיא')}${card('סטיית תקן לעסקה', money(m.sd), 'עד כמה התוצאות עקביות', '', 'פיזור התוצאות סביב הממוצע. נמוך = עקבי יותר')}${card('יחס התאוששות', m.recovery === null ? '—' : m.recovery.toFixed(2), 'סך הרווח חלקי הירידה המקסימלית', tone(m.recovery || 0))}
      ${card('עסקאות מנצחות', m.W, m.n ? Math.round(m.W / m.n * 100) + '% מהעסקאות' : '', 'cg')}${card('עסקאות מפסידות', m.L, m.n ? Math.round(m.L / m.n * 100) + '% מהעסקאות' : '', 'cr')}${card('עסקאות ברייק-איוון', m.B, m.n ? Math.round(m.B / m.n * 100) + '% מהעסקאות' : '', 'trs-blue', 'לפי טווח הברייק-איוון שהגדרת ביומן')}${card('מספר עסקאות כולל', m.n, m.all.length > m.n ? `+ ${m.all.length - m.n} סיכומי יום ידניים` : '')}</div></section>
    <section>${head('ביצועים', 'מאיפה הרווח או ההפסד מגיעים')}
      <div class="trs-grid trs-g2">
        <div class="trs-card"><div class="trs-lbl"><span>הרווח המרבי מול ההפסד המרבי</span></div>
          <div class="trs-vs"><div><span><i class="cgd"></i>רווח מרבי</span><b class="cg" dir="ltr">${short(m.maxWin)}</b></div><div class="trs-meter up"><i style="width:${(m.maxWin / span * 100).toFixed(1)}%"></i></div>
          <div><span><i class="crd"></i>הפסד מרבי</span><b class="cr" dir="ltr">${short(m.maxLoss)}</b></div><div class="trs-meter down"><i style="width:${(-m.maxLoss / span * 100).toFixed(1)}%"></i></div></div></div>
        <div class="trs-card"><div class="trs-lbl"><span>יחס לונג / שורט</span></div>
          <div class="trs-ls"><b class="cg">${Math.round(longPct)}%</b><b class="cr">${Math.round(100 - longPct)}%</b></div><div class="trs-split"><i style="width:${longPct.toFixed(1)}%"></i></div>
          <div class="trs-wl"><span><i class="cgd"></i>${m.long.n} לונגים</span><span><i class="crd"></i>${m.short.n} שורטים</span>${m.n - m.long.n - m.short.n ? `<span>${m.n - m.long.n - m.short.n} ללא כיוון</span>` : ''}</div></div>
      </div>
      <div class="trs-grid trs-g4">${card('היום הפעיל ביותר', active ? DAYS[active.i] : '—', active ? active.n + ' עסקאות' : '')}${card('היום הרווחי ביותר', best && best.pnl > 0 ? DAYS[best.i] : 'לא זמין', best && best.pnl > 0 ? short(best.pnl) : '', best && best.pnl > 0 ? 'cg' : '')}${card('היום הכי פחות רווחי', worst && worst.pnl < 0 ? DAYS[worst.i] : 'לא זמין', worst && worst.pnl < 0 ? short(worst.pnl) : '', worst && worst.pnl < 0 ? 'cr' : '')}${card('חוזים בממוצע לעסקה', m.qty === null ? '—' : (+m.qty.toFixed(1)) + ' חוזים')}
      ${card('משך עסקה ממוצע', durTxt(m.dur))}${card('משך עסקה מרוויחה ממוצע', durTxt(m.durW), '', 'cg')}${card('משך עסקה מפסידה ממוצע', durTxt(m.durL), '', 'cr')}${card('משך עסקה באיזון ממוצע', durTxt(m.durB), '', 'trs-blue')}
      ${card('רצף ניצחונות מקסימלי', m.mw, '', 'cg')}${card('רצף הפסדים מקסימלי', m.ml, '', 'cr')}${card('רצף ימים מנצחים', m.mdw, '', 'cg')}${card('רצף ימים מפסידים', m.mdl, '', 'cr')}</div></section>
    <section>${head('פילוח לפי נכסים', 'הנכסים שמייצרים לך הכי הרבה רווח או הפסד')}
      <div class="trs-grid trs-g2">${assetCard('הנכס הטוב ביותר', bestA)}${assetCard('הנכס הגרוע ביותר', m.aList.length > 1 ? worstA : null)}</div></section>
    <section>${head('פילוח לפי סוג עסקה', 'סטטיסטיקות מפורטות לפי כיוון העסקה')}
      <div class="trs-grid trs-g2">${sideCard('ניתוח לונג', m.long, 'cg')}${sideCard('ניתוח שורט', m.short, 'cr')}</div></section>
    <section>${head('תזמון', 'באילו ימים ושעות המסחר שלך עובד')}
      <div class="trs-grid trs-g2">
        <div class="trs-card trs-chart"><h3>עסקאות לפי יום</h3>${bars(wdRange.map(d => ({ l: d.l, v: d.n })), 'ac', v => String(v))}</div>
        <div class="trs-card trs-chart"><h3>רווח והפסד לפי יום</h3>${bars(wdRange.map(d => ({ l: d.l, v: +d.pnl.toFixed(2), n: d.n })), 'pnl', short)}</div>
        <div class="trs-card trs-chart"><h3>עסקאות לפי שעת פתיחה</h3>${bars(hrRange.map(h => ({ l: String(h.i).padStart(2, '0') + ':00', v: h.n })), 'ac', v => String(v))}</div>
        <div class="trs-card trs-chart"><h3>אחוז הצלחה לפי שעת פתיחה</h3>${bars(hrRange.map(h => ({ l: String(h.i).padStart(2, '0') + ':00', v: h.d ? Math.round(h.w / h.d * 100) : 0, n: h.n })), 'ac', v => v + '%')}</div>
        <div class="trs-card trs-chart"><h3>אחוז הצלחה לפי יום</h3>${bars(wdRange.map(d => ({ l: d.l, v: d.d ? Math.round(d.w / d.d * 100) : 0, n: d.n })), 'ac', v => v + '%')}</div>
        <div class="trs-card trs-chart"><h3>עסקאות לפי שעה ותוצאה</h3>${scatter(m.list, m.nets)}</div>
        <div class="trs-card trs-chart"><h3>ירידה מהשיא לאורך זמן</h3>${lineChart(m.dd, 'dd')}</div>
        <div class="trs-card trs-chart"><h3>רווח והפסד מצטבר לאורך זמן</h3>${lineChart(m.curve, 'pnl')}</div>
      </div></section>`;
  }

  function setup() {
    const tp = document.getElementById('tp-stats'); if (!tp) return null;
    let root = document.getElementById('trs-root');
    if (!root) {
      const legacy = document.createElement('div'); legacy.id = 'trs-legacy';
      while (tp.firstChild) legacy.appendChild(tp.firstChild);
      root = document.createElement('div'); root.id = 'trs-root';
      /* the advanced tab was removed: the page shows the detailed overview only */
      tp.appendChild(root); tp.appendChild(legacy);
    }
    return root;
  }
  function apply() {
    const tp = document.getElementById('tp-stats'); if (!tp) return;
    tp.querySelectorAll('[data-trs-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.trsView === view)));
    const r = document.getElementById('trs-root'), l = document.getElementById('trs-legacy');
    if (r) r.hidden = view !== 'overview'; if (l) l.hidden = view !== 'advanced';
  }
  function render() {
    const root = setup(); if (!root) return;
    apply();
    if (view !== 'overview') return;
    try { root.innerHTML = overview(compute(rows())); } catch (e) { console.warn('stats overview', e); root.innerHTML = '<div class="trs-empty">הסטטיסטיקה לא נטענה. נסה לרענן.</div>'; }
  }

  let _trsPrev = null;
  function install() {
    const prev = window.renderStats;
    if (typeof prev !== 'function' || prev._trs) return;
    _trsPrev = prev;
    const wrapped = function () { if (view === 'advanced') { try { prev.apply(this, arguments); } catch (e) { console.warn(e); } } render(); };
    wrapped._trs = true;
    window.renderStats = wrapped;
    try { renderStats = wrapped; } catch (e) {}
    const pd = window._trbDate;
    if (typeof pd === 'function' && !pd._trs) { const w = function () { pd.apply(this, arguments); if (document.getElementById('tp-stats')?.offsetParent) render(); }; w._trs = true; window._trbDate = w; try { _trbDate = w; } catch (e) {} }
    if (document.getElementById('tp-stats')?.offsetParent) render();
  }
  window.FaynaStats = Object.freeze({ render, compute: () => compute(rows()) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('load', install);
})();
