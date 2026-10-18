'use strict';
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { snapshot, validateAction } = require('./billing.cjs');
initializeApp();
const db = getFirestore();
exports.billing = onCall({ enforceAppCheck: true, maxInstances: 5 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'יש להתחבר תחילה');
  const action = request.data?.action;
  try { validateAction(action); } catch { throw new HttpsError('invalid-argument', 'פעולה לא תקינה'); }
  // Fail closed even if someone adds configuration or changes browser storage.
  if (action === 'checkout') throw new HttpsError('failed-precondition', 'הסליקה טרם אושרה');
  const uid = request.auth.uid; // Never accept uid, price, plan, or email from the client.
  const userRef = db.doc(`users/${uid}`);
  const subRef = db.doc(`subscriptions/${uid}`);
  return db.runTransaction(async tx => {
    const [user, sub] = await Promise.all([tx.get(userRef), tx.get(subRef)]);
    if (!user.exists) throw new HttpsError('failed-precondition', 'פרופיל המשתמש חסר');
    if (action === 'requestCancellation') {
      // Deterministic key: repeat requests do not create duplicate jobs.
      // This is a request, never a claim that a provider subscription was cancelled.
      const ref = db.doc(`subscriptionCancellationRequests/${uid}`);
      const previous = await tx.get(ref);
      if (!previous.exists) tx.create(ref, { uid, status: 'pending_review', createdAt: FieldValue.serverTimestamp() });
      return { ...snapshot(user.data(), sub.data()), cancellationRequest: 'pending_review' };
    }
    const cancellation = await tx.get(db.doc(`subscriptionCancellationRequests/${uid}`));
    return { ...snapshot(user.data(), sub.data()), cancellationRequest: cancellation.exists ? cancellation.data().status : null };
  });
});
// No provider selected: reject all webhook deliveries and never mutate entitlements.
exports.billingWebhook = onRequest({ maxInstances: 2 }, (_req, res) => {
  res.status(503).json({ error: 'billing_not_configured' });
});
