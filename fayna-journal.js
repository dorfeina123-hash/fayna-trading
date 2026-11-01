/* Setups and tags, the notebook, risk limits and long/short statistics.
   Saved as one string inside businessNotes, a field the cloud save, server allow-list
   and backups already carry, so no rule or schema changes. */
window.FaynaJournal = (() => {
  const KEY = '__journal';
  const KINDS = [['setup', 'סטאפים'], ['tag', 'תגיות'], ['mistake', 'טעויות']];
  let kind = 'setup', pageId = null, pageQuery = '';
  const esc = v => escHtml(String(v ?? ''));
  const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tone = n => n > 0 ? 'cg' : n < 0 ? 'cr' : '';
  function read() {
    try { const d = JSON.parse(businessNotes[KEY] || '{}'); return { labels: { setup: [], tag: [], mistake: [], ...d.labels }, pages: d.pages || [] }; }
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

  function renderRisk() {
    const el = document.getElementById('jr-risk'); if (!el) return;
    const list = accounts.filter(a => a.active !== false && a.archived !== true);
    const meter = (label, x) => `<div class="jr-row"><span>${label}</span><b class="${tone(x.pnl)}">${money(x.pnl)}</b><small>${x.limit ? `מגבלה ${money(x.limit)} · נוצל ${x.pct}%` : 'לא הוגדרה מגבלה'}</small></div>${x.limit ? `<progress max="100" value="${x.pct}" aria-label="ניצול ${label}"></progress>` : ''}`;
    el.innerHTML = list.map(a => { const r = _computeRiskDashboard(a); return `<section class="ws-panel"><h2>${esc(a.name)}</h2>${meter('היום', r.today)}${meter('השבוע', r.week)}${meter('החודש', r.month)}</section>`; }).join('') || '<p class="ws-muted">לא נמצאו חשבונות פעילים.</p>';
  }

  function renderSides() {
    const el = document.getElementById('side-stats-body'); if (!el) return;
    const trades = getActiveTrades().filter(t => !t.isManual), group = d => summary(trades.filter(t => _tradeDir(t) === d));
    const unknown = trades.filter(t => !_tradeDir(t)).length;
    el.innerHTML = line('Long', group('long')) + line('Short', group('short')) + (unknown ? `<p class="ws-muted">${unknown} עסקאות ללא כיוון שמור. ייבוא חוזר של הדוח משלים אותן.</p>` : '');
  }

  return {
    render(name) { ({ setups: renderSetups, notebook: renderNotebook, risk: renderRisk })[name]?.(); },
    renderSides, addLabel, removeLabel, newPage, savePage, deletePage,
    kind(k) { kind = k; renderSetups(); },
    open(id) { pageId = id; renderNotebook(); },
    search(q) {
      pageQuery = q; renderNotebook();
      const input = document.querySelector('#jr-notebook input[type=search]'); input.focus(); input.setSelectionRange(q.length, q.length);
    },
  };
})();
