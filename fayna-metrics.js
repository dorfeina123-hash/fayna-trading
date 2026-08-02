/* ══════════════════════════════════════════════════════════════════════════
   FAYNA METRICS (v47) — the single source of truth for every number.

   Pure functions only. No DOM, no Firebase, no globals, no state.
   Input: an array of trades + an options object. Output: numbers.

   Why it is built this way: Win Rate, Profit Factor, Drawdown, R and
   Expectancy are needed by Strategy Merge, the Dashboard, Self Protection
   and Copy Trading. Four private copies of the same formula is how two
   screens end up showing different numbers for the same thing. It is also
   the reason this file can be unit-tested in Node against real assertions —
   a wrong financial number is the most expensive bug this system can ship.

   Trade shape (as actually stored by Fayna):
     { sym, qty, buy, sell, pnl, date:'YYYY-MM-DD', btime:'HH:MM:SS',
       stime, dur, strategy, setupType, acct, stopLoss, commOverride, ... }
     `pnl` is GROSS. Net = pnl - commission.

   Commission depends on app settings, so it is INJECTED rather than
   recomputed here — that keeps this file pure and keeps one commission
   rule in the app.
   ════════════════════════════════════════════════════════════════════════ */

(function (root) {
  'use strict';

  /* ─────────── helpers ─────────── */
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const sum = a => a.reduce((s, x) => s + x, 0);
  const r2 = v => Math.round(v * 100) / 100;
  const safeDiv = (a, b) => (b === 0 ? null : a / b);   // null, never Infinity/NaN

  /* Direction is not stored on a trade. It can be inferred from where the
     stop sits relative to the fill prices: a long stops below, a short above.
     Returns null when there is no stop — the caller must then treat any
     direction-dependent metric as unavailable rather than guessing. */
  function direction(t) {
    const sl = t.stopLoss;
    if (sl == null || sl === '' || isNaN(+sl)) return null;
    const stop = +sl, lo = Math.min(num(t.buy), num(t.sell)), hi = Math.max(num(t.buy), num(t.sell));
    if (stop < lo) return 'long';
    if (stop > hi) return 'short';
    return null;                        // stop between fills — cannot tell
  }

  /* Entry price for R. For a long the entry is the buy, for a short the sell. */
  function entryPrice(t) {
    const d = direction(t);
    if (d === 'long')  return num(t.buy);
    if (d === 'short') return num(t.sell);
    return null;
  }

  /* R multiple = realised P&L / money that was at risk.
     Returns null when the trade carries no usable stop. Never guesses. */
  function rMultiple(t, netOf, multOf) {
    const d = direction(t);
    if (!d) return null;
    const entry = entryPrice(t);
    const stop  = +t.stopLoss;
    const perUnit = Math.abs(entry - stop);
    if (!perUnit) return null;
    const mult = multOf ? num(multOf(t.sym)) || 1 : 1;
    const risk = perUnit * num(t.qty) * mult;
    if (!risk) return null;
    return netOf(t) / risk;
  }

  /* minutes between fills; falls back to the free-text `dur` field */
  function holdMinutes(t) {
    const toMin = hms => {
      if (!hms || typeof hms !== 'string') return null;
      const p = hms.split(':').map(Number);
      if (p.some(isNaN) || p.length < 2) return null;
      return p[0] * 60 + p[1] + (p[2] || 0) / 60;
    };
    const a = toMin(t.btime), b = toMin(t.stime);
    if (a != null && b != null) {
      let d = b - a;
      if (d < 0) d += 24 * 60;               // crossed midnight
      return d;
    }
    const m = String(t.dur || '').match(/(\d+(?:\.\d+)?)\s*(h|hr|hour|שע|m|min|דק)?/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return /^(h|hr|hour|שע)/i.test(m[2] || '') ? v * 60 : v;
  }

  const weekKey = iso => {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    const t = new Date(d);
    t.setDate(t.getDate() + 4 - (t.getDay() || 7));          // ISO week
    const y0 = new Date(t.getFullYear(), 0, 1);
    return t.getFullYear() + '-W' + String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, '0');
  };
  const monthKey = iso => String(iso || '').slice(0, 7);

  /* ─────────── the main computation ─────────── */
  function compute(trades, opts) {
    opts = opts || {};
    const netOf  = opts.netOf  || (t => num(t.pnl));
    const commOf = opts.commOf || (t => num(t.pnl) - netOf(t));
    const multOf = opts.multOf || null;

    const list = (trades || []).filter(Boolean);
    const n = list.length;

    /* an empty set must return zeros and nulls — never NaN, never Infinity */
    if (!n) return emptyResult();

    const sorted = list.slice().sort((a, b) =>
      (a.date + (a.btime || '')).localeCompare(b.date + (b.btime || '')));

    const nets = sorted.map(netOf);
    const wins = nets.filter(v => v > 0);
    const loss = nets.filter(v => v < 0);
    const scratch = nets.filter(v => v === 0).length;

    const grossProfit = sum(wins);
    const grossLoss   = Math.abs(sum(loss));
    const netProfit   = sum(nets);

    /* equity curve + drawdown in one pass */
    let eq = 0, peak = 0, maxDD = 0, maxDDPct = 0;
    const equity = [], ddSeries = [];
    sorted.forEach((t, i) => {
      eq += nets[i];
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDD) maxDD = dd;
      if (peak > 0) maxDDPct = Math.max(maxDDPct, dd / peak * 100);
      equity.push({ i, date: t.date, equity: r2(eq), peak: r2(peak) });
      ddSeries.push({ i, date: t.date, dd: r2(-dd) });
    });

    /* streaks */
    let winStreak = 0, lossStreak = 0, curW = 0, curL = 0;
    nets.forEach(v => {
      if (v > 0) { curW++; curL = 0; winStreak = Math.max(winStreak, curW); }
      else if (v < 0) { curL++; curW = 0; lossStreak = Math.max(lossStreak, curL); }
      else { curW = 0; curL = 0; }
    });

    /* R — only over trades that actually carry a stop, and we report how many */
    const rVals = [];
    sorted.forEach(t => { const r = rMultiple(t, netOf, multOf); if (r != null) rVals.push(r); });

    /* hold time — same honesty: coverage is reported */
    const holds = [];
    sorted.forEach(t => { const h = holdMinutes(t); if (h != null && h >= 0) holds.push(h); });

    /* period aggregation */
    const byDay = {}, byMonth = {}, byWeek = {};
    sorted.forEach((t, i) => {
      byDay[t.date]        = (byDay[t.date] || 0) + nets[i];
      byMonth[monthKey(t.date)] = (byMonth[monthKey(t.date)] || 0) + nets[i];
      byWeek[weekKey(t.date)]   = (byWeek[weekKey(t.date)] || 0) + nets[i];
    });
    const days = Object.keys(byDay).length;

    /* buckets */
    const byHour = {}, byWeekday = {}, bySymbol = {}, byStrategy = {}, byAccount = {};
    const bump = (o, k, v) => {
      if (k == null || k === '') k = '—';
      (o[k] = o[k] || { net: 0, n: 0, wins: 0 });
      o[k].net += v; o[k].n++; if (v > 0) o[k].wins++;
    };
    sorted.forEach((t, i) => {
      const h = (t.btime || '').slice(0, 2);
      bump(byHour, h ? h + ':00' : '—', nets[i]);
      const d = new Date(t.date + 'T00:00:00');
      bump(byWeekday, isNaN(d) ? '—' : d.getDay(), nets[i]);
      bump(bySymbol,  t.sym, nets[i]);
      bump(byStrategy, t.strategy, nets[i]);
      bump(byAccount, t.acct, nets[i]);
    });

    const avg = a => a.length ? sum(a) / a.length : null;
    const pf = safeDiv(grossProfit, grossLoss);

    return {
      count: n,
      wins: wins.length,
      losses: loss.length,
      scratch,

      winRate: r2(wins.length / n * 100),
      /* null when there are no losses at all — an "infinite" profit factor is
         not a number the user should be shown as if it were one */
      profitFactor: pf == null ? null : r2(pf),
      profitFactorNote: grossLoss === 0 ? 'אין עסקאות מפסידות בתקופה' : null,

      expectancy: r2(netProfit / n),
      netProfit: r2(netProfit),
      grossProfit: r2(grossProfit),
      grossLoss: r2(grossLoss),
      avgWinner: wins.length ? r2(avg(wins)) : 0,
      avgLoser:  loss.length ? r2(avg(loss)) : 0,
      largestWin:  wins.length ? r2(Math.max(...wins)) : 0,
      largestLoss: loss.length ? r2(Math.min(...loss)) : 0,

      avgR: rVals.length ? r2(avg(rVals)) : null,
      rCoverage: { withStop: rVals.length, total: n },
      rValues: rVals.map(r2),
      expectancyR: rVals.length ? r2(avg(rVals)) : null,

      maxDrawdown: r2(maxDD),
      maxDrawdownPct: r2(maxDDPct),
      maxWinStreak: winStreak,
      maxLossStreak: lossStreak,

      avgTradeTimeMin: holds.length ? r2(avg(holds)) : null,
      timeCoverage: { withTime: holds.length, total: n },

      totalContracts: sum(sorted.map(t => num(t.qty))),
      totalCommission: r2(sum(sorted.map(commOf))),
      /* Fayna stores one commission figure per trade; exchange fees are not
         tracked separately, so this is reported as included rather than as a
         second number invented out of nothing. */
      totalFees: null,
      feesNote: 'עמלות ו-fees נשמרים כשדה אחד במערכת',

      tradingDays: days,
      avgDailyProfit:   days ? r2(netProfit / days) : 0,
      avgWeeklyProfit:  Object.keys(byWeek).length  ? r2(netProfit / Object.keys(byWeek).length)  : 0,
      avgMonthlyProfit: Object.keys(byMonth).length ? r2(netProfit / Object.keys(byMonth).length) : 0,
      avgTradesPerDay:  days ? r2(n / days) : 0,

      equity, ddSeries,
      byDay, byWeek, byMonth, byHour, byWeekday, bySymbol, byStrategy, byAccount,
      netsSorted: nets.map(r2),
      firstDate: sorted[0].date,
      lastDate: sorted[n - 1].date,
    };
  }

  function emptyResult() {
    return {
      count: 0, wins: 0, losses: 0, scratch: 0,
      winRate: 0, profitFactor: null, profitFactorNote: null,
      expectancy: 0, netProfit: 0, grossProfit: 0, grossLoss: 0,
      avgWinner: 0, avgLoser: 0, largestWin: 0, largestLoss: 0,
      avgR: null, rCoverage: { withStop: 0, total: 0 }, rValues: [], expectancyR: null,
      maxDrawdown: 0, maxDrawdownPct: 0, maxWinStreak: 0, maxLossStreak: 0,
      avgTradeTimeMin: null, timeCoverage: { withTime: 0, total: 0 },
      totalContracts: 0, totalCommission: 0, totalFees: null,
      feesNote: 'עמלות ו-fees נשמרים כשדה אחד במערכת',
      tradingDays: 0, avgDailyProfit: 0, avgWeeklyProfit: 0, avgMonthlyProfit: 0,
      avgTradesPerDay: 0,
      equity: [], ddSeries: [], byDay: {}, byWeek: {}, byMonth: {},
      byHour: {}, byWeekday: {}, bySymbol: {}, byStrategy: {}, byAccount: {},
      netsSorted: [], firstDate: null, lastDate: null,
    };
  }

  /* ─────────── correlation between strategies ───────────
     Correlated on DAILY P&L, not on individual trades — trades have no shared
     time axis, days do. Only days on which both strategies traded are used;
     pairing a trading day against a day the other strategy sat out would
     manufacture correlation that is not there. */
  function correlation(dayMapA, dayMapB, minOverlap) {
    minOverlap = minOverlap || 5;
    const keys = Object.keys(dayMapA).filter(k => k in dayMapB);
    const nOv = keys.length;
    if (nOv < minOverlap) return { r: null, overlap: nOv, reason: 'חפיפה קטנה מדי' };

    const a = keys.map(k => dayMapA[k]), b = keys.map(k => dayMapB[k]);
    const ma = sum(a) / nOv, mb = sum(b) / nOv;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < nOv; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      cov += da * db; va += da * da; vb += db * db;
    }
    if (va === 0 || vb === 0) return { r: null, overlap: nOv, reason: 'אין שונות' };
    return { r: Math.round(cov / Math.sqrt(va * vb) * 1000) / 1000, overlap: nOv, reason: null };
  }

  /* ─────────── Monte Carlo ───────────
     Bootstrap resampling WITH REPLACEMENT — not a reshuffle.

     This distinction matters and is easy to get wrong. Reordering the same
     trades cannot change their sum, so a shuffle produces an identical final
     equity in every single run: p5 = p50 = p95, a spread that only looks
     informative. Drawing n trades at random *with replacement* from the same
     pool varies the mix, which is what actually answers "how else could a
     run of n trades from this strategy have gone".

     Max drawdown is informative under either method; final equity is only
     informative under resampling.

     The assumption is that trades are independent and identically
     distributed. Real trading often violates it — streaks cluster, market
     regimes change. This maps the risk in what already happened; it does not
     predict what comes next, and the caller must say so on screen. */
  function monteCarlo(nets, opts) {
    opts = opts || {};
    const runs = Math.min(opts.runs || 1000, 5000);
    const n = nets.length;
    if (n < 10) return { ok: false, reason: 'נדרשות לפחות 10 עסקאות' };

    const finals = [], dds = [];
    let seed = (opts.seed || 123456789) | 0;
    const rnd = () => {                       // deterministic — same input, same output
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return ((seed >>> 0) % 1000000) / 1000000;
    };

    for (let r = 0; r < runs; r++) {
      let eq = 0, peak = 0, maxDD = 0;
      for (let i = 0; i < n; i++) {
        eq += nets[Math.floor(rnd() * n)];    // with replacement
        if (eq > peak) peak = eq;
        const d = peak - eq;
        if (d > maxDD) maxDD = d;
      }
      finals.push(eq); dds.push(maxDD);
    }
    finals.sort((a, b) => a - b); dds.sort((a, b) => a - b);
    const q = (arr, p) => r2(arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]);
    const observed = r2(nets.reduce((s, v) => s + v, 0));

    return {
      ok: true, runs, method: 'resample', observed,
      final: { p5: q(finals, .05), p25: q(finals, .25), p50: q(finals, .50), p75: q(finals, .75), p95: q(finals, .95) },
      drawdown: { p50: q(dds, .50), p75: q(dds, .75), p95: q(dds, .95), worst: r2(dds[dds.length - 1]) },
      probProfit: r2(finals.filter(v => v > 0).length / runs * 100),
      assumption: 'דגימה חוזרת עם החזרה מתוך העסקאות שלך. ההדמיה מניחה שהעסקאות בלתי תלויות ומאותה התפלגות — במסחר אמיתי לא תמיד כך. זו מפת סיכון של העבר, לא תחזית.',
    };
  }

  /* ─────────── composite scores ───────────
     Every score returns its own breakdown. A bare "73 / 100" looks
     authoritative whether or not it means anything, so the parts that
     produced it always travel with it. */
  function scores(m, corrAvg) {
    const clamp = v => Math.max(0, Math.min(100, v));
    const parts = [];
    const add = (label, value, weight, detail) => { parts.push({ label, value: Math.round(value), weight, detail }); };

    const pf = m.profitFactor;
    add('רווחיות', pf == null ? (m.netProfit > 0 ? 100 : 0) : clamp((pf - 0.5) / 1.5 * 100), 0.30,
        pf == null ? 'אין הפסדים בתקופה' : 'Profit Factor ' + pf);

    add('עקביות', clamp(m.winRate), 0.15, 'Win Rate ' + m.winRate + '%');

    const ddRatio = m.netProfit > 0 ? m.maxDrawdown / m.netProfit : 1;
    add('שליטה בדראו-דאון', clamp((1 - Math.min(ddRatio, 1)) * 100), 0.25,
        'דראו-דאון ' + m.maxDrawdown + ' מול רווח ' + m.netProfit);

    add('עמידות ברצף הפסדים', clamp(100 - m.maxLossStreak * 10), 0.15,
        'רצף הפסדים מקסימלי ' + m.maxLossStreak);

    add('פיזור', corrAvg == null ? 50 : clamp((1 - corrAvg) * 100), 0.15,
        corrAvg == null ? 'אין מספיק נתונים למתאם' : 'מתאם ממוצע ' + corrAvg);

    const total = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0));
    return { total: clamp(total), parts };
  }

  const API = {
    compute, correlation, monteCarlo, scores,
    direction, entryPrice, rMultiple, holdMinutes, weekKey, monthKey,
    _internal: { safeDiv, r2 },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Metrics = API;
})(typeof window !== 'undefined' ? window : globalThis);
