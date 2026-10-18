/* Existing Firebase Auth remains the sole identity source. No client billing writes. */
window.FaynaSubscriptions = (() => {
  let pending = false, cached = null;
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
        : result.data.status==='trialing' ? 'תקופת הניסיון פעילה. לא נדרש כרטיס ולא יבוצע חיוב בסיומה.'
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
    refresh: () => call('status'),
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
