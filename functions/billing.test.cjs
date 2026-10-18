const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { snapshot } = require('./billing.cjs');
function fixture(options={}) {
  const docs = new Map([['users/alice', {plan:'lifetime', td_trades:[{pnl:25}]}], ['users/bob', {plan:'free'}]]);
  const db = {doc: path => ({path}), runTransaction: async fn => fn({
    get: async ref => ({exists:docs.has(ref.path), data:()=>docs.get(ref.path)}),
    set: (ref,value)=>docs.set(ref.path,{...docs.get(ref.path),...value}),
    create: (ref, value) => {assert(!docs.has(ref.path));docs.set(ref.path,value);}
  })};
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  const exports = {};
  vm.runInNewContext(fs.readFileSync(__dirname+'/index.cjs','utf8'), {exports,process:{env:options.env || {}}, require: name => {
    if(name.includes('/https'))return {onCall:(options,fn)=>{assert.equal(options.enforceAppCheck,true);return fn;},onRequest:(_,fn)=>fn,HttpsError};
    if(name.includes('/auth'))return {getAuth:()=>({getUser:async uid=>({metadata:{creationTime:options.createdAt || new Date().toISOString()}})})};
    if(name==='./fx.cjs')return {...require('./fx.cjs'),fetchUsdRate:async()=>({rateMillionths:3089000,publishedAt:Date.now(),source:'Bank of Israel'})};
    if(name.includes('/app'))return {initializeApp(){}};
    if(name.includes('/firestore'))return {getFirestore:()=>db,FieldValue:{serverTimestamp:()=>123}};
    return require(name);
  }});
  return {docs,...exports};
}
test('legacy profile and trading data are preserved',()=>{
 const u={plan:'lifetime',td_trades:[{pnl:50}],planExpiresAt:{toMillis:()=>1}};
 const before=JSON.stringify(u);assert.equal(snapshot(u).plan,'lifetime');assert.equal(snapshot(u).billingEnabled,false);assert.equal(JSON.stringify(u),before);
});
test('unauthenticated, invalid action and checkout fail closed',async()=>{
 const f=fixture();await assert.rejects(f.billing({data:{action:'status'}}),{code:'unauthenticated'});
 await assert.rejects(f.billing({auth:{uid:'alice'},data:{action:'grant'}}),{code:'invalid-argument'});
 await assert.rejects(f.billing({auth:{uid:'alice'},data:{action:'checkout',price:1}}),{code:'failed-precondition'});
 assert.equal(f.docs.size,2);
});
test('server uses token uid and cancellation is idempotent without changing access',async()=>{
 const f=fixture(),before=JSON.stringify(f.docs.get('users/alice'));
 const req={auth:{uid:'alice'},data:{action:'requestCancellation',uid:'bob',plan:'premium'}};
 const first=await f.billing(req);await f.billing(req);
 assert.equal(first.cancellationRequest,'pending_review');assert.equal(f.docs.size,3);
 assert(!f.docs.has('subscriptionCancellationRequests/bob'));
 assert.equal(JSON.stringify(f.docs.get('users/alice')),before);
 const status=await f.billing({auth:{uid:'alice'},data:{action:'status'}});
 assert.equal(status.cancellationRequest,'pending_review');
});
test('unconfigured webhooks reject and write nothing',()=>{
 const f=fixture();let code,body;f.billingWebhook({}, {status(c){code=c;return this;},json(v){body=v;}});
 assert.equal(code,503);assert.equal(body.error,'billing_not_configured');assert.equal(f.docs.size,2);
});
const model = require('./plan-model.js');
test('14 days means exactly 336 hours; expiry resolves to Free without mutation',()=>{
 const start=Date.parse('2026-10-18T10:00:00Z'),trial=model.trialRecord(start),before=JSON.stringify(trial);
 const end=start+14*86400000;assert.equal(trial.trialEndsAt,end);assert.equal(trial.autoRenew,false);
 assert.equal(model.entitlement(trial,'premium',start).plan,'unlimited');
 assert.equal(model.entitlement(trial,'premium',end-1).trialDaysRemaining,1);
 assert.equal(model.entitlement(trial,'premium',end).plan,'free');
 assert.equal(model.entitlement(trial,'premium',end).status,'trial_expired');
 assert.equal(JSON.stringify(trial),before);
 assert.equal(model.entitlement(null,'lifetime',end).plan,'unlimited');
 assert.equal(model.entitlement({...trial,trialEndsAt:end+1},'pro',start).plan,'free');
 assert.equal(model.entitlement(trial,'pro',start-1).plan,'free');
});
test('approved monthly USD prices use integer cents; annual billing unavailable; data export stays free',()=>{
 assert.equal(model.pricesApproved,true);assert.equal(model.autoChargeAfterTrial,false);
 for(const [id,p] of Object.entries(model.plans)) {
  assert(Number.isSafeInteger(model.price(id,'monthly')));if(id==='free')assert.equal(model.price(id,'yearly'),0);else assert.throws(()=>model.price(id,'yearly'),/unavailable/);
  assert(p.features.export_csv);assert(p.features.backup);
 }
 assert.equal(model.currency,'USD');assert.equal(model.price('single','monthly'),1490);assert.equal(model.price('unlimited','monthly'),2490);
 assert.throws(()=>model.price('single','weekly'));
 assert.throws(()=>model.price('__proto__','monthly'));
 assert(Object.isFrozen(model.plans.single.features));
});
test('trial grant requires rollout, verified email, trusted eligibility and new Auth account',async()=>{
 const request={auth:{uid:'bob',token:{email_verified:true,fayna_trial_eligible:true}},data:{action:'startTrial',trialEndsAt:9999999999999}};
 await assert.rejects(fixture().billing(request),{code:'failed-precondition'});
 const env={FAYNA_TRIALS_ENABLED:'true',FAYNA_TRIAL_COHORT_START:'2026-01-01T00:00:00Z'};
 await assert.rejects(fixture({env}).billing({...request,auth:{uid:'bob',token:{email_verified:true}}}),{code:'permission-denied'});
 await assert.rejects(fixture({env}).billing({...request,auth:{uid:'bob',token:{email_verified:false,fayna_trial_eligible:true}}}),{code:'permission-denied'});
 await assert.rejects(fixture({env,createdAt:'2025-12-31T23:59:59Z'}).billing(request),{code:'failed-precondition'});
 const f=fixture({env});const before=JSON.stringify(f.docs.get('users/bob'));
 const result=await f.billing(request),first=JSON.stringify(f.docs.get('subscriptions/bob'));
 assert.equal(result.plan,'unlimited');assert.equal(result.status,'trialing');assert.equal(result.billingEnabled,false);
 await f.billing(request);assert.equal(JSON.stringify(f.docs.get('subscriptions/bob')),first);
 assert.equal(JSON.stringify(f.docs.get('users/bob')),before);assert.equal(f.docs.size,4);
 // Deleting only the managed subscription cannot reset the one-time grant.
 f.docs.delete('subscriptions/bob');f.docs.set('users/bob',{plan:'pro'});const orphan=await f.billing(request);assert.equal(orphan.plan,'free');assert.equal(orphan.source,'managed');assert(!f.docs.has('subscriptions/bob'));
 const orphanStatus=await f.billing({...request,data:{action:'status'}});assert.equal(orphanStatus.plan,'free');
 await assert.rejects(fixture({env}).billing({...request,auth:{...request.auth,uid:'alice'}}),{code:'failed-precondition'});
});

test('two public plans have identical full features and differ only in account capacity',()=>{
 assert.deepEqual([...model.publicPlanIds],['single','unlimited']);
 assert.deepEqual(model.plans.single.features,model.plans.unlimited.features);
 assert(Object.values(model.plans.single.features).every(Boolean));
 assert.equal(model.plans.single.accounts,1);assert.equal(model.plans.unlimited.accounts,null);
 assert.equal(model.plans.single.newTradesPerMonth,null);assert.equal(model.plans.unlimited.newTradesPerMonth,null);
 assert.equal(JSON.parse(JSON.stringify(model.plans.unlimited)).accounts,null);
 assert.equal(model.trialPlan,'unlimited');
});

test('managed workspace saves enforce account capacity and ownership using server plan',async()=>{
 const f=fixture(),now=Date.now();
 f.docs.set('users/bob',{plan:'premium',status:'active',td_accounts:[{id:'a',active:true}],td_tradesList:[]});
 f.docs.set('subscriptions/bob',{status:'active',plan:'single',currentPeriodEnd:now+86400000});
 const req=workspace=>({auth:{uid:'bob'},data:{action:'saveWorkspace',expectedRevision:0,uid:'alice',plan:'unlimited',workspace}});
 await assert.rejects(f.billing(req({td_accounts:[{id:'a'},{id:'b'}],td_tradesList:[]})),{code:'failed-precondition'});
 await assert.rejects(f.billing(req({td_accounts:[{id:'a'}],td_tradesList:[{pnl:10}]})),{code:'failed-precondition'});
 await assert.rejects(f.billing(req({td_accounts:[{id:'a'}],td_tradesList:[{acct:'alice-account',pnl:10}]})),{code:'failed-precondition'});
 await assert.rejects(f.billing(req({td_accounts:[{id:'a'}],td_tradesList:[],isAdmin:true})),{code:'failed-precondition'});
 const r=await f.billing(req({td_accounts:[{id:'a',active:true}],td_tradesList:[{acct:'a',pnl:10}]}));
 assert.equal(r.saved,true);assert.equal(r.workspaceRevision,1);await assert.rejects(f.billing(req({td_accounts:[{id:'a'}],td_tradesList:[]})),{code:'aborted'});assert.equal(f.docs.get('users/bob').td_tradesList[0].acct,'a');
 assert.equal(f.docs.get('users/bob').plan,'premium');assert.equal(f.docs.get('users/alice').td_accounts,undefined);
 const legacy=fixture();await assert.rejects(legacy.billing(req({td_accounts:[],td_tradesList:[]})),{code:'permission-denied'});
});

test('quotes take USD price and uid from trusted catalog and token, not client amounts',async()=>{
 const f=fixture();
 await assert.rejects(f.billing({auth:{uid:'bob'},data:{action:'getQuote',plan:'single',cycle:'yearly'}}),{code:'invalid-argument'});
 const q=await f.billing({auth:{uid:'bob'},data:{action:'getQuote',plan:'single',cycle:'monthly',uid:'alice',price:1}});
 assert.equal(q.displayMinor,1490);assert.equal(q.settlementMinor,4603);assert.equal(q.billingEnabled,false);
 assert.equal(f.docs.get('billingQuotes/'+q.quoteId).uid,'bob');assert.equal(f.docs.get('users/bob').plan,'free');
});
