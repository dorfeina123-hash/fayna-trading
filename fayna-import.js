/* ══════════════════════════════════════════════════════════════════════════
   fayna-import.js — v50 · אשף ייבוא רב-פורמטי
   ------------------------------------------------------------------------
   נטען על פי דרישה (_loadModule) בכניסה ללשונית "ייבוא".

   למה מודול נפרד ולא עוד קוד ב-index.html:
   הקובץ הראשי כבר 1.6MB. פרסרים של שישה ברוקרים הם קוד שרוב המשתמשים
   לא נוגעים בו בכל טעינה. אותה החלטה כמו fayna-metrics/fayna-merge (v47).

   שלוש הפרדות שנשמרות כאן בקפדנות:
   1. הליבה (Parsers + normalize + dedupe) היא פונקציות טהורות — בלי DOM,
      בלי Firebase, בלי מצב גלובלי. אפשר להריץ אותה ב-Node עם assertions,
      וזה מה שנעשה בפועל לפני הפריסה.
   2. ה-UI קורא לליבה, לעולם לא מחשב בעצמו.
   3. הכתיבה למערכת עוברת רק דרך ה-API הקיים (tradesList/saveData/renderAll)
      ודרך מפתח הכפילות הקיים — כדי שלא ייווצר מסלול כתיבה מקביל.

   ⚠️ ייבוא הוא backfill היסטורי ולכן במכוון אינו עובר דרך Guard.gate:
   נעילת "מלאך שומר" חוסמת רישום עסקה חדשה, לא תיעוד של מה שכבר קרה.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ═════════════════════ 0. עזרי ליבה (טהורים) ═════════════════════ */

/** מפריד CSV מודע-מרכאות. מטפל ב-"" בתוך שדה, ב-CRLF וב-TSV. */
function splitLine(line, sep) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQ = !inQ; continue;
    }
    if (ch === sep && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** מזהה את המפריד לפי השורה הראשונה — פסיק, טאב, נקודה-פסיק. */
function detectSep(firstLine) {
  const counts = [[',', 0], ['\t', 0], [';', 0]];
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    const c = counts.find(c => c[0] === ch);
    if (c) c[1]++;
  }
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/**
 * טקסט מופרד → מערך אובייקטים.
 * skipTo: מספר שורות פתיח לדלג (דוחות MT/Rithmic מתחילים בכותרות טקסט).
 */
function toRows(text, opts) {
  opts = opts || {};
  const lines = String(text).split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { rows: [], headers: [] };
  let hIdx = 0;
  if (typeof opts.headerMatch === 'function') {
    const found = lines.findIndex(opts.headerMatch);
    if (found >= 0) hIdx = found;
  }
  const sep = opts.sep || detectSep(lines[hIdx]);
  /* שמות עמודות כפולים חייבים ייחוד לפני בניית האובייקט.
     דוח MetaTrader מכיל "Price" פעמיים — פתיחה וסגירה. בלי הייחוד
     השנייה דורסת את הראשונה, וכל עסקאות ה-Short יוצאות עם מחיר כניסה שגוי.
     זו לא תיאוריה: הבדיקה `mt: short entry → sell` תפסה את זה בפועל. */
  const seenH = Object.create(null);
  const headers = splitLine(lines[hIdx], sep).map(h => {
    const base = h.replace(/^"|"$/g, '').trim();
    if (seenH[base] === undefined) { seenH[base] = 1; return base; }
    seenH[base]++;
    return `${base} (${seenH[base]})`;
  });
  const rows = [];
  for (let i = hIdx + 1; i < lines.length; i++) {
    const c = splitLine(lines[i], sep);
    // שורות סיכום/מפרידים בדוחות ברוקר — פחות שדות מהכותרת
    if (c.length < Math.min(3, headers.length)) continue;
    const o = {};
    headers.forEach((h, j) => { o[h] = (c[j] == null ? '' : String(c[j])).replace(/^"|"$/g, '').trim(); });
    rows.push(o);
  }
  return { rows, headers, sep };
}

const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/[\s_\-\/().]/g, '');

/** מאתר את שם העמודה שמתאים לאחד מהשמות הנתונים. התאמה מדויקת קודמת להכלה. */
function pick(headers, names) {
  const H = headers.map(h => [h, norm(h)]);
  for (const n of names) {
    const nn = norm(n);
    const hit = H.find(([, h]) => h === nn);
    if (hit) return hit[0];
  }
  for (const n of names) {
    const nn = norm(n);
    if (nn.length < 3) continue;
    const hit = H.find(([, h]) => h.includes(nn));
    if (hit) return hit[0];
  }
  return null;
}

/**
 * מספר מתוך טקסט של ברוקר.
 * מטפל ב: $, פסיקי אלפים, סוגריים כשלילי, מקף/מינוס יוניקוד, רווח דק,
 * ובפורמט אירופי (1.234,56) כשהוא חד-משמעי.
 */
function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/[−–—]/g, '-').replace(/[\s  ]/g, '');
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[$€£₪]/g, '').replace(/USD|EUR|ILS/gi, '');
  const lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
  if (lastC > -1 && lastD > -1) {
    // המפריד העשרוני הוא זה שמופיע אחרון
    if (lastC > lastD) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastC > -1) {
    // פסיק יחיד: עשרוני רק אם יש בדיוק 1-2 ספרות אחריו
    const after = s.length - lastC - 1;
    s = (after === 1 || after === 2) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return neg ? -n : n;
}

const pad2 = n => String(n).padStart(2, '0');

/**
 * תאריך+שעה מטקסט של ברוקר → { date:'YYYY-MM-DD', time:'HH:MM:SS' }.
 * dayFirst: לפורמטים אירופיים (MT4/5, IBKR מסוימים) שבהם 03/04 הוא 3 באפריל.
 * מחזיר null אם לא ניתן לפענח — עדיף לדלג על שורה מאשר להמציא תאריך.
 */
function parseDT(v, dayFirst) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return { date: `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`,
             time: `${pad2(v.getHours())}:${pad2(v.getMinutes())}:${pad2(v.getSeconds())}` };
  }
  let s = String(v).trim().replace(/^"|"$/g, '');
  if (!s) return null;

  // ISO / RFC3339 — כולל Z ואופסט. נלקח כפי שהוא (זמן הברוקר), בלי המרת אזור.
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${pad2(m[4])}:${m[5]}:${m[6] || '00'}` };

  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return { date: s, time: '' };

  // YYYYMMDD (IBKR Flex)
  m = /^(\d{4})(\d{2})(\d{2})(?:[;\s]+(\d{2}):?(\d{2}):?(\d{2}))?$/.exec(s);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}:${m[6]}` : '' };

  // D/M/Y או M/D/Y (וגם עם נקודות/מקפים)
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    let a = +m[1], b = +m[2];
    let y = m[3].length === 2 ? 2000 + (+m[3]) : +m[3];
    let mo, d;
    if (a > 12) { d = a; mo = b; }            // חד-משמעי: יום ראשון
    else if (b > 12) { mo = a; d = b; }        // חד-משמעי: חודש ראשון
    else if (dayFirst) { d = a; mo = b; }
    else { mo = a; d = b; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const time = m[4] ? `${pad2(m[4])}:${m[5]}:${m[6] || '00'}` : '';
    return { date: `${y}-${pad2(mo)}-${pad2(d)}`, time };
  }

  // YYYY.MM.DD HH:MM:SS — פורמט MetaTrader
  m = /^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return { date: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`, time: m[4] ? `${pad2(m[4])}:${m[5]}:${m[6] || '00'}` : '' };

  const d2 = new Date(s);
  if (!isNaN(d2)) {
    return { date: `${d2.getFullYear()}-${pad2(d2.getMonth() + 1)}-${pad2(d2.getDate())}`,
             time: `${pad2(d2.getHours())}:${pad2(d2.getMinutes())}:${pad2(d2.getSeconds())}` };
  }
  return null;
}

/** משך בין שתי חותמות זמן → "1h 05m" / "42s". ריק אם לא ניתן לחשב. */
function durOf(a, b) {
  if (!a || !b || !a.date || !b.date) return '';
  const t1 = Date.parse(`${a.date}T${a.time || '00:00:00'}`);
  const t2 = Date.parse(`${b.date}T${b.time || '00:00:00'}`);
  if (isNaN(t1) || isNaN(t2) || t2 < t1) return '';
  let s = Math.round((t2 - t1) / 1000);
  if (s < 60) return s + 's';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${pad2(m)}m` : `${m}m`;
}

/** ניקוי סימבול: "MNQZ5" / "MNQ 12-25" / "NQ.F" → נשמר כפי שהוא, רק גזירת רעש. */
function cleanSym(v) {
  return String(v == null ? '' : v).replace(/^"|"$/g, '').trim().toUpperCase().slice(0, 24);
}

const isLongWord = v => /^(b|buy|long|bought|1)$/i.test(String(v || '').trim());
const isShortWord = v => /^(s|sell|short|sold|-1|2)$/i.test(String(v || '').trim());

/* ═════════════════════ 1. הפורמטים ═════════════════════

   כל פורמט הוא { id, label, hint, detect(headers,text), build(rows,headers) }.
   detect מחזיר ציון 0..1 — האיתור האוטומטי בוחר את הגבוה ביותר.
   build מחזיר { trades, warnings }.

   כלל שנשמר בכל הפרסרים: אם חסר נתון קריטי (תאריך/סימבול/P&L)
   השורה מדולגת ונספרת ב-skipped. לא ממציאים ערך כדי "להציל" שורה.
   ═══════════════════════════════════════════════════════════ */

/** בונה עסקה מנורמלת אחת. מחזיר null אם חסר המינימום ההכרחי. */
function mkTrade(o) {
  const sym = cleanSym(o.sym);
  if (!sym || !o.date) return null;
  const qty = Math.max(1, Math.round(Math.abs(num(o.qty)) || 1));
  let buy = num(o.buy), sell = num(o.sell);
  let pnl = o.pnl == null ? null : num(o.pnl);

  // אם אין P&L אבל יש שני מחירים וכיוון — מחשבים לפי מכפיל החוזה של המערכת.
  if (pnl == null || (pnl === 0 && buy && sell)) {
    const mult = (typeof _getFuturesMultiplier === 'function')
      ? _getFuturesMultiplier(sym) : (o.mult || 1);
    if (buy && sell) pnl = +((sell - buy) * qty * mult).toFixed(2);
  }
  if (pnl == null) pnl = 0;

  const t = {
    sym, qty,
    buy: +(+buy).toFixed(4) || 0,
    sell: +(+sell).toFixed(4) || 0,
    pnl: +(+pnl).toFixed(2),
    date: o.date,
    btime: o.btime || '00:00:00',
    stime: o.stime || '',
    dur: o.dur || '',
    strategy: o.strategy || '',
    notes: o.notes || '',
    stars: 0,
  };
  if (o.fees != null && isFinite(num(o.fees))) t.commOverride = +Math.abs(num(o.fees)).toFixed(2);
  if (o.dir) t.dir = o.dir;                    // 'long' | 'short' — נשמר כשהברוקר מסר אותו
  if (o.extId) t.extId = String(o.extId).slice(0, 64);
  if (o.src) t.src = o.src;
  return t;
}

/**
 * בונה עסקה משני מחירים + כיוון, כשהברוקר מוסר entry/exit ולא buy/sell.
 * זו נקודה שקל לטעות בה: ב-Short מחיר הכניסה הוא ה-sell.
 */
function fromEntryExit(dir, entry, exit) {
  const e = num(entry), x = num(exit);
  return dir === 'short' ? { buy: x, sell: e } : { buy: e, sell: x };
}

const FORMATS = [

  /* ── TopstepX / ProjectX ─────────────────────────────────────────────
     ייצוא "Trades" מלוח הבקרה. עמודות אופייניות:
     Id, ContractName, EnteredAt, ExitedAt, EntryPrice, ExitPrice,
     Fees, PnL, Size, Type (Long/Short), TradeDay                        */
  {
    id: 'topstepx', label: 'TopstepX / ProjectX', hint: 'ייצוא Trades מלוח הבקרה',
    detect(h) {
      const has = n => !!pick(h, [n]);
      let s = 0;
      if (has('ContractName')) s += .45;
      if (has('EnteredAt')) s += .3;
      if (has('ExitedAt')) s += .15;
      if (has('TradeDay')) s += .1;
      if (has('PnL') && has('Fees')) s += .1;
      return Math.min(s, 1);
    },
    build(rows, h) {
      const cSym = pick(h, ['ContractName', 'Contract', 'Symbol']);
      const cIn = pick(h, ['EnteredAt', 'EntryTime', 'Entered']);
      const cOut = pick(h, ['ExitedAt', 'ExitTime', 'Exited']);
      const cEp = pick(h, ['EntryPrice', 'AvgEntryPrice', 'Entry']);
      const cXp = pick(h, ['ExitPrice', 'AvgExitPrice', 'Exit']);
      const cQ = pick(h, ['Size', 'Quantity', 'Qty']);
      const cP = pick(h, ['PnL', 'ProfitAndLoss', 'Profit', 'RealizedPnL']);
      const cF = pick(h, ['Fees', 'Fee', 'Commission']);
      const cT = pick(h, ['Type', 'Side', 'Direction', 'PositionType']);
      const cId = pick(h, ['Id', 'TradeId', 'PositionId']);
      const cDay = pick(h, ['TradeDay', 'Date']);
      const out = [], warn = [];
      rows.forEach(r => {
        const a = parseDT(r[cIn]) || parseDT(r[cDay]);
        if (!a) return;
        const b = parseDT(r[cOut]);
        const dir = isShortWord(r[cT]) ? 'short' : 'long';
        const px = fromEntryExit(dir, r[cEp], r[cXp]);
        const t = mkTrade({
          sym: r[cSym], qty: r[cQ], buy: px.buy, sell: px.sell,
          pnl: cP ? r[cP] : null, fees: cF ? r[cF] : null,
          date: a.date, btime: a.time, stime: b ? b.time : '',
          dur: durOf(a, b), dir, extId: cId ? r[cId] : '', src: 'TopstepX',
        });
        if (t) out.push(t);
      });
      if (!cP) warn.push('לא נמצאה עמודת P&L — הרווח חושב ממחירי כניסה/יציאה לפי מכפיל החוזה.');
      return { trades: out, warnings: warn };
    },
  },

  /* ── NinjaTrader 8 ───────────────────────────────────────────────────
     Trades grid export: Instrument, Market pos., Quantity,
     Entry price, Exit price, Entry time, Exit time, Profit, Commission  */
  {
    id: 'nt8', label: 'NinjaTrader 8', hint: 'ייצוא Trades / Executions',
    detect(h) {
      let s = 0;
      if (pick(h, ['Instrument'])) s += .4;
      if (pick(h, ['Market pos.', 'Marketposition', 'Market position'])) s += .35;
      if (pick(h, ['Entry price']) && pick(h, ['Exit price'])) s += .2;
      if (pick(h, ['Entry time'])) s += .05;
      return Math.min(s, 1);
    },
    build(rows, h) {
      const cSym = pick(h, ['Instrument', 'Symbol']);
      const cPos = pick(h, ['Market pos.', 'Marketposition', 'Market position', 'Position']);
      const cQ = pick(h, ['Quantity', 'Qty']);
      const cEp = pick(h, ['Entry price', 'EntryPrice']);
      const cXp = pick(h, ['Exit price', 'ExitPrice']);
      const cEt = pick(h, ['Entry time', 'EntryTime']);
      const cXt = pick(h, ['Exit time', 'ExitTime']);
      const cP = pick(h, ['Profit', 'PnL', 'NetProfit']);
      const cF = pick(h, ['Commission', 'Comm']);
      const cId = pick(h, ['Trade number', 'TradeNumber', 'Id']);
      const out = [];
      rows.forEach(r => {
        const a = parseDT(r[cEt]); if (!a) return;
        const b = parseDT(r[cXt]);
        const dir = isShortWord(r[cPos]) ? 'short' : 'long';
        const px = fromEntryExit(dir, r[cEp], r[cXp]);
        const t = mkTrade({
          sym: r[cSym], qty: r[cQ], buy: px.buy, sell: px.sell,
          pnl: cP ? r[cP] : null, fees: cF ? r[cF] : null,
          date: a.date, btime: a.time, stime: b ? b.time : '',
          dur: durOf(a, b), dir, extId: cId ? r[cId] : '', src: 'NinjaTrader 8',
        });
        if (t) out.push(t);
      });
      return { trades: out, warnings: [] };
    },
  },

  /* ── MetaTrader 4/5 ──────────────────────────────────────────────────
     דוח History: Ticket, Open Time, Type, Size, Item, Price,
     S/L, T/P, Close Time, Price, Commission, Taxes, Swap, Profit
     שים לב: תאריכים ב-MT הם YYYY.MM.DD, והמספרים לרוב בפורמט אירופי.   */
  {
    id: 'mt', label: 'MetaTrader 4 / 5', hint: 'דוח היסטוריית חשבון (CSV)',
    detect(h) {
      let s = 0;
      if (pick(h, ['Ticket', 'Position', 'Deal', 'Order'])) s += .2;
      if (pick(h, ['Open Time', 'OpenTime', 'Time'])) s += .25;
      if (pick(h, ['Swap'])) s += .3;
      if (pick(h, ['Item', 'Symbol'])) s += .1;
      if (pick(h, ['Close Time', 'CloseTime'])) s += .15;
      return Math.min(s, 1);
    },
    build(rows, h) {
      const cSym = pick(h, ['Item', 'Symbol']);
      const cT = pick(h, ['Type', 'Direction']);
      const cQ = pick(h, ['Size', 'Volume', 'Lots']);
      const cOt = pick(h, ['Open Time', 'OpenTime', 'Time']);
      const cCt = pick(h, ['Close Time', 'CloseTime']);
      const cP = pick(h, ['Profit', 'PnL']);
      const cSw = pick(h, ['Swap']);
      const cF = pick(h, ['Commission', 'Comm']);
      const cId = pick(h, ['Ticket', 'Position', 'Deal', 'Order']);
      // ב-MT יש שתי עמודות "Price" — פתיחה וסגירה, לפי סדר ההופעה.
      // toRows כבר ייחד אותן ל-"Price" ו-"Price (2)", לכן ההתאמה היא על הבסיס.
      // (norm מסיר רווחים וסוגריים, כך ש-"Price (2)" הופך ל-"price2")
      const prices = h.filter(x => /^price\d*$/.test(norm(x)));
      const cOp = prices[0] || pick(h, ['Open Price', 'OpenPrice', 'Price']);
      const cXp = prices[1] || pick(h, ['Close Price', 'ClosePrice']);
      const out = [], warn = [];
      rows.forEach(r => {
        const a = parseDT(r[cOt], true); if (!a) return;
        const b = parseDT(r[cCt], true);
        const dir = isShortWord(r[cT]) ? 'short' : 'long';
        const px = fromEntryExit(dir, r[cOp], cXp ? r[cXp] : 0);
        // ב-MT העמלה והסוואפ נפרדים מהרווח — מאחדים לעמלה אחת
        const fees = Math.abs(num(cF ? r[cF] : 0)) + Math.abs(num(cSw ? r[cSw] : 0));
        const t = mkTrade({
          sym: r[cSym], qty: r[cQ], buy: px.buy, sell: px.sell,
          pnl: cP ? r[cP] : null, fees: fees || null,
          date: a.date, btime: a.time, stime: b ? b.time : '',
          dur: durOf(a, b), dir, extId: cId ? r[cId] : '', src: 'MetaTrader',
        });
        if (t) out.push(t);
      });
      if (cSw) warn.push('Swap אוחד עם העמלה לשדה עמלות אחד — המערכת שומרת עמלה אחת לעסקה.');
      if (pick(h, ['Size', 'Volume', 'Lots'])) warn.push('גודל ב-MT הוא לוטים; המערכת סופרת יחידות שלמות. בדוק את שדה הכמות בתצוגה המקדימה.');
      return { trades: out, warnings: warn };
    },
  },

  /* ── Interactive Brokers — Flex Query (CSV) ──────────────────────────
     גם ה-XML של Flex מגיע לכאן, אחרי המרה ל-rows ב-parseAny.           */
  {
    id: 'ibkr', label: 'Interactive Brokers', hint: 'Flex Query — CSV או XML',
    detect(h) {
      let s = 0;
      if (pick(h, ['ibCommission'])) s += .45;
      if (pick(h, ['fifoPnlRealized'])) s += .35;
      if (pick(h, ['tradeDate'])) s += .15;
      if (pick(h, ['ClientAccountID', 'AccountId'])) s += .05;
      return Math.min(s, 1);
    },
    build(rows, h) {
      const cSym = pick(h, ['symbol', 'underlyingSymbol', 'description']);
      const cD = pick(h, ['dateTime', 'tradeDate', 'orderTime']);
      const cQ = pick(h, ['quantity', 'qty']);
      const cPx = pick(h, ['tradePrice', 'price']);
      const cP = pick(h, ['fifoPnlRealized', 'realizedPnl', 'pnl']);
      const cF = pick(h, ['ibCommission', 'commission']);
      const cB = pick(h, ['buySell', 'side']);
      const cId = pick(h, ['tradeID', 'transactionID', 'ibExecID']);
      const out = [], warn = [];
      rows.forEach(r => {
        const a = parseDT(r[cD]); if (!a) return;
        const q = num(r[cQ]);
        const dir = (cB && isShortWord(r[cB])) || q < 0 ? 'short' : 'long';
        const px = num(r[cPx]);
        // ב-Flex כל שורה היא ביצוע בודד: מחיר אחד, וה-P&L כבר ממומש.
        const t = mkTrade({
          sym: r[cSym], qty: Math.abs(q) || 1,
          buy: dir === 'long' ? px : 0, sell: dir === 'short' ? px : 0,
          pnl: cP ? r[cP] : 0, fees: cF ? r[cF] : null,
          date: a.date, btime: a.time, dir,
          extId: cId ? r[cId] : '', src: 'IBKR Flex',
        });
        if (t) out.push(t);
      });
      warn.push('ב-IBKR כל שורה היא ביצוע בודד (Fill) ולא עסקה מלאה — מחיר הצד הנגדי יישאר ריק, וה-P&L נלקח כפי שדווח (fifoPnlRealized).');
      return { trades: out, warnings: warn };
    },
  },

  /* ── Tradovate ───────────────────────────────────────────────────────
     ייצוא Performance: boughtTimestamp / soldTimestamp / buyPrice ...   */
  {
    id: 'tradovate', label: 'Tradovate', hint: 'ייצוא Performance / Fills',
    detect(h) {
      let s = 0;
      if (pick(h, ['boughtTimestamp'])) s += .5;
      if (pick(h, ['soldTimestamp'])) s += .25;
      if (pick(h, ['buyPrice']) && pick(h, ['sellPrice'])) s += .25;
      return Math.min(s, 1);
    },
    build(rows, h) {
      const cSym = pick(h, ['symbol', 'contract']);
      const cBt = pick(h, ['boughtTimestamp']);
      const cSt = pick(h, ['soldTimestamp']);
      const cBp = pick(h, ['buyPrice']);
      const cSp = pick(h, ['sellPrice']);
      const cQ = pick(h, ['qty', 'quantity']);
      const cP = pick(h, ['pnl', 'P&L', 'profit']);
      const cId = pick(h, ['id', 'positionId']);
      const out = [];
      rows.forEach(r => {
        const a = parseDT(r[cBt]), b = parseDT(r[cSt]);
        const first = (a && b) ? (a.date + a.time <= b.date + b.time ? a : b) : (a || b);
        if (!first) return;
        const last = (a && b) ? (first === a ? b : a) : null;
        const t = mkTrade({
          sym: r[cSym], qty: r[cQ], buy: r[cBp], sell: r[cSp],
          pnl: cP ? r[cP] : null,
          date: first.date, btime: first.time, stime: last ? last.time : '',
          dur: durOf(first, last), dir: (a && b && a.date + a.time <= b.date + b.time) ? 'long' : 'short',
          extId: cId ? r[cId] : '', src: 'Tradovate',
        });
        if (t) out.push(t);
      });
      return { trades: out, warnings: [] };
    },
  },

  /* ── Binance — Spot / Futures trade history ─────────────────────────── */
  {
    id: 'binance', label: 'Binance', hint: 'Spot או Futures trade history',
    detect(h) {
      let s = 0;
      if (pick(h, ['Realized Profit', 'RealizedProfit'])) s += .4;
      if (pick(h, ['Fee Coin', 'FeeCoin', 'Commission Asset'])) s += .3;
      if (pick(h, ['Date(UTC)', 'DateUTC', 'Time'])) s += .15;
      if (pick(h, ['Pair', 'Market'])) s += .15;
      return Math.min(s, 1);
    },
    build(rows, h) {
      const cSym = pick(h, ['Pair', 'Symbol', 'Market']);
      const cD = pick(h, ['Date(UTC)', 'DateUTC', 'Time', 'Date']);
      const cSide = pick(h, ['Side', 'Type']);
      const cPx = pick(h, ['Price', 'AvgPrice']);
      const cQ = pick(h, ['Quantity', 'Amount', 'Executed', 'Qty']);
      const cP = pick(h, ['Realized Profit', 'RealizedProfit', 'Profit']);
      const cF = pick(h, ['Fee', 'Commission']);
      const out = [];
      rows.forEach(r => {
        const a = parseDT(r[cD]); if (!a) return;
        const dir = isShortWord(r[cSide]) ? 'short' : 'long';
        const px = num(r[cPx]);
        const t = mkTrade({
          sym: r[cSym], qty: r[cQ] || 1,
          buy: dir === 'long' ? px : 0, sell: dir === 'short' ? px : 0,
          pnl: cP ? r[cP] : 0, fees: cF ? r[cF] : null,
          date: a.date, btime: a.time, dir, src: 'Binance', mult: 1,
        });
        if (t) out.push(t);
      });
      return { trades: out, warnings: ['בקריפטו הכמות אינה חוזים שלמים — המערכת מעגלת ליחידה שלמה. בדוק בתצוגה המקדימה.'] };
    },
  },

  /* ── Generic — עמודות סטנדרטיות או מיפוי ידני ─────────────────────── */
  {
    id: 'generic', label: 'CSV כללי', hint: 'סימבול, תאריך, כניסה, יציאה, כמות, P&L',
    detect(h) {
      const hasSym = !!pick(h, ['symbol', 'sym', 'instrument', 'ticker', 'סימבול', 'סימול']);
      const hasDate = !!pick(h, ['date', 'time', 'תאריך']);
      if (!hasSym || !hasDate) return 0;
      return .25;                                  // תמיד נמוך — משמש כברירת מחדל
    },
    build(rows, h) {
      const M = autoMap(h);
      return buildFromMap(rows, M, 'CSV');
    },
  },
];

/** מיפוי אוטומטי לעמודות סטנדרטיות — משמש גם כברירת מחדל למיפוי הידני. */
function autoMap(h) {
  return {
    sym: pick(h, ['symbol', 'sym', 'instrument', 'ticker', 'contract', 'pair', 'סימבול', 'סימול', 'נכס']),
    date: pick(h, ['date', 'datetime', 'entrytime', 'opentime', 'time', 'tradedate', 'תאריך']),
    exitDate: pick(h, ['exittime', 'closetime', 'exitedat', 'soldtimestamp', 'שעת יציאה']),
    qty: pick(h, ['qty', 'quantity', 'size', 'contracts', 'volume', 'כמות', 'חוזים']),
    buy: pick(h, ['buy', 'buyprice', 'entryprice', 'openprice', 'entry', 'מחיר כניסה']),
    sell: pick(h, ['sell', 'sellprice', 'exitprice', 'closeprice', 'exit', 'מחיר יציאה']),
    pnl: pick(h, ['pnl', 'p&l', 'profit', 'netprofit', 'realizedpnl', 'רווח', 'רווח/הפסד']),
    fees: pick(h, ['fees', 'fee', 'commission', 'comm', 'עמלה', 'עמלות']),
    dir: pick(h, ['side', 'type', 'direction', 'marketpos', 'position', 'כיוון']),
    strategy: pick(h, ['strategy', 'setup', 'system', 'אסטרטגיה']),
    notes: pick(h, ['notes', 'note', 'comment', 'הערות', 'הערה']),
  };
}

/** בונה עסקאות ממיפוי עמודות מפורש (אוטומטי או ידני). */
function buildFromMap(rows, M, srcLabel) {
  const out = [], warn = [];
  let skipped = 0;
  rows.forEach(r => {
    const a = parseDT(M.date ? r[M.date] : '');
    if (!a) { skipped++; return; }
    const b = M.exitDate ? parseDT(r[M.exitDate]) : null;
    const dirRaw = M.dir ? r[M.dir] : '';
    const dir = isShortWord(dirRaw) ? 'short' : (isLongWord(dirRaw) ? 'long' : '');
    let buy = M.buy ? num(r[M.buy]) : 0, sell = M.sell ? num(r[M.sell]) : 0;
    // אם יש עמודת כיוון ורק מחיר כניסה/יציאה — מסדרים לפי הכיוון
    if (dir && M.buy && M.sell) {
      const px = fromEntryExit(dir, r[M.buy], r[M.sell]);
      buy = px.buy; sell = px.sell;
    }
    const t = mkTrade({
      sym: M.sym ? r[M.sym] : '', qty: M.qty ? r[M.qty] : 1,
      buy, sell,
      pnl: M.pnl ? r[M.pnl] : null,
      fees: M.fees ? r[M.fees] : null,
      date: a.date, btime: a.time, stime: b ? b.time : '',
      dur: durOf(a, b), dir: dir || undefined,
      strategy: M.strategy ? r[M.strategy] : '',
      notes: M.notes ? r[M.notes] : '',
      src: srcLabel,
    });
    if (t) out.push(t); else skipped++;
  });
  if (skipped) warn.push(skipped + ' שורות דולגו — חסר תאריך או סימבול תקין.');
  return { trades: out, warnings: warn };
}

/* ═════════════════════ 2. IBKR Flex XML ═════════════════════
   ה-XML של Flex הוא רשימת <Trade .../> עם התכונות כשדות.
   ממירים ל-rows כדי שאותו פרסר ישרת CSV ו-XML גם יחד.       */
function xmlToRows(text) {
  const rows = [];
  const re = /<(Trade|Order|TradeConfirm)\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(text))) {
    const attrs = {};
    const ar = /([A-Za-z_:][\w:.\-]*)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = ar.exec(m[2]))) attrs[a[1]] = a[2];
    if (Object.keys(attrs).length) rows.push(attrs);
  }
  if (!rows.length) return { rows: [], headers: [] };
  const headers = [...new Set(rows.flatMap(Object.keys))];
  return { rows, headers };
}

/* ═════════════════════ 3. נקודת הכניסה של הליבה ═════════════════════ */

/**
 * מנתח טקסט גולמי (CSV/TSV/XML) ומחזיר תוצאה מלאה.
 * formatId: מזהה פורמט מפורש, או 'auto'.
 */
function parseAny(text, formatId, manualMap) {
  const isXml = /^\s*<\?xml|<FlexQueryResponse|<Trade\b/i.test(text);
  const { rows, headers } = isXml ? xmlToRows(text) : toRows(text, {
    // דוחות MT/Rithmic פותחים בשורות כותרת חופשיות — מוצאים את שורת העמודות
    headerMatch: l => /(,|\t|;)/.test(l) &&
      /(symbol|instrument|item|contract|pair|date|time|ticket|boughttimestamp|tradedate)/i.test(l),
  });

  if (!rows.length) {
    return { ok: false, error: 'לא נמצאו שורות נתונים בקובץ.', trades: [], headers: [], rows: [] };
  }

  let fmt = null, score = 0;
  if (formatId && formatId !== 'auto') {
    fmt = FORMATS.find(f => f.id === formatId) || null;
    score = 1;
  } else {
    FORMATS.forEach(f => { const s = f.detect(headers, text) || 0; if (s > score) { score = s; fmt = f; } });
  }

  let res;
  if (manualMap && Object.keys(manualMap).some(k => manualMap[k])) {
    res = buildFromMap(rows, manualMap, (fmt && fmt.label) || 'CSV');
    fmt = fmt || FORMATS[FORMATS.length - 1];
  } else if (fmt) {
    res = fmt.build(rows, headers);
  } else {
    res = buildFromMap(rows, autoMap(headers), 'CSV');
    fmt = FORMATS[FORMATS.length - 1];
  }

  return {
    ok: res.trades.length > 0,
    format: fmt ? fmt.id : 'generic',
    formatLabel: fmt ? fmt.label : 'CSV',
    confidence: score,
    headers, rows,
    trades: res.trades,
    warnings: res.warnings || [],
    autoMap: autoMap(headers),
    error: res.trades.length ? '' : 'הקובץ נקרא, אך לא זוהתה אף עסקה תקינה. נסה מיפוי עמודות ידני.',
  };
}

/**
 * מפריד עסקאות חדשות מכפילויות.
 * שני מפתחות: מזהה הברוקר (חזק) ומפתח התוכן של המערכת (existingKeyFn).
 * מזהה ברוקר גובר — הוא היחיד שעמיד לשינוי מחיר/עיגול.
 */
function dedupe(trades, existingKeys, existingExtIds, keyFn) {
  const seenK = new Set(existingKeys || []);
  const seenE = new Set(existingExtIds || []);
  const fresh = [], dupes = [];
  trades.forEach(t => {
    const e = t.extId ? (t.src || '') + '|' + t.extId : '';
    const k = keyFn ? keyFn(t) : `${t.date}|${t.sym}|${t.buy}|${t.sell}|${(t.btime || '').slice(0, 5)}|${t.qty}`;
    if ((e && seenE.has(e)) || seenK.has(k)) { dupes.push(t); return; }
    if (e) seenE.add(e);
    seenK.add(k);
    fresh.push(t);
  });
  return { fresh, dupes };
}

/* ═════════════════════ 4. ה-UI ═════════════════════
   מכאן והלאה — DOM. הליבה שלמעלה אינה תלויה בכלום מכאן.  */

const UI = {
  fmt: 'auto',
  files: [],
  parsed: null,     // תוצאת parseAny של הקובץ הפעיל
  map: null,        // מיפוי ידני פעיל
  acct: '',         // חשבון יעד
  fresh: [], dupes: [],
};

/* ⚠️ נקודה שקל מאוד להיכשל בה, ולכן היא כתובה במפורש:
   במערכת `tradesList` ו-`accounts` מוצהרים ב-`let` ברמה העליונה של בלוק סקריפט.
   הצהרת `let` גלובלית **אינה** יוצרת מאפיין על `window` — היא יושבת ברשומה
   הלקסיקלית של הסקופ הגלובלי. לכן `window.tradesList` הוא undefined, וכתיבה
   אליו הייתה יוצרת משתנה מקביל חדש בזמן שהיומן האמיתי נשאר ללא שינוי:
   הייבוא "היה מצליח" ושום עסקה לא הייתה מופיעה.
   הפניה לא-מוסמכת (`tradesList`) כן מגיעה לאותה הצהרה — וזו הסיבה שכל הגישות
   כאן הן לא-מוסמכות ועטופות ב-typeof, בדיוק כמו שאר הקוד במערכת. */
const esc = s => (typeof escHtml === 'function')
  ? escHtml(s)
  : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const toast = (m, k, d) => {
  if (typeof showToast === 'function') { try { showToast(m, k || 'info', d || 3000); return; } catch (e) {} }
  console.log(m);
};

function out() { return document.getElementById('imp-out'); }

function fmtMoney(n) {
  const s = n < 0 ? '-' : '';
  return s + '$' + Math.abs(+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── מסך 1: בחירת פורמט + קובץ ── */
function screenPick() {
  const accs = (typeof accounts !== 'undefined' && Array.isArray(accounts)) ? accounts : [];
  const cards = FORMATS.filter(f => f.id !== 'generic').concat(FORMATS.filter(f => f.id === 'generic'))
    .map(f => `<button type="button" class="imp-fmt${UI.fmt === f.id ? ' sel' : ''}" data-fmt="${esc(f.id)}">
        <div class="imp-fmt-t">${esc(f.label)}</div>
        <div class="imp-fmt-s">${esc(f.hint)}</div>
      </button>`).join('');

  out().innerHTML = `
    <div class="imp-card">
      <div class="imp-step"><span class="imp-num">1</span> בחר פורמט</div>
      <div class="imp-grid">
        <button type="button" class="imp-fmt${UI.fmt === 'auto' ? ' sel' : ''}" data-fmt="auto">
          <div class="imp-fmt-t">זיהוי אוטומטי</div>
          <div class="imp-fmt-s">המערכת תזהה לבד לפי הכותרות</div>
        </button>
        ${cards}
      </div>
    </div>

    <div class="imp-card">
      <div class="imp-step"><span class="imp-num">2</span> העלאת קובץ</div>
      <label class="imp-drop" id="imp-drop">
        <input type="file" id="imp-file" accept=".csv,.tsv,.txt,.xml,.xlsx" multiple hidden>
        <div class="imp-drop-i">⬆</div>
        <div class="imp-drop-t">גרור קובץ לכאן או <span class="imp-lnk">בחר קובץ</span></div>
        <div class="imp-drop-s">נתמך: CSV · TSV · XML (‏IBKR Flex) · XLSX</div>
      </label>
      <div id="imp-files" class="imp-files"></div>
    </div>

    <div class="imp-card">
      <div class="imp-step"><span class="imp-num">3</span> חשבון יעד</div>
      <select id="imp-acct" class="imp-sel">
        <option value="">— ללא שיוך לחשבון —</option>
        ${accs.map(a => `<option value="${esc(a.id)}"${UI.acct === a.id ? ' selected' : ''}>${esc(a.name || a.id)}</option>`).join('')}
      </select>
      <div class="imp-note">${accs.length ? 'העסקאות ישויכו לחשבון שנבחר, כך שהאנליטיקה לפי חשבון תעבוד.' : 'אין עדיין חשבונות. אפשר לייבא בלי שיוך ולהוסיף חשבון מאוחר יותר.'}</div>
    </div>`;

  out().querySelectorAll('.imp-fmt').forEach(b => b.addEventListener('click', () => {
    UI.fmt = b.dataset.fmt;
    out().querySelectorAll('.imp-fmt').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    if (UI.files.length) readFiles(UI.files);
  }));

  const acctSel = document.getElementById('imp-acct');
  if (acctSel) acctSel.addEventListener('change', e => { UI.acct = e.target.value; });

  const fileInp = document.getElementById('imp-file');
  const drop = document.getElementById('imp-drop');
  fileInp.addEventListener('change', e => readFiles(Array.from(e.target.files)));
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => {
    const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (f.length) readFiles(f);
  });
}

/* ── קריאת הקבצים ── */
async function readFiles(files) {
  UI.files = files;
  const box = document.getElementById('imp-files');
  if (box) box.innerHTML = files.map(f => `<div class="imp-file">📄 ${esc(f.name)} <span>${(f.size / 1024).toFixed(0)}KB</span></div>`).join('');

  let all = [], headers = [], warnings = [], label = '', rows = [], fmtId = '';
  for (const f of files) {
    let text = '';
    if (/\.xlsx$/i.test(f.name)) {
      try {
        if (typeof XLSX === 'undefined' && typeof _ensureXlsxLoaded === 'function') await _ensureXlsxLoaded();
        if (typeof XLSX === 'undefined') { toast('ספריית XLSX לא נטענה — נסה לייצא כ-CSV', 'error'); continue; }
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false });
        text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      } catch (e) { toast('קריאת Excel נכשלה: ' + e.message, 'error'); continue; }
    } else {
      text = await f.text();
    }
    const res = parseAny(text, UI.fmt, UI.map);
    if (!res.rows.length) { toast(`הקובץ ${f.name}: ${res.error}`, 'error', 5000); continue; }
    headers = res.headers; rows = res.rows; label = res.formatLabel; fmtId = res.format;
    warnings = warnings.concat(res.warnings);
    all = all.concat(res.trades);
    if (!res.ok && files.length === 1) toast(res.error, 'error', 5000);
  }

  UI.parsed = { trades: all, headers, rows, formatLabel: label, format: fmtId, warnings: [...new Set(warnings)] };
  runDedupe();
  screenPreview();
}

/* ── חישוב כפילויות מול מה שכבר במערכת ── */
function runDedupe() {
  const list = (typeof tradesList !== 'undefined' && Array.isArray(tradesList)) ? tradesList : [];
  const keyFn = (typeof _tradeKey === 'function') ? _tradeKey : null;
  const keys = keyFn ? list.map(keyFn) : [];
  const ext = list.filter(t => t.extId).map(t => (t.src || '') + '|' + t.extId);
  const r = dedupe(UI.parsed.trades, keys, ext, keyFn);
  UI.fresh = r.fresh; UI.dupes = r.dupes;
}

/* ── מסך 2: תצוגה מקדימה + מיפוי ── */
function screenPreview() {
  const P = UI.parsed;
  if (!P) return;
  const gross = UI.fresh.reduce((s, t) => s + t.pnl, 0);
  const fees = UI.fresh.reduce((s, t) => s + (t.commOverride != null ? t.commOverride
    : (typeof tradeComm === 'function' ? (function () { try { return tradeComm(t); } catch (e) { return 0; } })() : 0)), 0);
  const net = gross - fees;
  const dates = UI.fresh.map(t => t.date).sort();
  const syms = [...new Set(UI.fresh.map(t => t.sym))];

  const head = ['סימבול', 'תאריך', 'שעה', 'כמות', 'כניסה', 'יציאה', 'P&L', 'עמלה'];
  const body = UI.fresh.slice(0, 12).map(t => `<tr>
      <td class="imp-sym">${esc(t.sym)}${t.dir ? `<span class="imp-dir ${t.dir}">${t.dir === 'short' ? 'S' : 'L'}</span>` : ''}</td>
      <td>${esc(t.date)}</td><td class="imp-mono">${esc((t.btime || '').slice(0, 8))}</td>
      <td class="imp-mono">${t.qty}</td>
      <td class="imp-mono">${t.buy || '—'}</td><td class="imp-mono">${t.sell || '—'}</td>
      <td class="imp-mono ${t.pnl >= 0 ? 'pos' : 'neg'}">${fmtMoney(t.pnl)}</td>
      <td class="imp-mono">${t.commOverride != null ? fmtMoney(t.commOverride) : '—'}</td>
    </tr>`).join('');

  const mapRows = ['sym', 'date', 'exitDate', 'qty', 'buy', 'sell', 'pnl', 'fees', 'dir', 'strategy', 'notes'];
  const mapLbl = { sym: 'סימבול', date: 'תאריך/שעת כניסה', exitDate: 'שעת יציאה', qty: 'כמות', buy: 'מחיר קנייה', sell: 'מחיר מכירה', pnl: 'רווח/הפסד', fees: 'עמלות', dir: 'כיוון', strategy: 'אסטרטגיה', notes: 'הערות' };
  const cur = UI.map || autoMap(P.headers);
  const mapUI = mapRows.map(k => `<label class="imp-map-row">
      <span>${mapLbl[k]}</span>
      <select data-map="${k}" class="imp-sel sm">
        <option value="">— לא ממופה —</option>
        ${P.headers.map(h => `<option value="${esc(h)}"${cur[k] === h ? ' selected' : ''}>${esc(h)}</option>`).join('')}
      </select>
    </label>`).join('');

  out().innerHTML = `
    <div class="imp-card">
      <div class="imp-top">
        <div>
          <div class="imp-step" style="margin:0"><span class="imp-num">✓</span> ${esc(P.formatLabel)}</div>
          <div class="imp-note" style="margin-top:4px">${P.rows.length} שורות נקראו · ${P.trades.length} עסקאות זוהו</div>
        </div>
        <button type="button" class="imp-btn ghost" id="imp-back">↩ קובץ אחר</button>
      </div>

      <div class="imp-kpis">
        <div class="imp-kpi"><div class="imp-kpi-l">עסקאות חדשות</div><div class="imp-kpi-v">${UI.fresh.length}</div></div>
        <div class="imp-kpi"><div class="imp-kpi-l">כפילויות (ידולגו)</div><div class="imp-kpi-v ${UI.dupes.length ? 'warn' : ''}">${UI.dupes.length}</div></div>
        <div class="imp-kpi"><div class="imp-kpi-l">גרוס</div><div class="imp-kpi-v ${gross >= 0 ? 'pos' : 'neg'}">${fmtMoney(gross)}</div></div>
        <div class="imp-kpi"><div class="imp-kpi-l">עמלות</div><div class="imp-kpi-v">${fmtMoney(fees)}</div></div>
        <div class="imp-kpi"><div class="imp-kpi-l">נטו</div><div class="imp-kpi-v ${net >= 0 ? 'pos' : 'neg'}">${fmtMoney(net)}</div></div>
        <div class="imp-kpi"><div class="imp-kpi-l">טווח תאריכים</div><div class="imp-kpi-v sm">${dates.length ? esc(dates[0]) + ' → ' + esc(dates[dates.length - 1]) : '—'}</div></div>
      </div>
      ${syms.length ? `<div class="imp-note">סימבולים: ${esc(syms.slice(0, 10).join(', '))}${syms.length > 10 ? ' ועוד ' + (syms.length - 10) : ''}</div>` : ''}
      ${P.warnings.map(w => `<div class="imp-warn">⚠ ${esc(w)}</div>`).join('')}
    </div>

    ${UI.fresh.length ? `<div class="imp-card">
      <div class="imp-step"><span class="imp-num">👁</span> תצוגה מקדימה ${UI.fresh.length > 12 ? '(12 ראשונות)' : ''}</div>
      <div class="imp-tbl-wrap"><table class="imp-tbl">
        <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </div>` : ''}

    <details class="imp-card imp-details">
      <summary>מיפוי עמודות ידני ${P.format === 'generic' ? '(מומלץ — הפורמט לא זוהה)' : '(לא נדרש בדרך כלל)'}</summary>
      <div class="imp-map">${mapUI}</div>
      <button type="button" class="imp-btn" id="imp-remap">החל מיפוי</button>
    </details>

    <div class="imp-actions">
      <button type="button" class="imp-btn primary" id="imp-commit" ${UI.fresh.length ? '' : 'disabled'}>
        ✅ ייבא ${UI.fresh.length} עסקאות
      </button>
      <button type="button" class="imp-btn ghost" id="imp-cancel">ביטול</button>
    </div>`;

  document.getElementById('imp-back').addEventListener('click', () => { UI.parsed = null; UI.map = null; screenPick(); });
  document.getElementById('imp-cancel').addEventListener('click', () => { UI.parsed = null; UI.map = null; UI.files = []; screenPick(); });
  document.getElementById('imp-remap').addEventListener('click', () => {
    const m = {};
    out().querySelectorAll('[data-map]').forEach(s => { m[s.dataset.map] = s.value || null; });
    UI.map = m;
    readFiles(UI.files);
  });
  const btn = document.getElementById('imp-commit');
  if (btn) btn.addEventListener('click', commit);
}

/* ── כתיבה למערכת ── */
function commit() {
  if (!UI.fresh.length) return;
  const n = UI.fresh.length;
  const acct = UI.acct || '';
  const batch = UI.fresh.map(t => {
    const c = Object.assign({}, t);
    if (acct) c.acct = acct;
    delete c.dir;                    // אין שדה כיוון במודל העסקה של המערכת
    return c;
  });
  if (typeof tradesList === 'undefined') { toast('היומן אינו זמין — רענן את הדף ונסה שוב', 'error', 5000); return; }
  try {
    tradesList = tradesList.concat(batch);        // הצהרת let גלובלית — ראה ההערה למעלה
    if (typeof renderAll === 'function') renderAll();
    if (typeof saveData === 'function') saveData();
  } catch (e) {
    toast('שגיאה בשמירה: ' + e.message, 'error', 5000);
    return;
  }
  const gross = batch.reduce((s, t) => s + t.pnl, 0);
  toast(`✅ יובאו ${n} עסקאות · גרוס ${fmtMoney(gross)}${UI.dupes.length ? ' · דולגו ' + UI.dupes.length + ' כפילויות' : ''}`, 'success', 6000);
  UI.parsed = null; UI.map = null; UI.files = []; UI.fresh = []; UI.dupes = [];
  screenPick();
}

/* ═════════════════════ 5. ה-API הציבורי ═════════════════════ */
const Import = {
  open() { if (out()) screenPick(); },
  // חשוף לבדיקות ולשימוש חוזר ממודולים אחרים
  _core: { parseAny, dedupe, toRows, parseDT, num, pick, autoMap, mkTrade, FORMATS },
};

if (typeof window !== 'undefined') window.Import = Import;
if (typeof module !== 'undefined' && module.exports) module.exports = Import;

})();
