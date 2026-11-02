/* v100 — TradeReport-style trade journal: asset badges, result pills and a full
   trade detail view (chart + technical / emotional documentation).
   Presentation only. Reads the same tradesList/accounts and the same filters as the
   existing journal; nothing new is saved. Edit and delete still use the original flows. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const esc = v => (typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const sym = () => (typeof _fxSym === 'function' ? _fxSym() : '$');
  const netOf = t => { const n = typeof _fxNet === 'function' ? _fxNet(t) : tradeNet(t); return Number.isFinite(n) ? n : (Number(t.pnl) || 0); };
  const money = (n, plus) => { const v = Number(n) || 0; return (v < 0 ? '-' : plus && v > 0 ? '+' : '') + sym() + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const short = n => { const a = Math.abs(n), s = n < 0 ? '-' : ''; return s + sym() + (a >= 1000 ? (a / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : a.toFixed(a >= 100 ? 0 : 2)); };
  const price = v => (v === null || v === undefined || v === '' || !isFinite(+v)) ? '—' : (+v).toLocaleString('en-US', { maximumFractionDigits: 5 });
  const dateIL = d => (d && /^\d{4}-\d{2}-\d{2}/.test(d)) ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : (d || '—');
  const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  /* ── Asset badges: our own simple marks, by instrument family ── */
  const FAMILY = [
    [/^(M?NQ|NDX|NAS100|US100)$/, { t: '100', bg: '#0b6bcb' }],
    [/^(M?ES|SPX|SPY|US500)$/, { t: '500', bg: '#c4162e' }],
    [/^(M?YM|DJI|US30)$/, { t: '30', bg: '#1f3a93' }],
    [/^(M2K|RTY)$/, { t: '2K', bg: '#7c3aed' }],
    [/^(M?GC|XAUUSD|GOLD)$/, { t: 'Au', bg: '#c9930a' }],
    [/^(SI|SIL|XAGUSD)$/, { t: 'Ag', bg: '#7b8794' }],
    [/^(M?CL|QM|WTI|USOIL)$/, { t: 'Oil', bg: '#2b2b2b' }],
    [/^(NG|QG)$/, { t: 'Gas', bg: '#0e7490' }],
    [/^(6E|M6E|EUR.*)$/, { t: '€', bg: '#1d4ed8' }],
    [/^(6B|M6B|GBP.*)$/, { t: '£', bg: '#7f1d1d' }],
    [/^(6J|JPY.*|USDJPY)$/, { t: '¥', bg: '#b91c1c' }],
    [/^(6A|AUD.*)$/, { t: 'A$', bg: '#0f766e' }],
    [/^(6C|CAD.*|USDCAD)$/, { t: 'C$', bg: '#b91c1c' }],
    [/^(M?BTC|MBT|BTCUSD.*)$/, { t: '₿', bg: '#f7931a' }],
    [/^(M?ETH|MET|ETHUSD.*)$/, { t: 'Ξ', bg: '#5b6bd6' }],
    [/^(ZB|ZN|ZF|ZT|UB)$/, { t: 'T', bg: '#475569' }]
  ];
  function rootOf(s) {
    const u = String(s || '').toUpperCase().replace(/^@|1!$/g, '').trim();
    const m = /^([A-Z0-9]{1,4}?)([FGHJKMNQUVXZ]\d{1,2})$/.exec(u);
    return m && !/^\d+$/.test(m[1]) ? m[1] : u;
  }
  function badge(s, manual) {
    if (manual) return '<span class="trx-logo trx-logo-man" aria-hidden="true">✎</span>';
    const r = rootOf(s), f = FAMILY.find(([re]) => re.test(r));
    const look = f ? f[1] : { t: (r || '?').slice(0, 2), bg: '#4b4f5c' };
    const micro = /^M(?!ET$)/.test(r) && f && r.length > 2 && !/^(MBT)$/.test(r);
    return `<span class="trx-logo" style="background:${look.bg}" aria-hidden="true"><b>${esc(look.t)}</b>${micro ? '<i>M</i>' : ''}</span>`;
  }
  function assetCell(t) {
    const r = rootOf(t.sym), full = String(t.sym || '').toUpperCase();
    if (t.isManual) return `<span class="trx-asset">${badge('', true)}<span><b>סיכום יום</b>${t.manualTradeCount ? `<small>${t.manualTradeCount} עסקאות</small>` : ''}</span></span>`;
    return `<span class="trx-asset">${badge(t.sym)}<span><b>${esc(r || full || '—')}</b>${full && full !== r ? `<small>(${esc(full)})</small>` : ''}</span></span>`;
  }
  const dirOf = t => (typeof _tradeDir === 'function' ? _tradeDir(t) : (t.dir === 'long' || t.dir === 'short' ? t.dir : null));
  const resultOf = t => (window.FaynaJournal?.resultOf ? FaynaJournal.resultOf(t) : (tradeNet(t) > 0 ? 'win' : tradeNet(t) < 0 ? 'loss' : 'be'));
  const PILL = { win: ['רווח', 'trx-pill-win'], loss: ['הפסד', 'trx-pill-loss'], be: ['איזון', 'trx-pill-be'] };
  const pill = t => { const [l, c] = PILL[resultOf(t)]; return `<span class="trx-pill ${c}">${l}</span>`; };
  const documented = t => !!(t.strategy || t.notes || t.image || t.image2 || (t.tags || []).length || t.setupType || t.emotionBefore || t.mistake || t.lesson);
  const ICON = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    trades: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
    rate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
    usd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.7 4 3 4 1.2 4 3.2-1.8 3-4 3-4-1.1-4-3"/></svg>',
    pf: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>'
  };

  /* ── The current filtered list, same rules as the existing journal ── */
  function filtered() {
    let list = [...(typeof getActiveTrades === 'function' ? getActiveTrades() : tradesList)];
    try {
      if (typeof tjF !== 'undefined') { if (tjF === 'win') list = list.filter(t => tradeNet(t) > 0); if (tjF === 'loss') list = list.filter(t => tradeNet(t) < 0); }
      if (typeof tjS !== 'undefined' && tjS !== 'all') list = list.filter(t => t.sym === tjS);
      if (tjStrat !== 'all') list = list.filter(t => (t.strategy || '') === tjStrat);
      if (tjAcct !== '__all__') list = list.filter(t => t.acct === tjAcct);
      if (tjQuery) list = list.filter(t => String(t.sym || '').toUpperCase().includes(tjQuery.toUpperCase()));
      if (tjSide) list = list.filter(t => (dirOf(t) || 'unknown') === tjSide);
      if (tjResult) list = list.filter(t => resultOf(t) === tjResult);
      if (tjFrom) list = list.filter(t => t.date >= tjFrom);
      if (tjTo) list = list.filter(t => t.date <= tjTo);
    } catch (e) { /* filter state not ready yet */ }
    return list.sort((a, b) => ((b.date || '') + (b.btime || '')).localeCompare((a.date || '') + (a.btime || '')));
  }

  const HEAD = '<tr><th style="width:22px" id="tj-chk-head" title="בחר הכל"><input type="checkbox" class="chk" aria-label="בחר את כל העסקאות" onchange="tjSelAll(this.checked)" style="display:none"></th><th>תאריך</th><th>סטטוס</th><th>נכס</th><th>סוג</th><th>חשבון</th><th>כמות</th><th>מחיר כניסה</th><th>מחיר יציאה</th><th>משך</th><th>תוצאה</th><th>תועד</th><th><span class="trh-sr">פעולות</span></th></tr>';

  function renderRows() {
    const head = document.querySelector('#tj-table thead');
    if (head && !head.dataset.trx) { head.innerHTML = HEAD; head.dataset.trx = '1'; document.getElementById('tj-table').classList.add('trx-table'); }
    const list = filtered(), body = document.getElementById('tj-body'), kpi = document.getElementById('tj-m');
    if (!body) return;
    const nets = list.map(netOf), tot = nets.reduce((a, b) => a + b, 0);
    const wins = nets.filter(n => n > 0), losses = nets.filter(n => n < 0);
    const gw = wins.reduce((a, b) => a + b, 0), gl = -losses.reduce((a, b) => a + b, 0);
    const pf = gl ? (gw / gl).toFixed(2) : gw ? '∞' : '—';
    if (kpi) kpi.innerHTML = `<div class="trx-kpis">
      <div><span class="trx-kico">${ICON.trades}</span><div><small>סך העסקאות</small><b>${list.length}</b></div></div>
      <div><span class="trx-kico">${ICON.rate}</span><div><small>אחוז הצלחה</small><b class="${wins.length >= losses.length ? 'cg' : 'cr'}">${list.length ? (wins.length / list.length * 100).toFixed(1) + '%' : '—'}</b></div></div>
      <div><span class="trx-kico">${ICON.usd}</span><div><small>רווח/הפסד נטו</small><b class="${tot >= 0 ? 'cg' : 'cr'}" dir="ltr">${short(tot)}</b></div></div>
      <div><span class="trx-kico">${ICON.pf}</span><div><small>פקטור רווח</small><b class="cg">${pf}</b></div></div></div>`;
    const pages = Math.max(1, Math.ceil(list.length / tjSize)); tjPage = Math.min(tjPage, pages);
    const pager = document.getElementById('tj-pager');
    if (pager) {
      const from = list.length ? (tjPage - 1) * tjSize + 1 : 0, to = Math.min(list.length, tjPage * tjSize);
      const nums = []; for (let p = Math.max(1, tjPage - 2); p <= Math.min(pages, tjPage + 2); p++) nums.push(p);
      pager.innerHTML = `<div class="trx-pager"><span>מציג ${from}–${to} מתוך ${list.length} עסקאות</span><div><button type="button" class="trx-pg" aria-label="עמוד קודם" ${tjPage < 2 ? 'disabled' : ''} data-trx-page="${tjPage - 1}">›</button>${nums.map(p => `<button type="button" class="trx-pg${p === tjPage ? ' on' : ''}" data-trx-page="${p}" ${p === tjPage ? 'aria-current="page"' : ''}>${p}</button>`).join('')}<button type="button" class="trx-pg" aria-label="עמוד הבא" ${tjPage >= pages ? 'disabled' : ''} data-trx-page="${tjPage + 1}">‹</button></div><label>שורות לעמוד <select data-trx-size>${[20, 30, 50, 100].map(n => `<option ${n === tjSize ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
    }
    body.innerHTML = list.length ? list.slice((tjPage - 1) * tjSize, tjPage * tjSize).map(t => {
      const ti = tradesList.indexOf(t), n = netOf(t), d = dirOf(t);
      const a = t.acct ? accounts.find(x => x.id === t.acct) : null;
      const entry = d === 'short' ? t.sell : t.buy, exit = d === 'short' ? t.buy : t.sell;
      return `<tr class="tj-row trx-row" id="tj-row-${ti}" data-trx-open="${ti}" tabindex="0" aria-label="פרטי עסקה ${esc(t.sym)} ${esc(dateIL(t.date))}">
        <td id="tjcell-${ti}" style="display:none"><input type="checkbox" class="chk" id="tjchk-${ti}" aria-label="בחירת עסקה" ${t._sel ? 'checked' : ''} onchange="tradesList[${ti}]._sel=this.checked;tjRowMark(${ti},this.checked)"></td>
        <td data-label="תאריך"><b>${esc(dateIL(t.date))}</b>${t.btime ? `<small>${esc(String(t.btime).slice(0, 5))}</small>` : ''}</td>
        <td data-label="סטטוס">${pill(t)}</td>
        <td data-label="נכס">${assetCell(t)}</td>
        <td data-label="סוג" class="${d === 'long' ? 'cg' : d === 'short' ? 'cr' : ''}">${d === 'long' ? 'Long' : d === 'short' ? 'Short' : '—'}</td>
        <td data-label="חשבון">${a ? `<span class="trx-acct" data-trx-acct="${ti}" title="שינוי חשבון"><i style="background:${esc(a.color || 'var(--ac)')}"></i>${esc(a.name)}</span>` : `<button type="button" class="trx-add-acct" data-trx-acct="${ti}">+ חשבון</button>`}</td>
        <td data-label="כמות">${t.isManual ? (t.manualTradeCount ?? '—') : esc(t.qty ?? '—')}</td>
        <td data-label="מחיר כניסה" dir="ltr">${t.isManual ? '—' : price(entry)}</td>
        <td data-label="מחיר יציאה" dir="ltr">${t.isManual ? '—' : price(exit)}</td>
        <td data-label="משך">${esc(t.dur || '—')}</td>
        <td data-label="תוצאה" dir="ltr" class="trx-net ${n >= 0 ? 'cg' : 'cr'}">${money(n, true)}</td>
        <td data-label="תועד">${documented(t) ? `<span class="trx-doc" title="יש תיעוד">${ICON.check}</span>` : '<span class="trx-dash">—</span>'}</td>
        <td data-label="" class="trx-actions"><button type="button" class="trx-ib" data-trx-open="${ti}" title="פרטי העסקה" aria-label="פרטי העסקה">${ICON.eye}</button><button type="button" class="trx-ib" onclick="openTradeAnnotate(${ti})" title="עריכה ותיעוד" aria-label="עריכה ותיעוד">${ICON.edit}</button><button type="button" class="trx-ib trx-ib-del" onclick="delTrade(${ti})" title="מחיקה" aria-label="מחיקת העסקה">${ICON.del}</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="13" class="trx-empty">אין עסקאות שמתאימות לסינון</td></tr>';
  }

  /* wrap the existing renderer: it still draws the filter bars; we redraw the rest */
  function install() {
    const prev = window.renderTJ;
    if (typeof prev !== 'function' || prev._trx) return;
    const wrapped = function () { try { prev.apply(this, arguments); } catch (e) { console.warn('journal filters', e); } renderRows(); };
    wrapped._trx = true;
    window.renderTJ = wrapped;
    try { renderTJ = wrapped; } catch (e) { /* function declaration binding */ }
    if (document.getElementById('tj-body')) renderRows();
  }

  /* ── Trade detail view ── */
  let dlg = null, cur = -1, order = [], chartHandle = null, tab = 'tech';
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'trx-dialog'; dlg.className = 'trx-dialog'; dlg.setAttribute('aria-label', 'פרטי עסקה');
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { try { chartHandle?.destroy?.(); } catch (e) {} chartHandle = null; });
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { dlg.close(); return; }
      const b = e.target.closest('[data-trx-nav],[data-trx-tab],[data-trx-close],[data-trx-edit],[data-trx-tv],[data-trx-img]');
      if (!b) return;
      if (b.dataset.trxClose !== undefined) dlg.close();
      else if (b.dataset.trxNav) go(+b.dataset.trxNav);
      else if (b.dataset.trxTab) { tab = b.dataset.trxTab; renderPanel(); }
      else if (b.dataset.trxEdit !== undefined) { const i = cur; dlg.close(); openTradeAnnotate(i); }
      else if (b.dataset.trxTv !== undefined) { const i = cur; dlg.close(); openTradeChart(i); }
      else if (b.dataset.trxImg) { const t = tradesList[cur]; if (t && typeof openImgLightbox === 'function') openImgLightbox(t[b.dataset.trxImg]); }
    });
    dlg.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(1); if (e.key === 'ArrowRight') go(-1); });
    return dlg;
  }
  function go(step) { const k = order.indexOf(cur); const next = order[k + step]; if (next !== undefined) open(next); }
  const field = (k, v, cls) => `<div><dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd></div>`;
  const EMO = { calm: 'רגוע', confident: 'בטוח', excited: 'נרגש', fomo: 'FOMO', frustrated: 'מתוסכל', revenge: 'נקמנות', tired: 'עייף' };
  function renderPanel() {
    const t = tradesList[cur]; if (!t) return;
    const panel = dlg.querySelector('[data-trx-panel]');
    const d = dirOf(t), n = netOf(t), gross = Number(t.pnl) || 0, fee = typeof tradeComm === 'function' ? tradeComm(t) : 0;
    const entry = d === 'short' ? t.sell : t.buy, exit = d === 'short' ? t.buy : t.sell;
    const pts = isFinite(entry) && isFinite(exit) && d ? (d === 'long' ? exit - entry : entry - exit) : null;
    const a = t.acct ? accounts.find(x => x.id === t.acct) : null;
    const r = typeof _tradeR === 'function' ? _tradeR(t) : null;
    const stop = Number(t.stopLoss) || null;
    const risk = stop && isFinite(entry) && t.qty && typeof _getFuturesMultiplier === 'function' ? Math.abs(entry - stop) * t.qty * _getFuturesMultiplier(t.sym) : null;
    dlg.querySelectorAll('[data-trx-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.trxTab === tab)));
    if (tab === 'tech') {
      panel.innerHTML = `
      <section class="trx-sec"><h3>${ICON.usd}פרטים טכניים</h3><dl class="trx-grid">
        ${field('סוג עסקה', d === 'long' ? 'Long' : d === 'short' ? 'Short' : '—', d === 'long' ? 'cg' : d === 'short' ? 'cr' : '')}
        ${field('כמות', t.isManual ? (t.manualTradeCount ?? '—') : esc(t.qty ?? '—'))}
        ${field('מחיר כניסה', `<span dir="ltr">${t.isManual ? '—' : price(entry)}</span>`)}
        ${field('מחיר יציאה', `<span dir="ltr">${t.isManual ? '—' : price(exit)}</span>`)}
        ${field('סטטוס', pill(t))}
        ${field('תוצאה נטו', `<span dir="ltr">${money(n, true)}</span>`, n >= 0 ? 'cg' : 'cr')}
        ${field('רווח גולמי', `<span dir="ltr">${money(gross, true)}</span>`)}
        ${field('עמלות', `<span dir="ltr">${fee ? '-' + money(fee) : money(0)}</span>`)}
        ${field('נקודות', pts === null ? '—' : `<span dir="ltr">${pts > 0 ? '+' : ''}${(+pts.toFixed(4)).toLocaleString('en-US')}</span>`)}
        ${field('חשבון', a ? `<span class="trx-acct"><i style="background:${esc(a.color || 'var(--ac)')}"></i>${esc(a.name)}</span>` : '—')}
      </dl></section>
      <div class="trx-two">
        <section class="trx-sec trx-stop"><h3>Stop Loss</h3><dl class="trx-grid">${field('מחיר', `<span dir="ltr">${price(stop)}</span>`)}${field('סיכון', risk ? `<span dir="ltr">${money(risk)}</span>` : '—')}</dl></section>
        <section class="trx-sec trx-target"><h3>R מושג</h3><dl class="trx-grid">${field('מכפיל R', r === null || r === undefined || !isFinite(r) ? '—' : `<span dir="ltr">${r > 0 ? '+' : ''}${(+r).toFixed(2)}R</span>`, r > 0 ? 'cg' : r < 0 ? 'cr' : '')}${field('דירוג', t.stars ? '★'.repeat(t.stars) + '<span class="trx-dim">' + '★'.repeat(5 - t.stars) + '</span>' : '—', 'trx-stars')}</dl></section>
      </div>
      <section class="trx-sec"><h3><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>זמני העסקה</h3><dl class="trx-grid trx-grid3">
        ${field('שעת כניסה', esc(t.btime ? String(t.btime).slice(0, 8) : '—'))}${field('שעת יציאה', esc(t.stime ? String(t.stime).slice(0, 8) : '—'))}${field('משך כולל', esc(t.dur || '—'))}
      </dl></section>
      <section class="trx-sec"><h3><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4"/></svg>תמונות העסקה</h3>${t.image || t.image2 ? `<div class="trx-imgs">${['image', 'image2'].filter(k => t[k]).map(k => `<button type="button" data-trx-img="${k}" aria-label="הגדלת תמונה"><img src="${esc(t[k])}" alt="${k === 'image' ? 'לפני / במהלך העסקה' : 'אחרי העסקה'}" loading="lazy" decoding="async"></button>`).join('')}</div>` : '<p class="trx-none">אין תמונות. אפשר להוסיף בעריכה.</p>'}</section>`;
    } else {
      const plan = t.followedPlan === true ? '<span class="cg">כן</span>' : t.followedPlan === false ? '<span class="cr">לא</span>' : '—';
      panel.innerHTML = `
      <section class="trx-sec"><h3><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/></svg>מצב ותוכנית</h3><dl class="trx-grid">
        ${field('מצב רגשי לפני', esc(EMO[t.emotionBefore] || t.emotionBefore || '—'))}${field('עמדת בתוכנית', plan)}
        ${field('אסטרטגיה', esc(t.strategy || '—'))}${field('סטאפ כניסה', esc(t.setupType || '—'))}
      </dl></section>
      <section class="trx-sec"><h3>תגיות</h3>${(t.tags || []).length ? `<div class="trx-tags">${t.tags.map(g => `<span>${esc(g)}</span>`).join('')}</div>` : '<p class="trx-none">אין תגיות</p>'}</section>
      <section class="trx-sec"><h3>טעות ולקח</h3><dl class="trx-grid trx-grid1">${field('טעות שנעשתה', esc(t.mistake || '—'))}${field('לקח / מסקנה', esc(t.lesson || '—'))}</dl></section>
      <section class="trx-sec"><h3>הערות</h3>${t.notes || t.note ? `<p class="trx-notes">${esc(t.notes || t.note)}</p>` : '<p class="trx-none">אין הערות</p>'}</section>`;
    }
  }
  async function renderChart() {
    const t = tradesList[cur], pane = dlg.querySelector('[data-trx-chart]'); if (!t || !pane) return;
    try { chartHandle?.destroy?.(); } catch (e) {} chartHandle = null;
    const run = cur;
    const fallback = msg => { if (run !== cur) return; pane.innerHTML = `<div class="trx-chart-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/></svg><p>${msg}</p>${t.isManual ? '' : '<button type="button" class="trb-primary" data-trx-tv>פתיחה בגרף TradingView</button>'}</div>`; };
    if (t.isManual) { fallback('לסיכום יום ידני אין גרף נרות.'); return; }
    pane.innerHTML = '<div class="trx-chart-empty"><p>טוען גרף…</p></div>';
    try {
      if (typeof FaynaTradeChart === 'undefined' && typeof _loadModule === 'function') await _loadModule('fayna-trade-chart.js?v=81');
      if (run !== cur) return;
      if (typeof FaynaTradeChart !== 'undefined' && FaynaTradeChart.supports(t)) {
        pane.innerHTML = '';
        const h = await FaynaTradeChart.render(pane, t, dirOf(t));
        if (run !== cur) { try { h?.destroy?.(); } catch (e) {} return; }
        if (h) { chartHandle = h; return; }
      }
      fallback('אין נרות שמורים לנכס או לתאריך הזה.');
    } catch (e) { fallback('הגרף לא נטען כרגע.'); }
  }
  function open(ti) {
    const t = tradesList[ti]; if (!t) return;
    ensureDialog(); cur = ti;
    const list = filtered(); order = list.map(x => tradesList.indexOf(x)); if (!order.includes(ti)) order = [ti];
    const k = order.indexOf(ti), d = new Date((t.date || '') + 'T12:00:00');
    dlg.innerHTML = `<header class="trx-dh">
        <div class="trx-dh-title">${t.isManual ? badge('', true) : badge(t.sym)}<div><h2>${esc(t.isManual ? 'סיכום יום' : (t.sym || '—'))}</h2><small>${esc(dateIL(t.date))}${isNaN(d) ? '' : ' · ' + DAYS[d.getDay()]}</small></div></div>
        <div class="trx-dh-tools"><button type="button" class="trx-ib" data-trx-nav="-1" ${k < 1 ? 'disabled' : ''} aria-label="עסקה קודמת">›</button><span class="trx-pos">${k + 1} / ${order.length}</span><button type="button" class="trx-ib" data-trx-nav="1" ${k >= order.length - 1 ? 'disabled' : ''} aria-label="עסקה הבאה">‹</button><button type="button" class="trb-primary trx-edit" data-trx-edit>${ICON.edit}<span>עריכה ותיעוד</span></button><button type="button" class="trx-ib" data-trx-close aria-label="סגירה"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      </header>
      <div class="trx-body"><aside class="trx-panel"><div class="trx-tabs" role="tablist"><button type="button" role="tab" data-trx-tab="tech">תיעוד טכני</button><button type="button" role="tab" data-trx-tab="emo">תיעוד רגשי</button></div><div data-trx-panel></div></aside><div class="trx-chart" data-trx-chart></div></div>`;
    renderPanel();
    if (!dlg.open) dlg.showModal();
    renderChart();
  }

  /* ── events on the journal table ── */
  document.addEventListener('click', e => {
    const pg = e.target.closest('[data-trx-page]'); if (pg && !pg.disabled) { tjPage = +pg.dataset.trxPage; renderTJ(); return; }
    const ac = e.target.closest('[data-trx-acct]'); if (ac && typeof pickTradeAcct === 'function') { e.stopPropagation(); pickTradeAcct(+ac.dataset.trxAcct, e); return; }
    const eye = e.target.closest('#tj-body button[data-trx-open]'); if (eye) open(+eye.dataset.trxOpen);
    /* a click on the row itself goes through the existing handler → workspaceTradeDetails → open() */
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('#tj-body tr[data-trx-open]')) { e.preventDefault(); open(+e.target.dataset.trxOpen); } });
  document.addEventListener('change', e => { if (e.target.matches?.('[data-trx-size]')) { tjSize = +e.target.value; tjPage = 1; renderTJ(); } });

  /* the journal's existing row-click handler calls workspaceTradeDetails(index) */
  window.workspaceTradeDetails = open;
  try { workspaceTradeDetails = open; } catch (e) {}

  window.FaynaTR = Object.freeze({ badge, rootOf, openTrade: open, renderJournal: renderRows });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('load', install);
})();

/* v105 — settings in the TradeReport layout: tabs on top, profile card with the photo.
   Moves existing nodes only (ids and handlers unchanged); adds two shortcut tabs. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  function init() {
    const layout = document.querySelector('#tp-personal .pa-layout'); if (!layout || layout.classList.contains('trset')) return;
    layout.classList.add('trset');
    const nav = layout.querySelector('.pa-sidebar-nav');
    const rename = { 'pasnav-profile': 'הפרופיל שלי', 'pasnav-security': 'אבטחה וסיסמה', 'pasnav-notif': 'התראות', 'pasnav-connections': 'חיבורים', 'pasnav-referral': 'הזמנת חברים' };
    Object.entries(rename).forEach(([id, label]) => { const b = document.getElementById(id); if (!b) return; [...b.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).forEach(n => n.remove()); b.appendChild(document.createTextNode(label)); b.setAttribute('role', 'tab'); });
    if (nav) {
      nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'הגדרות');
      const extra = [['trset-accounts', 'חשבונות מסחר', 'M3 7h18v13H3zM3 11h18M8 3v4M16 3v4', () => { if (typeof openAcctGrid === 'function') openAcctGrid(); }],
        ['trset-billing', 'מנוי ותשלומים', 'M3 6h18v12H3zM3 10h18M7 15h4', () => { if (typeof swNav === 'function') swNav('billing'); }]];
      extra.forEach(([id, label, path, fn]) => { if (document.getElementById(id)) return; const b = document.createElement('button'); b.type = 'button'; b.className = 'pa-snav-btn trset-link'; b.id = id; b.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>${label}`; b.addEventListener('click', fn); nav.insertBefore(b, document.getElementById('pasnav-notif')); });
    }
    const prof = document.getElementById('pa-profile'), card = prof?.querySelector('.pa-card');
    const av = document.getElementById('pa-avatar-circle'), nm = document.getElementById('pa-sidebar-name'), em = document.getElementById('pa-sidebar-email');
    if (card && av && !document.getElementById('trset-head')) {
      const head = document.createElement('div'); head.id = 'trset-head'; head.className = 'trset-head';
      const txt = document.createElement('div'); txt.className = 'trset-head-txt';
      const t = document.createElement('h2'); t.textContent = 'הפרופיל שלי';
      const s = document.createElement('p'); s.textContent = 'נהלו את הפרטים האישיים ואת הגדרות החשבון. לחיצה על התמונה מחליפה אותה.';
      txt.append(t, s); if (nm) txt.appendChild(nm); if (em) txt.appendChild(em);
      av.setAttribute('role', 'button'); av.setAttribute('tabindex', '0'); av.setAttribute('aria-label', 'החלפת תמונת פרופיל');
      av.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); av.click(); } });
      head.append(av, txt); card.prepend(head);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
