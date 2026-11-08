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

/* Sunday–Thursday are business days in Israel. Returns epoch ms of the n-th business day after `from`. */
function israeliBusinessDaysFrom(from, n) {
  const d = new Date(from); let left = n;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 5 && w !== 6) left--; }
  return d.getTime();
}
exports._israeliBusinessDaysFrom = israeliBusinessDaysFrom;
initializeApp();
const db = getFirestore();
const grow = require('./grow.cjs');
const { seal: sealBox, open: openBox } = require('./gmail.cjs');
exports.billing = onCall({ enforceAppCheck: true, maxInstances: 5 }, request => billingAction(request.auth, request.data));
/* Shared by the callable above and the plain HTTPS endpoint the web app uses (billingApi). */
async function billingAction(authInfo, data) {
  const request = { auth: authInfo, data: data || {} };
  if (!request.auth) throw new HttpsError('unauthenticated', 'יש להתחבר תחילה');
  const action = request.data?.action;
  try { validateAction(action); } catch { throw new HttpsError('invalid-argument', 'פעולה לא תקינה'); }
  const growCfg = grow.config(process.env);
  // Fail closed unless billing was switched on and every Grow secret is present.
  if (action === 'checkout') {
    if (!grow.ready(growCfg)) throw new HttpsError('failed-precondition', 'הסליקה טרם אושרה');
    return startCheckout(request.auth, request.data, growCfg);
  }
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
      // Consumer Protection Law s.13D1: cancellation takes effect within 3 business days.
      // With live card billing the renewal stops right away; access runs to the end of the paid period.
      if (sub.exists && sub.data().provider === 'grow') {
        const next = grow.cancel(sub.data(), now);
        tx.set(subRef, next);
        if (!previous.exists) tx.create(ref, { uid, status: 'cancelled', createdAt: FieldValue.serverTimestamp(), effectiveAt: now });
        return { ...snapshot(user.data(), next, now), billingEnabled: growCfg.live, cancellationRequest: 'cancelled' };
      }
      if (!previous.exists) tx.create(ref, { uid, status: 'pending_review', createdAt: FieldValue.serverTimestamp(), effectiveBy: israeliBusinessDaysFrom(now, 3) });
      return { ...snapshot(user.data(), managed,now), cancellationRequest: 'pending_review' };
    }
    const cancellation = await tx.get(db.doc(`subscriptionCancellationRequests/${uid}`));
    const out = { ...snapshot(user.data(), managed,now), cancellationRequest: cancellation.exists ? cancellation.data().status : null };
    if (growCfg.live) Object.assign(out, { billingEnabled: true, autoRenew: managed?.autoRenew === true, billingPlan: managed?.billingPlan || null, nextChargeAt: managed?.autoRenew ? managed?.nextChargeAt || null : null, pastDue: managed?.pastDue === true });
    return out;
  });
}

/* checkout: a hosted Grow page that verifies the card and saves a token; nothing is charged until the trial ends */
async function startCheckout(authInfo, data, cfg) {
  const uid = authInfo.uid, plan = data?.plan;
  if (!model.publicPlanIds.includes(plan)) throw new HttpsError('invalid-argument', 'חבילה לא תקינה');
  if (data?.acceptedTerms !== true) throw new HttpsError('failed-precondition', 'יש לאשר את תנאי המנוי');
  let who; try { who = grow.payer({ ...data?.payer, email: authInfo.token?.email || data?.payer?.email }); }
  catch (e) { throw new HttpsError('invalid-argument', e.message); }
  const [user, sub] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`subscriptions/${uid}`).get()]);
  if (!user.exists || user.data().status === 'blocked') throw new HttpsError('permission-denied', 'החשבון אינו זמין');
  const s = sub.exists ? sub.data() : null;
  if (s?.provider === 'grow' && s.autoRenew && ['trialing', 'active'].includes(s.status)) throw new HttpsError('already-exists', 'כבר קיים מנוי פעיל');
  const checkoutId = randomUUID();
  let res;
  try { res = await grow.call(fetch, cfg, 'createPaymentProcess', grow.checkoutFields(cfg, { uid, checkoutId, plan, planLabel: model.plans[plan].label, who })); }
  catch (e) { console.error('grow checkout', e.code, e.message); throw new HttpsError('unavailable', 'לא ניתן לפתוח את דף התשלום כרגע. לא בוצע חיוב'); }
  if (!/^https:\/\//.test(res.url || '')) throw new HttpsError('unavailable', 'לא התקבל דף תשלום');
  await db.doc(`billingCheckouts/${checkoutId}`).create({
    uid, plan, status: 'pending', processId: String(res.processId || ''), processToken: String(res.processToken || ''),
    who: sealBox(JSON.stringify(who), cfg.tokenKey), createdAt: Date.now(), policyVersion: model.version, termsAcceptedAt: Date.now(),
  });
  return { url: res.url, checkoutId };
}
// No provider selected: reject all webhook deliveries and never mutate entitlements.
exports.billingWebhook = onRequest({ maxInstances: 2 }, (_req, res) => {
  res.status(503).json({ error: 'billing_not_configured' });
});

/* Live trade sync: executions posted by the ATAS / Quantower add-ons (see sync.cjs). */
const sync = require('./sync.cjs');
exports.syncIngest = onRequest({ maxInstances: 3, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  try {
    const out = await sync.handleIngest({ method: req.method, headers: req.headers, body: req.body }, sync.firestoreStore(db, FieldValue));
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('syncIngest', e);
    res.status(500).json({ error: 'server' });
  }
});

/* Gmail expenses: stores a read-only Gmail permission so receipts re-sync on every login (see gmail.cjs). */
const { defineSecret } = require('firebase-functions/params');
const gmail = require('./gmail.cjs');
const GMAIL_CLIENT_ID = defineSecret('GMAIL_CLIENT_ID');
const GMAIL_CLIENT_SECRET = defineSecret('GMAIL_CLIENT_SECRET');
const GMAIL_TOKEN_KEY = defineSecret('GMAIL_TOKEN_KEY');
const GMAIL_ORIGINS = new Set(['https://dorfeina123-hash.github.io', 'http://localhost:8765']);
exports.gmailAuth = onRequest({ maxInstances: 5, timeoutSeconds: 20, memory: '256MiB', secrets: [GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_TOKEN_KEY] }, async (req, res) => {
  const origin = req.get('origin') || '';
  if (GMAIL_ORIGINS.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Max-Age', '3600'); res.status(204).send(''); return; }
  try {
    const out = await gmail.handleGmail({ method: req.method, headers: req.headers, body: req.body }, {
      verifyIdToken: t => getAuth().verifyIdToken(t),
      store: gmail.firestoreTokenStore(db),
      fetch: globalThis.fetch,
      cfg: { clientId: GMAIL_CLIENT_ID.value(), clientSecret: GMAIL_CLIENT_SECRET.value(), tokenKey: GMAIL_TOKEN_KEY.value() },
      now: Date.now(),
    });
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('gmailAuth', e);
    res.status(500).json({ error: 'server' });
  }
});

/* Interactive Brokers read-only sync through the Flex Web Service (see ibkr.cjs). */
const ibkr = require('./ibkr.cjs');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const SYNC_TOKEN_KEY = defineSecret('SYNC_TOKEN_KEY');
const ibkrDeps = () => ({
  verifyIdToken: t => getAuth().verifyIdToken(t),
  store: ibkr.firestoreLinkStore(db),
  fillStore: sync.firestoreStore(db, FieldValue),
  fetch: globalThis.fetch,
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  cfg: { tokenKey: SYNC_TOKEN_KEY.value() },
  now: Date.now(),
});
exports.ibkrSync = onRequest({ maxInstances: 5, timeoutSeconds: 90, memory: '256MiB', secrets: [SYNC_TOKEN_KEY] }, async (req, res) => {
  const origin = req.get('origin') || '';
  if (GMAIL_ORIGINS.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Max-Age', '3600'); res.status(204).send(''); return; }
  try {
    const out = await ibkr.handleIbkr({ method: req.method, headers: req.headers, body: req.body }, ibkrDeps());
    res.status(out.status).json(out.body);
  } catch (e) { console.error('ibkrSync', e); res.status(500).json({ error: 'server' }); }
});
/* every hour: pull new executions for every connected IBKR user, even when nobody is logged in */
exports.ibkrSyncScheduled = onSchedule({ schedule: 'every 60 minutes', timeoutSeconds: 540, memory: '256MiB', secrets: [SYNC_TOKEN_KEY] }, async () => {
  const deps = ibkrDeps(); const links = await deps.store.all();
  for (const l of links) {
    if (l.lastSync && deps.now - l.lastSync < 45 * 60e3) continue;
    try { await ibkr.syncUser(l.uid, l, deps, Date.now()); }
    catch (e) { await deps.store.update(l.uid, { lastError: e.code || e.message, lastErrorAt: Date.now() }); console.warn('ibkr scheduled', l.uid, e.code || e.message); }
  }
});

/* ── Card billing through Grow (see grow.cjs). All three endpoints stay inert until
      FAYNA_BILLING_LIVE=true and the Grow secrets are set. ── */
const GROW_USER_ID = defineSecret('GROW_USER_ID');
const GROW_PAGE_CODE = defineSecret('GROW_PAGE_CODE');
const GROW_NOTIFY_KEY = defineSecret('GROW_NOTIFY_KEY');
const BILLING_TOKEN_KEY = defineSecret('BILLING_TOKEN_KEY');
const BILLING_SECRETS = [GROW_USER_ID, GROW_PAGE_CODE, GROW_NOTIFY_KEY, BILLING_TOKEN_KEY];
const HTTP_ERR = { unauthenticated: 401, 'permission-denied': 403, 'invalid-argument': 400, 'failed-precondition': 412, 'already-exists': 409, aborted: 409, unavailable: 503 };

/* The web app calls this with its Firebase ID token (same pattern as ibkrSync); it answers { data }. */
exports.billingApi = onRequest({ maxInstances: 5, timeoutSeconds: 30, memory: '256MiB', secrets: BILLING_SECRETS }, async (req, res) => {
  const origin = req.get('origin') || '';
  if (GMAIL_ORIGINS.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Max-Age', '3600'); res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  const m = /^Bearer\s+(.+)$/.exec(req.get('authorization') || '');
  let decoded = null;
  try { if (m) decoded = await getAuth().verifyIdToken(m[1]); } catch (e) { decoded = null; }
  try {
    const data = await billingAction(decoded ? { uid: decoded.uid, token: decoded } : null, req.body || {});
    res.status(200).json({ data });
  } catch (e) {
    if (e instanceof HttpsError) { res.status(HTTP_ERR[e.code] || 400).json({ error: e.code, message: e.message }); return; }
    console.error('billingApi', e); res.status(500).json({ error: 'server', message: 'שגיאת שרת. לא בוצע חיוב' });
  }
});

/* Grow server-to-server callback after the hosted page. Its body is only a hint: the process is
   re-read from Grow and must match our checkout record before anything changes. */
exports.growNotify = onRequest({ maxInstances: 3, timeoutSeconds: 60, memory: '256MiB', secrets: BILLING_SECRETS }, async (req, res) => {
  const cfg = grow.config(process.env);
  if (!grow.ready(cfg) || req.method !== 'POST' || req.query.k !== cfg.notifyKey) { res.status(404).send(''); return; }
  const hint = grow.parseNotify(req.body);
  try {
    if (!/^[\w-]{36}$/.test(hint.checkoutId)) { res.status(200).send('ignored'); return; }
    const coRef = db.doc(`billingCheckouts/${hint.checkoutId}`);
    const co = await coRef.get();
    if (!co.exists || co.data().status !== 'pending' || co.data().uid !== hint.uid) { res.status(200).send('ignored'); return; }
    const info = grow.processFacts(await grow.call(fetch, cfg, 'getPaymentProcessInfo', { pageCode: cfg.pageCode, processId: co.data().processId || hint.processId, processToken: co.data().processToken || hint.processToken }));
    if (info.uid && info.uid !== co.data().uid) throw new Error('process_mismatch');
    if (!grow.TOKEN_OK.has(info.statusCode) || !info.cardToken) { await coRef.update({ status: 'failed', statusCode: info.statusCode, updatedAt: Date.now() }); res.status(200).send('not paid'); return; }
    const uid = co.data().uid, now = Date.now();
    const who = JSON.parse(openBox(co.data().who, cfg.tokenKey));
    await db.doc(`billingTokens/${uid}`).set({ box: sealBox(JSON.stringify({ token: info.cardToken, who }), cfg.tokenKey), cardSuffix: info.cardSuffix, cardBrand: info.cardBrand, savedAt: now });
    const hadTrial = (await db.doc(`trialGrants/${uid}`).get()).exists || (await db.doc(`subscriptions/${uid}`).get()).exists;
    let sub = grow.startTrial(co.data().plan, now, model.version);
    if (hadTrial) sub = { ...sub, status: 'active', plan: co.data().plan, trialStartedAt: null, trialEndsAt: null, currentPeriodEnd: now, nextChargeAt: now, trialSkipped: true };
    await db.runTransaction(async tx => {
      tx.set(db.doc(`subscriptions/${uid}`), sub);
      if (!hadTrial) tx.set(db.doc(`trialGrants/${uid}`), { uid, policyVersion: model.version, startedAt: now, viaCard: true });
      tx.update(coRef, { status: 'completed', transactionId: info.transactionId, completedAt: now });
    });
    if (grow.PAID.has(info.statusCode) && info.transactionId) { try { await grow.call(fetch, cfg, 'approveTransaction', { pageCode: cfg.pageCode, transactionId: info.transactionId }); } catch (e) { console.warn('grow approve', e.code); } }
    if (hadTrial) await chargeOne(uid, cfg, now);
    res.status(200).send('ok');
  } catch (e) { console.error('growNotify', e.code || e.message); res.status(500).send('retry'); }
});

/* one renewal charge; the transaction id makes a repeat of the same period impossible */
async function chargeOne(uid, cfg, now) {
  const subRef = db.doc(`subscriptions/${uid}`);
  const sub = (await subRef.get()).data();
  if (!grow.due(sub, now)) return 'not_due';
  const tok = await db.doc(`billingTokens/${uid}`).get();
  if (!tok.exists) { await subRef.set(grow.afterCharge(sub, now, false)); return 'no_token'; }
  const { token, who } = JSON.parse(openBox(tok.data().box, cfg.tokenKey));
  const plan = sub.billingPlan;
  let ok = false, detail = {};
  try {
    const quote = makeQuote(plan, model.price(plan, 'monthly'), await fetchUsdRate(), now);
    const r = await grow.call(fetch, cfg, 'createTransactionWithToken', grow.chargeFields(cfg, { uid, sub, token, quote, who, planLabel: model.plans[plan].label }));
    ok = true; detail = { transactionId: String(r.transactionId || ''), ils: quote.settlementMinor, usd: quote.displayMinor, fx: quote.fxRateMillionths };
  } catch (e) { detail = { error: e.code || e.message }; }
  const next = grow.afterCharge(sub, now, ok);
  await db.runTransaction(async tx => {
    tx.set(subRef, next);
    tx.create(db.collection(`subscriptions/${uid}/charges`).doc(), { at: now, ok, plan, period: (sub.period || 0) + 1, ...detail });
  });
  return ok ? 'charged' : 'failed';
}

/* hourly: charge trials that ended and periods that renewed */
exports.billingRenewals = onSchedule({ schedule: 'every 60 minutes', timeoutSeconds: 540, memory: '256MiB', secrets: BILLING_SECRETS }, async () => {
  const cfg = grow.config(process.env);
  if (!grow.ready(cfg)) return;
  const now = Date.now();
  /* single-field range query (no composite index needed); the rest is filtered here */
  const due = await db.collection('subscriptions').where('nextChargeAt', '<=', now).limit(500).get();
  for (const d of due.docs) {
    if (!grow.due(d.data(), now)) continue;
    try { console.log('renewal', d.id, await chargeOne(d.id, cfg, now)); }
    catch (e) { console.error('renewal', d.id, e.code || e.message); }
  }
});

/* ── Tradovate read-only sync over OAuth (see tradovate.cjs). Answers { configured:false } until
      the NinjaTrader Ecosystem partner credentials are set as secrets. ── */
const tradovate = require('./tradovate.cjs');
const TRADOVATE_CLIENT_ID = defineSecret('TRADOVATE_CLIENT_ID');
const TRADOVATE_CLIENT_SECRET = defineSecret('TRADOVATE_CLIENT_SECRET');
const tvDeps = () => ({
  cfg: tradovate.config({ ...process.env, TRADOVATE_CLIENT_ID: TRADOVATE_CLIENT_ID.value(), TRADOVATE_CLIENT_SECRET: TRADOVATE_CLIENT_SECRET.value(), SYNC_TOKEN_KEY: SYNC_TOKEN_KEY.value() }),
  verifyIdToken: t => getAuth().verifyIdToken(t),
  store: tradovate.firestoreLinkStore(db),
  fillStore: sync.firestoreStore(db, FieldValue),
  fetch: globalThis.fetch,
  now: Date.now(),
});
exports.tradovateAuth = onRequest({ maxInstances: 5, timeoutSeconds: 90, memory: '256MiB', secrets: [TRADOVATE_CLIENT_ID, TRADOVATE_CLIENT_SECRET, SYNC_TOKEN_KEY] }, async (req, res) => {
  try {
    if (req.method === 'GET') { res.redirect(302, await tradovate.handleCallback(req.query || {}, tvDeps())); return; }
    const origin = req.get('origin') || '';
    if (GMAIL_ORIGINS.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Max-Age', '3600'); res.status(204).send(''); return; }
    const out = await tradovate.handleAction({ method: req.method, headers: req.headers, body: req.body }, tvDeps());
    res.status(out.status).json(out.body);
  } catch (e) { console.error('tradovateAuth', e); res.status(500).json({ error: 'server' }); }
});
/* every 30 minutes: renew tokens (they live ~80 minutes) and pull new fills */
exports.tradovateSyncScheduled = onSchedule({ schedule: 'every 30 minutes', timeoutSeconds: 540, memory: '256MiB', secrets: [TRADOVATE_CLIENT_ID, TRADOVATE_CLIENT_SECRET, SYNC_TOKEN_KEY] }, async () => {
  const deps = tvDeps();
  if (!tradovate.configured(deps.cfg)) return;
  for (const l of await deps.store.all()) {
    if (l.needsReauth) continue;
    try { await tradovate.syncUser(l.uid, l, deps, Date.now()); }
    catch (e) { await deps.store.update(l.uid, { lastError: e.code || e.message, lastErrorAt: Date.now() }); console.warn('tradovate scheduled', l.uid, e.code || e.message); }
  }
});
