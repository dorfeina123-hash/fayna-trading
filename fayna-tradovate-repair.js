/* ═════════════════════════════════════════════════════════════════════
   fayna-tradovate-repair.js — v74 hotfix 1 (2026-10-18)
   ---------------------------------------------------------------------
   Before v74h1 the importer read Tradovate losses written as "$(12.50)"
   as +12.50. Trades already imported keep the wrong sign until fixed.

   A trade is a candidate only if ALL hold:
     - imported from Tradovate (t.src === 'Tradovate')
     - both buy and sell prices exist
     - P&L is non-zero and its sign contradicts (sell − buy)
   For a pair of fills, P&L always has the sign of (sell − buy), so a
   contradiction can only come from the sign bug.

   Nothing changes without the user's confirmation. Asked once per session.
   ═════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ASKED = 'fayna_tv_sign_fix_v74h1_asked';

  function candidates(list) {
    return (list || []).filter(function (t) {
      if (!t || t.src !== 'Tradovate') return false;
      var b = Number(t.buy), s = Number(t.sell), p = Number(t.pnl);
      if (!(b > 0) || !(s > 0) || !p || !isFinite(p) || b === s) return false;
      return Math.sign(p) !== Math.sign(s - b);
    });
  }

  async function check() {
    var list = (typeof tradesList !== 'undefined') ? tradesList : [];
    var c = candidates(list);
    if (!c.length) return 0;
    try { if (sessionStorage.getItem(ASKED)) return 0; sessionStorage.setItem(ASKED, '1'); } catch (e) { /* ignore */ }
    var ask = typeof customConfirm === 'function'
      ? customConfirm((c.length === 1 ? 'נמצאה עסקה אחת שיובאה' : 'נמצאו ' + c.length + ' עסקאות שיובאו') + ' מ-Tradovate עם סימן רווח/הפסד הפוך (הפסד נרשם כרווח), בגלל תקלה בייבוא שתוקנה היום. לתקן ' + (c.length === 1 ? 'אותה' : 'אותן') + ' עכשיו? שאר הנתונים לא ישתנו.')
      : Promise.resolve(false);
    if (!(await ask)) return 0;
    c.forEach(function (t) { t.pnl = -Number(t.pnl); t.pnlSignFixed = 'v74h1'; });
    try { if (typeof saveData === 'function') saveData(); } catch (e) { /* keep going */ }
    try { if (typeof renderAll === 'function') renderAll(); } catch (e) { /* ignore */ }
    if (typeof showToast === 'function') showToast(c.length === 1 ? 'עסקת Tradovate אחת תוקנה' : c.length + ' עסקאות Tradovate תוקנו', 'success');
    return c.length;
  }

  var tries = 0;
  var iv = typeof document === 'undefined' ? null : setInterval(function () {
    tries++;
    if (tries > 300) { clearInterval(iv); return; }
    try {
      // wait for the subscription notice (fayna-announce.js) to be closed first
      if (tries > 2 && !document.getElementById('fayna-announce') && typeof currentUser !== 'undefined' && currentUser && typeof tradesList !== 'undefined' && tradesList.length) {
        clearInterval(iv); check();
      }
    } catch (e) { clearInterval(iv); }
  }, 2000);

  if (typeof window !== 'undefined') window.FaynaTradovateRepair = { candidates: candidates, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = { candidates: candidates };
})();
