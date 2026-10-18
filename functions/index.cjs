'use strict';
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const model = require('./plan-model.js');
const accountPolicy=require('./account-policy.js');
const {workspacePayload}=require('./workspace.cjs');
const {fetchUsdRate,makeQuote}=require('./fx.cjs');
const {randomUUID}=require('node:crypto');
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
  const now=Date.now();
  if (action === 'startTrial') {
    const cutoff=Date.parse(process.env.FAYNA_TRIAL_COHORT_START || '');
    if (process.env.FAYNA_TRIALS_ENABLED !== 'true' || !Number.isFinite(cutoff) || cutoff > now) {
      throw new HttpsError('failed-precondition','תקופת הניסיון טרם נפתחה');
    }
    if (request.auth.token?.fayna_trial_eligible !== true) throw new HttpsError('permission-denied','הניסיון זמין רק לזכאים שאושרו בשרת');
    if (request.auth.token?.email_verified !== true) throw new HttpsError('permission-denied','יש לאמת את כתובת האימייל');
    // Firebase Auth metadata is server-owned; users/{uid}.registeredAt is client-writable.
    const record=await getAuth().getUser(uid);
    const created=Date.parse(record.metadata.creationTime);
    if (!Number.isFinite(created) || created < cutoff) throw new HttpsError('failed-precondition','הזכאות הקיימת נשמרת; מדיניות מעבר תוגדר בנפרד');
  }
  let quote=null,quoteId=null;
  if(action==='getQuote') {
    if(request.data?.cycle!=='monthly' || !model.publicPlanIds.includes(request.data?.plan))throw new HttpsError('invalid-argument','חבילה או תקופה לא תקינות');
    try {
      const rate=await fetchUsdRate();
      quote={...makeQuote(request.data.plan,model.price(request.data.plan,'monthly'),rate,Date.now()),merchantDisplayName:model.merchantDisplayName};
      quoteId=randomUUID();
    }catch(e){throw new HttpsError('unavailable','לא ניתן לקבל שער המרה מאומת כרגע. לא בוצע חיוב');}
  }
  const userRef = db.doc(`users/${uid}`);
  const subRef = db.doc(`subscriptions/${uid}`);
  const grantRef = db.doc(`trialGrants/${uid}`);
  return db.runTransaction(async tx => {
    const [user, sub, grant] = await Promise.all([tx.get(userRef), tx.get(subRef),tx.get(grantRef)]);
    const managed=sub.exists?sub.data():grant.exists?{plan:'free',status:'free'}:undefined;
    if (!user.exists) throw new HttpsError('failed-precondition', 'פרופיל המשתמש חסר');
    if(action==='getQuote') {
      if(user.data().status==='blocked')throw new HttpsError('permission-denied','החשבון חסום');
      tx.create(db.doc(`billingQuotes/${quoteId}`),{...quote,uid,policyVersion:model.version,status:'quoted'});
      return {...quote,quoteId};
    }
    if (action === 'saveWorkspace') {
      if (!managed || user.data().status==='blocked') throw new HttpsError('permission-denied','אין הרשאת שמירה');
      const access=snapshot(user.data(),managed,now);
      if(!Number.isSafeInteger(request.data.expectedRevision)||request.data.expectedRevision!==access.workspaceRevision)throw new HttpsError('aborted','הנתונים השתנו במכשיר אחר. יש לרענן לפני שמירה');
      try {
        const payload=workspacePayload(request.data.workspace);
        accountPolicy.validateWorkspace(user.data(),payload,model.plans[model.normalize(access.plan)].accounts);
        tx.set(userRef,{...payload,td_updatedAt:FieldValue.serverTimestamp(),td_workspaceRevision:access.workspaceRevision+1},{merge:true});
      } catch (e) { throw new HttpsError('failed-precondition','יש לשייך כל עסקה חדשה לחשבון פעיל בחבילה שלך',{reason:e.code||e.message}); }
      return {...access,workspaceRevision:access.workspaceRevision+1,saved:true};
    }
    if (action === 'startTrial') {
      if (user.data().isAdmin || ['premium','lifetime'].includes(user.data().plan) || user.data().planExpiresAt) throw new HttpsError('failed-precondition','הזכאות הקיימת נשמרת');
      // One grant per UID. Repeat clicks return the existing state without resetting dates.
      if (grant.exists || sub.exists) return snapshot(user.data(),managed,now);
      const trial=model.trialRecord(now);
      tx.create(grantRef,{uid,policyVersion:model.version,startedAt:now});
      tx.create(subRef,trial);
      return snapshot(user.data(),trial,now);
    }
    if (action === 'requestCancellation') {
      // Deterministic key: repeat requests do not create duplicate jobs.
      // This is a request, never a claim that a provider subscription was cancelled.
      const ref = db.doc(`subscriptionCancellationRequests/${uid}`);
      const previous = await tx.get(ref);
      if (!previous.exists) tx.create(ref, { uid, status: 'pending_review', createdAt: FieldValue.serverTimestamp() });
      return { ...snapshot(user.data(), managed,now), cancellationRequest: 'pending_review' };
    }
    const cancellation = await tx.get(db.doc(`subscriptionCancellationRequests/${uid}`));
    return { ...snapshot(user.data(), managed,now), cancellationRequest: cancellation.exists ? cancellation.data().status : null };
  });
});
// No provider selected: reject all webhook deliveries and never mutate entitlements.
exports.billingWebhook = onRequest({ maxInstances: 2 }, (_req, res) => {
  res.status(503).json({ error: 'billing_not_configured' });
});
