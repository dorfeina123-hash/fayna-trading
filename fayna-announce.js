/* ═════════════════════════════════════════════════════════════════════
   fayna-announce.js — v74 hotfix 1 (2026-10-18)
   In-app notice to signed-in users about the upcoming subscription model.
   Shown inside the site only: no email, no push, no broadcast, no writes
   to Firestore. Dismissal is remembered per user in this browser.
   Nothing about access or billing changes with this file.
   ═════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ID = 'billing-2026-10';
  var TITLE = 'עדכון חשוב: Fayna Trading עוברת למודל מנויים';
  var LINES = [
    'בקרוב Fayna Trading תעבור למודל מנויים עם שתי חבילות: Basic ו-Pro.',
    'כל מי שנרשם יקבל 14 ימי ניסיון מלאים. הניסיון מתחיל בהזנת אמצעי תשלום, ובסופו המנוי ממשיך בחבילה שבחרתם — אלא אם תבטלו. ביטול בלחיצה אחת, ובתקופת הניסיון ללא שום חיוב.',
    'למשתמשים הקיימים: ביום ההשקה תקבלו 14 ימי ניסיון מלאים, ורק לאחר מכן תתבקשו לבחור חבילה.',
    'נעדכן מראש על מועד ההשקה והמחירים. כרגע אין צורך לעשות דבר, ושום דבר לא יחויב בלי אישור מפורש שלכם.',
  ];

  function key() {
    var uid = (typeof currentUser !== 'undefined' && currentUser && (currentUser.uid || currentUser.email)) || 'anon';
    return 'fayna_announce_' + ID + '_' + uid;
  }
  function seen() { try { return localStorage.getItem(key()) === '1'; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(key(), '1'); } catch (e) { /* private mode */ } }

  function show() {
    if (document.getElementById('fayna-announce')) return;
    var box = document.createElement('section');
    box.id = 'fayna-announce';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-labelledby', 'fayna-announce-title');
    box.dir = 'rtl';
    box.style.cssText = 'position:fixed;z-index:9000;top:72px;left:50%;transform:translateX(-50%);width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;'
      + 'background:var(--bg2,#1a2533);color:var(--t1,#e6eff8);border:1px solid rgba(191,161,94,.55);border-radius:14px;'
      + 'padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.35);font-size:14px;line-height:1.65';
    var h = document.createElement('h2');
    h.id = 'fayna-announce-title';
    h.textContent = TITLE;
    h.style.cssText = 'margin:0 0 8px;font-size:16px;color:var(--go,#d8b25c)';
    box.appendChild(h);
    LINES.forEach(function (l) { var p = document.createElement('p'); p.textContent = l; p.style.margin = '0 0 6px'; box.appendChild(p); });
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'הבנתי';
    btn.style.cssText = 'margin-top:8px;min-height:44px;padding:0 22px;border-radius:10px;border:0;background:#d8b25c;color:#1a1408;font:inherit;font-weight:700;cursor:pointer';
    btn.addEventListener('click', function () { markSeen(); box.remove(); });
    box.appendChild(btn);
    document.body.appendChild(box);
  }

  function maybeShow() {
    var signedIn = typeof currentUser !== 'undefined' && currentUser && (currentUser.uid || currentUser.email);
    if (!signedIn || seen()) return false;
    show();
    return true;
  }

  if (typeof document === 'undefined') return;
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    var signedIn = false;
    try { signedIn = typeof currentUser !== 'undefined' && !!currentUser; } catch (e) { /* not ready */ }
    if (signedIn) { clearInterval(iv); maybeShow(); }
    else if (tries > 150) clearInterval(iv);
  }, 2000);
  window.FaynaAnnounce = { show: show, maybeShow: maybeShow, TITLE: TITLE, LINES: LINES };
})();
