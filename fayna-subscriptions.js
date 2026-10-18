/* Existing Firebase Auth remains the sole identity source. No client billing writes. */
window.FaynaSubscriptions = (() => {
  let pending = false;
  function message(text) {
    const el = document.getElementById('subscription-server-status');
    if (el) el.textContent = text;
  }
  async function call(action) {
    if (pending) return;
    if (!auth.currentUser) { message('יש להתחבר תחילה.'); return; }
    // No production endpoint is configured by this development change.
    // Configure the Functions + App Check SDK only after staging validation.
    if (!window.faynaBillingCallable) {
      message('שרת המנויים טרם חובר. לא בוצע שינוי במנוי או חיוב.'); return;
    }
    pending = true;
    const uid = auth.currentUser.uid;
    message('בודק את מצב המנוי…');
    try {
      const result = await window.faynaBillingCallable({ action });
      if (auth.currentUser?.uid !== uid) return;
      message(result.data.cancellationRequest === 'pending_review'
        ? 'בקשת הביטול התקבלה לבדיקה. הביטול אצל ספק הסליקה טרם בוצע; הזכאות נשמרת.'
        : 'הזכאות הקיימת נשמרת. הסליקה עדיין אינה פעילה.');
    } catch (_) {
      if (auth.currentUser?.uid === uid) message('לא ניתן להשלים את הבקשה. לא התקבל אישור לשינוי במנוי.');
    } finally { pending = false; }
  }
  return {
    refresh: () => call('status'),
    requestCancellation: async () => {
      if (await customConfirm('לשלוח בקשת ביטול לבדיקה? פעולה זו אינה מבטלת חיוב אצל ספק סליקה.')) await call('requestCancellation');
    },
  };
})();
