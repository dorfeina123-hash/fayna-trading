/* Existing Firebase Auth remains the sole identity source. No client billing writes. */
/* Card billing switch. Turning billing on = set this to true AND set FAYNA_BILLING_LIVE=true on the
   server (with the Grow secrets). Until both are on, no billing button appears and nothing can charge. */
window.FAYNA_BILLING_LIVE = false;
if (window.FAYNA_BILLING_LIVE) {
  const BILLING_URL = 'https://us-central1-fayna-trading.cloudfunctions.net/billingApi';
  /* same contract as a Firebase callable: resolves { data }, rejects with { code, message } */
  window.faynaBillingCallable = async payload => {
    const u = window.firebase?.auth?.().currentUser; if (!u) throw Object.assign(new Error('יש להתחבר תחילה'), { code: 'unauthenticated' });
    const r = await fetch(BILLING_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await u.getIdToken() }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.message || 'שרת המנויים לא זמין כרגע. לא בוצע חיוב.'), { code: j.error || 'unavailable' });
    return j;
  };
}
window.FaynaSubscriptions = (() => {
  let pending = false, cached = null, quotePending=false, workspaceVersion=null;
  function message(text) {
    const el = document.getElementById('subscription-server-status');
    if (el) el.textContent = text;
  }
  async function call(action) {
    if (pending) return;
    if (!auth.currentUser) { message('יש להתחבר תחילה.'); return; }
    if (!window.faynaBillingCallable) {
      message('שרת המנויים טרם חובר. לא בוצע שינוי במנוי או חיוב.'); return;
    }
    pending = true;
    const uid = auth.currentUser.uid;
    message('בודק את מצב המנוי…');
    try {
      const result = await window.faynaBillingCallable({ action });
      if (auth.currentUser?.uid !== uid) return;
      cached = {uid,data:result.data,receivedAt:performance.now()};
      renderMySub();
      message(result.data.cancellationRequest === 'pending_review'
        ? 'בקשת הביטול התקבלה לבדיקה. הביטול אצל ספק הסליקה טרם בוצע; הזכאות נשמרת.'
        : result.data.status==='trialing' && result.data.autoRenew ? 'תקופת הניסיון פעילה. החיוב הראשון ב־'+new Date(result.data.nextChargeAt).toLocaleDateString('he-IL')+', אלא אם תבטל לפני כן.'
        : result.data.status==='trialing' ? 'תקופת הניסיון פעילה. לא יבוצע חיוב בסיומה.'
        : result.data.pastDue ? 'החיוב האחרון נכשל. ננסה שוב מחר; כדאי לבדוק את הכרטיס.'
        : result.data.status==='cancel_at_period_end' ? 'המנוי בוטל. הגישה נשמרת עד סוף התקופה ששולמה, ולא יהיו חיובים נוספים.'
        : result.data.status==='trial_expired' ? 'הניסיון הסתיים והחשבון עבר לחינם. הנתונים נשמרו.'
        : 'הזכאות הקיימת נשמרת. הסליקה עדיין אינה פעילה.');
    } catch (_) {
      if (auth.currentUser?.uid === uid) message('לא ניתן להשלים את הבקשה. לא התקבל אישור לשינוי במנוי.');
    } finally { pending = false; }
  }
  return {
    statusFor: uid => {
      if (cached?.uid !== uid || auth.currentUser?.uid !== uid) return null;
      const data=cached.data;
      const now=data.serverNow+Math.max(0,performance.now()-cached.receivedAt);
      const end=data.status==='trialing'?data.trialEndsAt:data.currentPeriodEnd;
      if (data.source==='managed' && end && now>=end) return {...data,plan:'free',status:data.status==='trialing'?'trial_expired':'free',trialDaysRemaining:0};
      return data;
    },
    showQuote: async plan => {
      if(quotePending || !FaynaPlanModel.publicPlanIds.includes(plan))return;
      const el=document.getElementById('billing-quote-'+plan);if(!el)return;
      const uid=auth.currentUser?.uid;
      if(!uid || !window.faynaBillingCallable){el.textContent='חיבור הסליקה בהכנה. הסכום בשקלים יוצג לפני אישור תשלום.';return;}
      quotePending=true;el.textContent='בודק שער המרה וסכום בשקלים…';
      try {
        const response=await window.faynaBillingCallable({action:'getQuote',plan,cycle:'monthly'});
        if(auth.currentUser?.uid!==uid)return;
        const q=response.data;
        if(q.plan!==plan||q.displayCurrency!=='USD'||q.settlementCurrency!=='ILS'||q.displayMinor!==FaynaPlanModel.price(plan,'monthly')||!Number.isSafeInteger(q.settlementMinor)||q.settlementMinor<=0||!Number.isSafeInteger(q.fxPublishedAt)||!Number.isSafeInteger(q.fxRateMillionths)||q.fxRateMillionths<=0)throw new Error('invalid_quote');
        const amount=new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(q.settlementMinor/100);
        el.textContent=amount+' לחודש · שער דולר '+(q.fxRateMillionths/1000000)+' של בנק ישראל, מתאריך '+new Date(q.fxPublishedAt).toLocaleDateString('he-IL')+'. הצעה ל־10 דקות; לא בוצע חיוב.';
      } catch(e){if(auth.currentUser?.uid===uid)el.textContent='לא ניתן לאמת כרגע את הסכום בשקלים. לא בוצע חיוב.';}
      finally{quotePending=false;}
    },
    loadedWorkspace: (uid,revision) => { workspaceVersion={uid,revision:Number.isSafeInteger(revision)?revision:0}; },
    saveWorkspace: async workspace => {
      const uid=auth.currentUser?.uid;
      if(!uid || !window.faynaBillingCallable)throw new Error('שרת שמירת החשבונות אינו מחובר');
      if(workspaceVersion?.uid!==uid)throw new Error('יש לטעון את נתוני החשבון לפני שמירה');
      const result=await window.faynaBillingCallable({action:'saveWorkspace',workspace,expectedRevision:workspaceVersion.revision});
      if(auth.currentUser?.uid!==uid || result.data?.saved!==true)throw new Error('לא התקבל אישור שמירה');
      workspaceVersion={uid,revision:result.data.workspaceRevision};
      cached={uid,data:result.data,receivedAt:performance.now()};
      return result.data;
    },
    refresh: () => call('status'),
    /* Grow hosted page: verifies the card and saves a token; the first charge comes when the trial ends */
    checkout: async plan => {
      if (!window.FAYNA_BILLING_LIVE || !window.faynaBillingCallable || !FaynaPlanModel.publicPlanIds.includes(plan)) return;
      if (!auth.currentUser) { showToast('יש להתחבר תחילה', 'error'); return; }
      const p = FaynaPlanModel.plans[plan], usd = (FaynaPlanModel.price(plan, 'monthly') / 100).toFixed(2);
      const first = new Date(Date.now() + 14 * 86400000).toLocaleDateString('he-IL');
      const box = document.createElement('div'); box.className = 'fyc-overlay'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'fbc-h');
      box.innerHTML = `<form class="fbc-card" novalidate><h2 id="fbc-h">${escHtml(p.label)} · 14 ימי ניסיון</h2>
        <p>עכשיו לא מחויב דבר. בתאריך ${first} יחויב הכרטיס ב־${usd}$ לחודש (בשקלים לפי שער בנק ישראל ביום החיוב), וכך מדי חודש עד לביטול. ביטול בכל עת מעמוד המנוי, בלי קנס.</p>
        <label for="fbc-name">שם מלא (פרטי ומשפחה)</label><input id="fbc-name" autocomplete="name" required value="${escHtml(currentUser?.name || '')}">
        <label for="fbc-phone">טלפון נייד</label><input id="fbc-phone" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="050-0000000" required>
        <label class="fbc-terms"><input type="checkbox" id="fbc-ok"> קראתי ואני מסכים ל<a href="#" onclick="event.preventDefault();typeof showTermsModal==='function'&&showTermsModal()">תנאי השימוש והמנוי</a></label>
        <p class="fbc-err" role="alert"></p>
        <div class="fbc-actions"><button type="submit" class="btn-p">המשך לדף התשלום המאובטח</button><button type="button" class="bn" data-x>ביטול</button></div></form>`;
      document.body.appendChild(box);
      const close = () => box.remove(), err = box.querySelector('.fbc-err');
      box.addEventListener('click', e => { if (e.target === box || e.target.closest('[data-x]')) close(); });
      box.querySelector('#fbc-name').focus();
      box.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        if (!box.querySelector('#fbc-ok').checked) { err.textContent = 'יש לאשר את תנאי המנוי'; return; }
        const btn = box.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'פותח דף תשלום…';
        try {
          const r = await window.faynaBillingCallable({ action: 'checkout', plan, acceptedTerms: true, payer: { fullName: box.querySelector('#fbc-name').value, phone: box.querySelector('#fbc-phone').value } });
          if (!/^https:\/\//.test(r.data?.url || '')) throw new Error('לא התקבל דף תשלום');
          location.href = r.data.url;
        } catch (x) { err.textContent = x.message || 'לא ניתן לפתוח את דף התשלום. לא בוצע חיוב.'; btn.disabled = false; btn.textContent = 'המשך לדף התשלום המאובטח'; }
      });
    },
    startTrial: async () => {
      if (await customConfirm('לבדוק זכאות ל־14 ימי ניסיון עם כל היכולות וחשבונות ללא הגבלה? ללא כרטיס וללא חיוב בסיום. בסיום מעבר לחינם תוך שמירת הנתונים. הזכאות הקיימת לא תוחלף בניסיון.')) await call('startTrial');
    },
    requestCancellation: async () => {
      if (await customConfirm('לשלוח בקשת ביטול לבדיקה? פעולה זו אינה מבטלת חיוב אצל ספק סליקה.')) await call('requestCancellation');
    },
  };
})();
// The catalog loads after legacy inline scripts; refresh only the existing billing elements.
if (typeof renderPricing === 'function') renderPricing();

/* back from Grow's page: ?billing=success|cancel */
(function () {
  const m = /[?&]billing=(success|cancel)\b/.exec(location.search); if (!m || !window.FAYNA_BILLING_LIVE) return;
  history.replaceState(null, '', location.pathname + location.hash);
  const say = () => { try { showToast(m[1] === 'success' ? 'הכרטיס נקלט. 14 ימי הניסיון התחילו, ולא בוצע חיוב.' : 'התשלום בוטל. לא בוצע חיוב.', m[1] === 'success' ? 'success' : 'info', 6000); } catch (e) {} };
  const wait = setInterval(() => { if (typeof currentUser !== 'undefined' && currentUser?.uid) { clearInterval(wait); say(); setTimeout(() => FaynaSubscriptions.refresh(), 2500); } }, 500);
  setTimeout(() => clearInterval(wait), 30000);
})();
