const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { snapshot } = require('./billing.cjs');
function fixture() {
  const docs = new Map([['users/alice', {plan:'lifetime', td_trades:[{pnl:25}]}], ['users/bob', {plan:'free'}]]);
  const db = {doc: path => ({path}), runTransaction: async fn => fn({
    get: async ref => ({exists:docs.has(ref.path), data:()=>docs.get(ref.path)}),
    create: (ref, value) => {assert(!docs.has(ref.path));docs.set(ref.path,value);}
  })};
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  const exports = {};
  vm.runInNewContext(fs.readFileSync(__dirname+'/index.cjs','utf8'), {exports, require: name => {
    if(name.includes('/https'))return {onCall:(options,fn)=>{assert.equal(options.enforceAppCheck,true);return fn;},onRequest:(_,fn)=>fn,HttpsError};
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
