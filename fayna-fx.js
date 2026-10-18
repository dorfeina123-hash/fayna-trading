/* ═════════════════════════════════════════════════════════════════════
   fayna-fx.js — USD/ILS exchange rate by date (v74 hotfix 1, 2026-10-18)
   ---------------------------------------------------------------------
   Why: conversions used a hand-typed monthly table that stopped at
   2026-06, and several forms defaulted to 3.65 (≈18% off in Oct 2026).

   Source: Frankfurter (European Central Bank reference rates, free, no key,
   CORS-enabled): https://api.frankfurter.dev/v1/<from>..<to>?from=USD&to=ILS
   ECB publishes on business days; weekends/holidays use the previous
   business day. Cached in localStorage and refreshed at most every 6 hours.

   rate(date) order:
     1. exact or previous published day (within 10 days) from the cache
     2. monthly table HIST_RATES (index.html) — offline fallback
     3. most recent known rate
   Never mutates saved records: callers use a record's own saved rate first.
   ═════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var KEY = 'fayna_fx_usdils_v1';
  var API = 'https://api.frankfurter.dev/v1/';
  var START = '2023-01-01';
  var MAX_AGE = 6 * 3600 * 1000;
  var days = {}; var sorted = []; var fetchedAt = 0; var source = 'table';

  function iso(d) { return d.toISOString().slice(0, 10); }
  function valid(r) { return typeof r === 'number' && isFinite(r) && r > 1 && r < 10; }

  function load(obj) {
    if (!obj || !obj.days) return false;
    var next = {};
    Object.keys(obj.days).forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && valid(obj.days[k])) next[k] = obj.days[k]; });
    if (!Object.keys(next).length) return false;
    days = next; sorted = Object.keys(days).sort(); fetchedAt = obj.fetchedAt || 0; source = 'ecb';
    return true;
  }
  try { load(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { /* private mode */ }

  function table(d) {
    var t = (typeof HIST_RATES !== 'undefined') ? HIST_RATES : null;
    if (!t) return null;
    if (valid(t[d.slice(0, 7)])) return t[d.slice(0, 7)];
    var ks = Object.keys(t).sort(), best = null;
    for (var i = 0; i < ks.length; i++) { if (ks[i] <= d.slice(0, 7)) best = t[ks[i]]; }
    return valid(best) ? best : (valid(t[ks[ks.length - 1]]) ? t[ks[ks.length - 1]] : null);
  }

  /** Index of the last cached day ≤ d (binary search), or -1. */
  function prevIdx(d) {
    var lo = 0, hi = sorted.length - 1, ans = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (sorted[mid] <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }

  function rate(date) {
    var d = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = iso(new Date());
    if (sorted.length) {
      var i = prevIdx(d);
      if (i >= 0) {
        var gap = (Date.parse(d) - Date.parse(sorted[i])) / 864e5;
        if (gap <= 10) return days[sorted[i]];
        if (d > sorted[sorted.length - 1]) return days[sorted[sorted.length - 1]]; // today/future: latest
      }
    }
    var t = table(d);
    if (t) return t;
    return sorted.length ? days[sorted[sorted.length - 1]] : 3.0;
  }

  function latest() { return rate(iso(new Date())); }

  var inflight = null;
  function refresh(force) {
    if (inflight) return inflight;
    if (!force && fetchedAt && Date.now() - fetchedAt < MAX_AGE) return Promise.resolve(false);
    if (typeof fetch !== 'function') return Promise.resolve(false);
    var url = API + START + '..' + iso(new Date()) + '?from=USD&to=ILS';
    inflight = fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('fx_http_' + r.status);
      return r.json();
    }).then(function (j) {
      var out = {};
      Object.keys((j && j.rates) || {}).forEach(function (k) { var v = j.rates[k] && j.rates[k].ILS; if (valid(v)) out[k] = v; });
      if (!load({ days: out, fetchedAt: Date.now() })) throw new Error('fx_empty');
      try { localStorage.setItem(KEY, JSON.stringify({ days: days, fetchedAt: fetchedAt })); } catch (e) { /* quota */ }
      try { root.dispatchEvent(new CustomEvent('fayna:fx-updated', { detail: { latest: latest() } })); } catch (e) { /* old browsers */ }
      return true;
    }).catch(function () { return false; }).then(function (ok) { inflight = null; return ok; });
    return inflight;
  }

  function info() {
    return { source: source, fetchedAt: fetchedAt, lastDay: sorted.length ? sorted[sorted.length - 1] : null, latest: latest() };
  }

  root.FaynaFX = { rate: rate, latest: latest, refresh: refresh, info: info, _load: load };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FaynaFX;
  if (typeof document !== 'undefined') setTimeout(function () { refresh(false); }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
