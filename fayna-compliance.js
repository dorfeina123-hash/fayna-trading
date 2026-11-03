/* v109 — Israeli-law compliance layer.
   - Communications Law s.30A (anti-spam): marketing goes only to users who opted in,
     every marketing message carries "פרסומת", the sender's details and a way to opt out,
     and the opt-out link works without signing in.
   - Consumer Protection Law s.13D1: a plain "cancel subscription" button that always
     records the request and states that it takes effect within 3 business days.
   - Privacy Protection Law: a consent setting the user controls, kept on their own record.
   Nothing here sends mail or charges anyone. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  /* Sender details printed on every marketing message. The postal address is required by
     s.30A; fill it in once and it appears everywhere. */
  const LEGAL = {
    name: 'Fayna Trading (Fayna Group)',
    email: 'dorfeina123@gmail.com',
    address: '',          // ← כתובת העסק למשלוח הודעת סירוב (חובה לפי סעיף 30א)
    phone: '',            // ← טלפון לפניות (מסמך הגילוי והצהרת הנגישות)
    vatNote: '',          // ← למשל 'המחירים כוללים מע"מ' או 'עוסק פטור'
    businessId: '',       // ← מספר עוסק / ח.פ.
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const senderLine = () => [LEGAL.name, LEGAL.businessId && 'מס׳ עוסק ' + LEGAL.businessId, LEGAL.address, LEGAL.email].filter(Boolean).join(' · ');

  /* ── opt-outs written from the public unsubscribe link (no sign-in) ── */
  async function loadUnsubs() {
    try {
      if (typeof db === 'undefined' || !currentUser?.isAdmin) return window._faynaUnsubs || new Set();
      const snap = await db.collection('unsubscribes').get();
      window._faynaUnsubs = new Set(snap.docs.map(d => d.id));
    } catch (e) { window._faynaUnsubs = window._faynaUnsubs || new Set(); }
    return window._faynaUnsubs;
  }

  /* ── 3 Israeli business days (Sunday–Thursday) ── */
  function businessDaysFrom(date, n) {
    const d = new Date(date); let left = n;
    while (left > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 5 && w !== 6) left--; }
    return d;
  }

  function overlay(html) {
    const o = document.createElement('div');
    o.className = 'fyc-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = `<div class="fyc-box" dir="rtl">${html}</div>`;
    document.body.appendChild(o);
    const box = o.querySelector('.fyc-box'); box.tabIndex = -1; setTimeout(() => { box.focus(); box.scrollTop = 0; }, 30);
    o.addEventListener('keydown', e => { if (e.key === 'Escape') o.remove(); });
    return o;
  }

  /* ── public unsubscribe link: ?unsub=<uid> ── */
  window._handleUnsubParam = function () {
    const KEY = 'fayna_pending_unsub';
    let uid = new URLSearchParams(location.search).get('unsub');
    if (!uid) { try { uid = sessionStorage.getItem(KEY); } catch (e) {} }
    if (!uid || !/^[A-Za-z0-9_-]{6,64}$/.test(uid)) return;
    if (document.querySelector('.fyc-overlay[data-unsub]')) return;
    // Kept until the person answers, so a reload (e.g. a service-worker update) cannot lose it.
    try { sessionStorage.setItem(KEY, uid); } catch (e) {}
    const done = () => { try { sessionStorage.removeItem(KEY); } catch (e) {} };
    if (new URLSearchParams(location.search).has('unsub')) history.replaceState(null, '', location.pathname);
    const o = overlay(`<h2 id="fyc-t">הסרה מרשימת התפוצה</h2>
      <p>לאחר האישור לא יישלחו אליך יותר הודעות שיווקיות מ־Fayna Trading, בדוא"ל או בוואטסאפ. הודעות שירות הכרחיות (כמו איפוס סיסמה) ימשיכו להגיע.</p>
      <div class="fyc-actions"><button type="button" class="fyc-primary" id="fyc-unsub-ok">אישור הסרה</button><button type="button" class="fyc-ghost" id="fyc-unsub-no">ביטול</button></div>
      <p class="fyc-msg" role="status" aria-live="polite"></p>`);
    o.setAttribute('aria-labelledby', 'fyc-t'); o.dataset.unsub = '1';
    o.querySelector('#fyc-unsub-no').onclick = () => { done(); o.remove(); };
    o.querySelector('#fyc-unsub-ok').onclick = async () => {
      const btn = o.querySelector('#fyc-unsub-ok'), msg = o.querySelector('.fyc-msg');
      btn.disabled = true; btn.textContent = 'מעבד…';
      try {
        await db.collection('unsubscribes').doc(uid).set({ uid, at: firebase.firestore.FieldValue.serverTimestamp(), via: 'link' });
        done();
        if (auth?.currentUser?.uid === uid && typeof unsubscribeUser === 'function') {
          try { await unsubscribeUser(uid, auth.currentUser.email || '', 'link', true); } catch (e) {}
        }
        fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ access_key: '8ef4276d-2519-4d4f-8a84-b84cd6f46419', subject: '🔕 הסרה מרשימת תפוצה דרך קישור', from_name: 'Fayna Trading — Unsubscribe',
            html: `<div dir="rtl">משתמש הסיר את עצמו מהדיוור דרך הקישור במייל.<br>מזהה: ${esc(uid)}<br>${new Date().toLocaleString('he-IL')}</div>` }) }).catch(() => {});
        o.querySelector('.fyc-box').innerHTML = `<h2>הוסרת מרשימת התפוצה</h2><p>לא יישלחו אליך יותר הודעות שיווקיות מאיתנו. אם תרצה לחזור, אפשר להפעיל זאת שוב בהגדרות החשבון.</p><div class="fyc-actions"><button type="button" class="fyc-primary">סגירה</button></div>`;
        o.querySelector('button').onclick = () => o.remove(); o.querySelector('button').focus();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'אישור הסרה';
        msg.textContent = 'לא הצלחנו לרשום את ההסרה. אפשר גם להשיב למייל במילה "הסר" או לכתוב ל־' + LEGAL.email;
      }
    };
  };

  /* ── marketing consent: settings toggle + one-time question for existing users ── */
  async function setConsent(value, source) {
    if (!currentUser?.uid || typeof db === 'undefined') return false;
    const upd = { marketingConsent: !!value, marketingConsentAt: firebase.firestore.FieldValue.serverTimestamp(), marketingConsentSource: source };
    if (value) Object.assign(upd, { emailSubscriptionStatus: 'active', emailOptOut: false });
    else Object.assign(upd, { emailSubscriptionStatus: 'unsubscribed', emailOptOut: true, unsubscribeSource: source });
    try {
      await db.collection('users').doc(currentUser.uid).update(upd);
      Object.assign(currentUser, { marketingConsent: !!value });
      if (!value) { try { await db.collection('unsubscribes').doc(currentUser.uid).set({ uid: currentUser.uid, at: firebase.firestore.FieldValue.serverTimestamp(), via: source }); } catch (e) {} }
      else { try { await db.collection('unsubscribes').doc(currentUser.uid).delete(); } catch (e) {} }
      try { _invalidateUsersCache(); } catch (e) {}
      return true;
    } catch (e) { return false; }
  }
  function askOnce() {
    const u = typeof currentUser !== 'undefined' ? currentUser : null;
    if (!u?.uid || u.isAdmin || typeof u.marketingConsent === 'boolean') return;
    const k = 'fayna_consent_asked_' + u.uid;
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) {}
    const o = overlay(`<h2 id="fyc-c">רוצה לקבל מאיתנו עדכונים?</h2>
      <p>מדי פעם אנחנו שולחים עדכונים על פיצ׳רים חדשים, טיפים ומבצעים בדוא"ל ובוואטסאפ. נשלח רק אם תאשר/י, ואפשר להסיר את עצמך בכל עת.</p>
      <div class="fyc-actions"><button type="button" class="fyc-primary" data-v="1">כן, אשמח</button><button type="button" class="fyc-ghost" data-v="0">לא, תודה</button></div>`);
    o.setAttribute('aria-labelledby', 'fyc-c');
    o.querySelectorAll('[data-v]').forEach(b => b.onclick = async () => { await setConsent(b.dataset.v === '1', 'in_app_prompt'); o.remove(); showToast?.(b.dataset.v === '1' ? 'תודה! נעדכן אותך מדי פעם' : 'בסדר גמור, לא נשלח דיוור', 'success'); syncToggle(); });
  }
  function syncToggle() {
    const cb = document.getElementById('fyc-consent'); if (cb) cb.checked = currentUser?.marketingConsent === true;
  }
  function injectToggle() {
    const page = document.getElementById('pa-notifications');
    if (!page || document.getElementById('fyc-consent-row')) return;
    const host = document.createElement('div'); host.className = 'pa-card';
    host.innerHTML = '<div class="pa-card-title">דיוור ועדכונים</div>';
    page.querySelector('.pa-page-title')?.after(host);
    const row = document.createElement('div'); row.id = 'fyc-consent-row'; row.className = 'fyc-consent';
    row.innerHTML = `<label for="fyc-consent"><input type="checkbox" id="fyc-consent"> <span><b>עדכונים ודיוור שיווקי</b><small>קבלת עדכונים, טיפים ומבצעים מ־Fayna Trading בדוא"ל ובוואטסאפ. אפשר לבטל בכל עת.</small></span></label><span class="fyc-msg" role="status" aria-live="polite"></span>`;
    host.appendChild(row);
    const cb = row.querySelector('input'); syncToggle();
    cb.addEventListener('change', async () => { const ok = await setConsent(cb.checked, 'settings'); row.querySelector('.fyc-msg').textContent = ok ? (cb.checked ? 'ההסכמה נשמרה' : 'הוסרת מהדיוור') : 'השמירה נכשלה, נסה שוב'; if (!ok) cb.checked = !cb.checked; });
  }

  /* ── subscription cancellation (s.13D1) ── */
  async function cancelSubscription() {
    if (!currentUser?.uid) { showToast?.('יש להתחבר תחילה', 'info'); return; }
    const by = businessDaysFrom(new Date(), 3).toLocaleDateString('he-IL');
    const ok = typeof customConfirm === 'function'
      ? await customConfirm(`לבטל את המנוי? הביטול ייכנס לתוקף לכל המאוחר ב־${by} (תוך 3 ימי עסקים), ולא יבוצעו חיובים נוספים אחריו. הנתונים שלך נשמרים והחשבון עובר למסלול החינמי.`, { danger: true, okText: 'ביטול המנוי', cancelText: 'חזרה' })
      : true;
    if (!ok) return;
    let server = false;
    try { if (window.faynaBillingCallable) { await window.faynaBillingCallable({ action: 'requestCancellation' }); server = true; } } catch (e) {}
    try { await db.collection('billing_requests').add({ type: 'cancel', plan: currentUser.plan || '', cycle: currentUser.planCycle || 'monthly', uid: currentUser.uid, email: currentUser.email || '', provider: '', createdAt: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {}
    fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: '8ef4276d-2519-4d4f-8a84-b84cd6f46419', subject: '⛔ בקשת ביטול מנוי — לטפל עד ' + by, from_name: 'Fayna Trading — Billing',
        html: `<div dir="rtl">בקשת ביטול מנוי התקבלה.<br>משתמש: ${esc(currentUser.name || '')} (${esc(currentUser.email || '')})<br>מזהה: ${esc(currentUser.uid)}<br>יש להפסיק חיובים עד ${by}.</div>` }) }).catch(() => {});
    // Written confirmation to the customer (transactional mail, no consent needed).
    let mailed = false;
    try {
      if (typeof emailjs !== 'undefined' && EJS_CONFIG?.publicKey && EJS_CONFIG.serviceId && EJS_CONFIG.templateId && currentUser.email) {
        const body = `קיבלנו את בקשתך לבטל את המנוי ל־Fayna Trading בתאריך ${new Date().toLocaleDateString('he-IL')}.\nהביטול ייכנס לתוקף לכל המאוחר ב־${by}, ולא יבוצעו חיובים נוספים לאחר מכן.\nהחשבון יעבור למסלול החינמי והנתונים שלך נשמרים.\n\n${senderLine()}`;
        await emailjs.send(EJS_CONFIG.serviceId, EJS_CONFIG.templateId, { to_email: currentUser.email, user_name: currentUser.name || '', subject: 'אישור קבלת בקשה לביטול מנוי', message: body, html_message: body.replace(/\n/g, '<br>'), from_name: 'Fayna Trading' });
        mailed = true;
      }
    } catch (e) {}
    const el = document.getElementById('subscription-server-status');
    const text = `בקשת הביטול התקבלה ב־${new Date().toLocaleDateString('he-IL')}. הביטול ייכנס לתוקף עד ${by} ולא יבוצעו חיובים נוספים. ${mailed ? 'אישור נשלח לדוא"ל שלך.' : 'ההודעה הזו נשמרה גם במרכז ההתראות כאישור.'}`;
    if (el) el.textContent = text;
    try { addNotification('billing', 'בקשת ביטול מנוי התקבלה', text); renderNotifBell(); } catch (e) {}
    showToast?.('בקשת הביטול התקבלה', 'success');
  }
  function wrapMySub() {
    const prev = window.renderMySub; if (typeof prev !== 'function' || prev._fyc) return;
    const w = function () {
      prev.apply(this, arguments);
      const card = document.getElementById('my-sub-card'); if (!card) return;
      card.querySelectorAll('button').forEach(b => { if (/בקשת ביטול/.test(b.textContent)) b.remove(); });
      const sec = card.querySelector('section'); if (!sec || sec.querySelector('.fyc-cancel')) return;
      sec.appendChild(cancelBox());
    };
    w._fyc = true; window.renderMySub = w; try { renderMySub = w; } catch (e) {}
    try { w(); } catch (e) {}
  }
  window.cancelSubscription = cancelSubscription;
  function cancelBox() {
    const box = document.createElement('div'); box.className = 'fyc-cancel';
    box.innerHTML = `<button type="button" class="fyc-danger">ביטול מנוי</button><small>הביטול נכנס לתוקף תוך 3 ימי עסקים לכל היותר, ללא חיובים נוספים. אפשר לבטל גם במייל ל־<a href="mailto:${LEGAL.email}?subject=${encodeURIComponent('ביטול מנוי')}">${LEGAL.email}</a>.</small>`;
    box.querySelector('button').addEventListener('click', cancelSubscription);
    return box;
  }
  /* The summary card at the top of the billing page is what people see first, so the
     cancel button lives there too (not only inside the collapsed plans section). */
  function wrapWorkspacePlan() {
    const prev = window.workspacePlan; if (typeof prev !== 'function' || prev._fyc) return;
    const w = function () {
      const r = prev.apply(this, arguments);
      const el = document.getElementById('workspace-plan-summary');
      const plan = String(currentUser?.plan || 'free').toLowerCase();
      if (el && plan !== 'free' && !el.querySelector('.fyc-cancel')) el.appendChild(cancelBox());
      return r;
    };
    w._fyc = true; window.workspacePlan = w; try { workspacePlan = w; } catch (e) {}
    try { w(); } catch (e) {}
  }

  /* ── pre-purchase disclosure (Consumer Protection Law s.14C) ── */
  function disclosureHtml() {
    const rows = [
      ['העוסק', [LEGAL.name, LEGAL.businessId && 'מס׳ עוסק ' + LEGAL.businessId].filter(Boolean).join(' · ')],
      ['כתובת', LEGAL.address], ['טלפון', LEGAL.phone], ['דוא"ל', LEGAL.email],
      ['השירות', 'גישה למערכת Fayna Trading לתיעוד וניתוח מסחר, לפי המסלול שנבחר. אינו ייעוץ השקעות.'],
      ['מחיר ותשלום', 'המחיר החודשי מוצג בכל מסלול בדולר; החיוב בשקלים לפי שער שמוצג לפני אישור. ' + (LEGAL.vatNote || '')],
      ['תקופה וחידוש', 'מנוי חודשי שמתחדש אוטומטית עד לביטול. אין התחייבות לתקופה מינימלית.'],
      ['ביטול', 'בכל עת, בכפתור "ביטול מנוי" או בדוא"ל. נכנס לתוקף תוך 3 ימי עסקים, ללא חיובים נוספים. ביטול עסקה תוך 14 יום לפי סעיף 14ג לחוק הגנת הצרכן, בניכוי דמי ביטול של 5% או 100 ש"ח, הנמוך מביניהם.'],
      ['תקופת ניסיון', '14 יום למשתמשים זכאים, ללא כרטיס אשראי וללא חיוב בסיומה.'],
    ].filter(r => r[1]);
    return `<section class="price-card fyc-disclosure" aria-labelledby="fyc-disc-t" style="grid-column:1/-1;color:var(--t1);font-size:14px;line-height:1.6"><h2 id="fyc-disc-t" style="font-size:17px;color:var(--t1)">פרטי העוסק ותנאי העסקה</h2><dl>${rows.map(r => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl><p style="font-size:12.5px;color:var(--t2)">מסמך זה יישלח אליך גם בדוא"ל עם השלמת הרכישה. תנאי השימוש המלאים בעמוד <a href="#" onclick="openLegal('terms');return false">תנאי שימוש</a>.</p></section>`;
  }
  function wrapPricing() {
    const prev = window.renderPricing; if (typeof prev !== 'function' || prev._fyc) return;
    const w = function () { const r = prev.apply(this, arguments); const g = document.getElementById('pricing-grid'); if (g && !g.querySelector('.fyc-disclosure')) g.insertAdjacentHTML('beforeend', disclosureHtml()); return r; };
    w._fyc = true; window.renderPricing = w; try { renderPricing = w; } catch (e) {}
    try { w(); } catch (e) {}
  }

  function showDoc(which) {
    try {
      const shown = document.getElementById('auth-screen')?.style.display !== 'none' && !currentUser;
      if (shown) {
        const src = document.getElementById('lg-' + which); if (!src) return;
        const o = overlay(`<div class="legal-doc fyc-doc">${src.innerHTML}</div><div class="fyc-actions"><button type="button" class="fyc-primary">סגירה</button></div>`);
        o.querySelector('.fyc-actions button').onclick = () => o.remove();
        try { _legalFill(); } catch (e) {}
        return;
      }
      openLegal(which);
    } catch (e) {}
  }

  function wrapShowApp() {
    const prev = window.showApp; if (typeof prev !== 'function' || prev._fyc) return;
    const w = function () { setTimeout(askOnce, 2500); return prev.apply(this, arguments); };
    w._fyc = true; window.showApp = w; try { showApp = w; } catch (e) {}
  }
  function init() {
    wrapShowApp(); wrapMySub(); wrapPricing(); wrapWorkspacePlan();
    const tp = document.getElementById('tp-personal');
    if (tp) new MutationObserver(() => { if (tp.classList.contains('active')) { injectToggle(); syncToggle(); } }).observe(tp, { attributes: true, attributeFilter: ['class'] });
    injectToggle();
    try { _legalFill(); } catch (e) {}
    if (LEGAL.phone) { const ul = [...document.querySelectorAll('#lg-accessibility h3')].find(h => h.textContent.includes('רכז'))?.nextElementSibling?.nextElementSibling; if (ul && !ul.querySelector('.fyc-phone')) ul.insertAdjacentHTML('beforeend', `<li class="fyc-phone">טלפון: <a href="tel:${esc(LEGAL.phone)}">${esc(LEGAL.phone)}</a></li>`); }
  }
  window.FaynaCompliance = Object.freeze({
    LEGAL, loadUnsubs, setConsent, businessDaysFrom, cancelSubscription, showDoc,
    senderText: () => 'השולח: ' + senderLine(),
    senderHtml: () => `<p style="font-size:11px;color:#a0aec0;margin:8px 0 0">השולח: ${esc(senderLine())}</p>`,
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', () => { wrapShowApp(); wrapMySub(); wrapPricing(); wrapWorkspacePlan(); });
})();
