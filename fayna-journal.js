/* Setups and tags, the notebook and long/short statistics.
   Saved as one string inside businessNotes, a field the cloud save, server allow-list
   and backups already carry, so no rule or schema changes. */
window.FaynaJournal = (() => {
  const KEY = '__journal';
  const KINDS = [['setup', 'סטאפים'], ['tag', 'תגיות'], ['mistake', 'טעויות']];
  let kind = 'setup', pageId = null, pageQuery = '', year = new Date().getFullYear();
  const esc = v => escHtml(String(v ?? ''));
  const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tone = n => n > 0 ? 'cg' : n < 0 ? 'cr' : '';
  function read() {
    try { const d = JSON.parse(businessNotes[KEY] || '{}'); return { ...d, labels: { setup: [], tag: [], mistake: [], ...d.labels }, pages: d.pages || [] }; }
    catch (e) { return { labels: { setup: [], tag: [], mistake: [] }, pages: [] }; }
  }
  function write(data) { businessNotes[KEY] = JSON.stringify(data); saveBizData(); }
  const valuesOf = (t, k) => k === 'setup' ? [t.strategy, t.setupType].filter(Boolean) : k === 'tag' ? (t.tags || []) : (t.mistake ? [t.mistake] : []);
  function summary(list) {
    const net = list.reduce((s, t) => s + tradeNet(t), 0), wins = list.filter(t => tradeNet(t) > 0).length;
    return { n: list.length, net, rate: list.length ? wins / list.length * 100 : 0 };
  }
  const line = (name, s, extra = '') => `<div class="jr-row"><span>${esc(name)}</span><small>${s.n} עסקאות · ${s.rate.toFixed(0)}% הצלחה</small><b class="${tone(s.net)}">${money(s.net)}</b>${extra}</div>`;

  function renderSetups() {
    const el = document.getElementById('jr-setups'); if (!el) return;
    const data = read(), trades = getActiveTrades().filter(t => !t.isManual);
    const names = [...new Set([...data.labels[kind], ...trades.flatMap(t => valuesOf(t, kind))])].sort();
    el.innerHTML = `<div class="ws-segment" role="group" aria-label="סוג">${KINDS.map(([id, n]) => `<button aria-pressed="${id === kind}" onclick="FaynaJournal.kind('${id}')">${n}</button>`).join('')}</div>
      <form class="jr-add" onsubmit="event.preventDefault();FaynaJournal.addLabel(this.name.value);this.reset()"><input name="name" maxlength="60" aria-label="שם חדש" placeholder="שם חדש" required><button class="btn-p">הוספה</button></form>
      ${names.map(n => line(n, summary(trades.filter(t => valuesOf(t, kind).includes(n))), data.labels[kind].includes(n) ? `<button class="act" title="הסרה מהרשימה" onclick='FaynaJournal.removeLabel(${JSON.stringify(n).replace(/'/g, '&#39;')})'>🗑</button>` : '')).join('') || '<p class="ws-muted">עדיין אין פריטים. הוסף כאן, או סווג עסקה בעריכה שלה.</p>'}`;
  }
  function addLabel(name) {
    const value = String(name || '').trim(); if (!value) return;
    const data = read();
    if (!data.labels[kind].includes(value)) data.labels[kind].push(value);
    write(data); renderSetups();
  }
  function removeLabel(name) {
    const data = read(); data.labels[kind] = data.labels[kind].filter(x => x !== name);
    write(data); renderSetups();
  }

  function renderNotebook() {
    const el = document.getElementById('jr-notebook'); if (!el) return;
    const data = read(), q = pageQuery.toLowerCase(), list = data.pages.filter(p => `${p.title} ${p.folder} ${p.body}`.toLowerCase().includes(q)).sort((a, b) => b.updated.localeCompare(a.updated)), page = data.pages.find(p => p.id === pageId);
    el.innerHTML = `<div class="jr-note"><aside><button class="btn-p" onclick="FaynaJournal.newPage()">+ דף חדש</button><input type="search" aria-label="חיפוש דפים" placeholder="חיפוש" value="${esc(pageQuery)}" oninput="FaynaJournal.search(this.value)">
      <div id="jr-pages">${list.map(p => `<button class="jr-page" aria-current="${p.id === pageId}" onclick="FaynaJournal.open('${esc(p.id)}')"><b>${esc(p.title)}</b><small>${esc(p.folder || 'ללא תיקייה')} · ${esc(p.updated.slice(0, 10))}</small></button>`).join('') || '<p class="ws-muted">אין דפים</p>'}</div></aside>
      <section>${page ? `<form onsubmit="event.preventDefault();FaynaJournal.savePage(this)"><input name="title" aria-label="כותרת" maxlength="120" value="${esc(page.title)}" required><input name="folder" aria-label="תיקייה" maxlength="60" placeholder="תיקייה" value="${esc(page.folder)}"><textarea name="body" aria-label="תוכן" rows="16">${esc(page.body)}</textarea><div class="ws-toolbar"><button class="btn-p">שמירה</button><button type="button" class="bn" onclick="FaynaJournal.deletePage()">מחיקה</button></div></form>` : '<p class="ws-muted">בחר דף או צור דף חדש.</p>'}</section></div>`;
  }
  function newPage() {
    const data = read(), page = { id: 'pg_' + crypto.randomUUID(), title: 'דף חדש', folder: '', body: '', updated: new Date().toISOString() };
    data.pages.push(page); pageId = page.id; write(data); renderNotebook();
  }
  function savePage(form) {
    const data = read(), page = data.pages.find(p => p.id === pageId); if (!page) return;
    Object.assign(page, { title: form.title.value.trim() || 'ללא כותרת', folder: form.folder.value.trim(), body: form.body.value, updated: new Date().toISOString() });
    write(data); renderNotebook(); showToast('הדף נשמר', 'success');
  }
  async function deletePage() {
    if (!await customConfirm('למחוק את הדף?', { danger: true })) return;
    const data = read(); data.pages = data.pages.filter(p => p.id !== pageId); pageId = null;
    write(data); renderNotebook();
  }

  function breakeven() { const d = read(); return { min: 0, max: 0, ...d.breakeven }; }
  function resultOf(t) { const r = breakeven(), n = tradeNet(t); return n >= r.min && n <= r.max ? 'be' : n > 0 ? 'win' : 'loss'; }
  async function editBreakeven() {
    const r = breakeven(), value = await customPrompt('טווח ברייק־איוון בדולרים, מינימום ומקסימום, למשל: -5,5', `${r.min},${r.max}`);
    if (value == null) return;
    const [min, max] = value.split(',').map(Number);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > 0 || max < 0) { showToast('נא להזין מינימום שלילי או 0 ומקסימום חיובי או 0', 'error'); return; }
    const data = read(); data.breakeven = { min, max }; write(data); renderTJ();
  }
  function renderYear(delta = 0) {
    year += delta;
    const box = document.getElementById('jr-year-box'); if (!box) return;
    const names = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'], trades = getActiveTrades();
    box.innerHTML = `<div class="ws-toolbar"><button class="bn" aria-label="שנה קודמת" onclick="FaynaJournal.renderYear(-1)">‹</button><strong>${year}</strong><button class="bn" aria-label="שנה הבאה" onclick="FaynaJournal.renderYear(1)">›</button></div><div class="jr-year">${names.map((n, i) => { const s = summary(trades.filter(t => String(t.date).startsWith(`${year}-${String(i + 1).padStart(2, '0')}`))); return `<div class="jr-month">${n}${s.n ? `<b class="${tone(s.net)}">${money(s.net)}</b>${s.n} עסקאות` : '<br>אין עסקאות'}</div>`; }).join('')}</div>`;
  }

  // Daily bars and the current month on the home screen, from the trades it already shows.
  function renderHomeExtras(root, rows) {
    const anchor = root.querySelector('.home-lower-grid'); if (!anchor) return;
    const now = new Date(), prefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), days = {};
    rows.filter(t => String(t.date).startsWith(prefix)).forEach(t => { days[t.date] = (days[t.date] || 0) + tradeNet(t); });
    const keys = Object.keys(days).sort(), max = Math.max(...keys.map(k => Math.abs(days[k])), 1), count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const bars = keys.map(k => `<i title="${esc(k)}: ${money(days[k])}" style="height:${Math.max(days[k] ? Math.abs(days[k]) / max * 50 : 0, 2)}%;background:var(--${days[k] >= 0 ? 'gr' : 're'});transform:translateY(${days[k] >= 0 ? '-50%' : '50%'})"></i>`).join('');
    const cells = '<div></div>'.repeat(first) + Array.from({ length: count }, (_, i) => { const v = days[`${prefix}-${String(i + 1).padStart(2, '0')}`]; return `<div class="${v == null ? '' : v >= 0 ? 'w' : 'l'}">${i + 1}${v == null ? '' : `<b dir="ltr">${money(v)}</b>`}</div>`; }).join('');
    anchor.insertAdjacentHTML('beforebegin', `<div class="jr-home"><section class="home-card"><div class="home-card-head"><h2>רווח יומי</h2><span>החודש</span></div>${keys.length ? `<div class="jr-bars">${bars}</div>` : '<p class="home-muted">אין עסקאות החודש</p>'}</section><section class="home-card"><div class="home-card-head"><h2>לוח חודשי</h2><span>החודש</span></div><div class="jr-cal">${cells}</div></section></div>`);
  }

  function renderSides() {
    const el = document.getElementById('side-stats-body'); if (!el) return;
    const trades = getActiveTrades().filter(t => !t.isManual), group = d => summary(trades.filter(t => _tradeDir(t) === d));
    const unknown = trades.filter(t => !_tradeDir(t)).length;
    el.innerHTML = line('Long', group('long')) + line('Short', group('short')) + (unknown ? `<p class="ws-muted">${unknown} עסקאות ללא כיוון שמור. ייבוא חוזר של הדוח משלים אותן.</p>` : '');
  }

  return {
    render(name) { ({ setups: renderSetups, notebook: renderNotebook })[name]?.(); },
    renderSides, renderHomeExtras, renderYear, resultOf, editBreakeven, addLabel, removeLabel, newPage, savePage, deletePage,
    kind(k) { kind = k; renderSetups(); },
    open(id) { pageId = id; renderNotebook(); },
    search(q) {
      pageQuery = q; renderNotebook();
      const input = document.querySelector('#jr-notebook input[type=search]'); input.focus(); input.setSelectionRange(q.length, q.length);
    },
  };
})();
