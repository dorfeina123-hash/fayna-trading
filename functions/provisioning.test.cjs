const {test}=require('node:test');
const assert=require('node:assert/strict');
const {profileInput,provision}=require('./provisioning.cjs');
function fixture(initial={}){
 const docs=new Map(Object.entries(initial));
 const db={doc:path=>({path}),runTransaction:async fn=>{
  const staged=new Map(docs);let wrote=false;
  const tx={get:async ref=>{assert(!wrote,'all reads precede writes');return {exists:staged.has(ref.path),data:()=>staged.get(ref.path)};},
   create:(r,v)=>{wrote=true;assert(!staged.has(r.path));staged.set(r.path,v);},
   update:(r,v)=>{wrote=true;assert(staged.has(r.path));staged.set(r.path,{...staged.get(r.path),...v});}};
  const result=await fn(tx);docs.clear();for(const [k,v]of staged)docs.set(k,v);return result;
 }};
 const run=(overrides={})=>provision({db,uid:'alice',input:{name:'Alice',phone:'0501234567'},authRecord:{email:'ALICE@example.com',emailVerified:true},now:1800000000000,timestamp:123,...overrides});
 return {docs,run};
}
test('new account gets server Free entitlement and is idempotent',async()=>{
 const f=fixture();assert.deepEqual(await f.run(),{created:true,source:'new_free',plan:'free'});
 assert.equal(f.docs.get('users/alice').email,'alice@example.com');
 assert.equal(f.docs.get('users/alice').isAdmin,false);
 assert.equal(f.docs.get('subscriptions/alice').plan,'free');
 const before=JSON.stringify([...f.docs]);assert.equal((await f.run()).created,false);assert.equal(JSON.stringify([...f.docs]),before);
});
test('client cannot assign identity, plan, admin or trial dates',async()=>{
 for(const key of ['uid','email','plan','isAdmin','trialStartedAt','subscription','status']){
  const f=fixture();await assert.rejects(f.run({input:{name:'Alice',[key]:'attacker'}}),/untrusted_profile_field/);assert.equal(f.docs.size,0);
 }
 assert.throws(()=>profileInput({name:'<script>'}),/invalid_profile/);
 assert.throws(()=>profileInput({name:'x'.repeat(121)}),/invalid_profile/);
});
test('only verified non-disabled Auth identity can claim an invitation',async()=>{
 for(const record of [{email:'alice@example.com',emailVerified:false},{email:'alice@example.com',emailVerified:true,disabled:true},{}]){
  const f=fixture();await assert.rejects(f.run({authRecord:record}),/verified_email_required/);assert.equal(f.docs.size,0);
 }
});
test('verified invitation preserves explicit lifetime grant and consumes atomically',async()=>{
 const f=fixture({'invites/alice@example.com':{email:'alice@example.com',plan:'lifetime',name:'Invitation'}});
 assert.equal((await f.run()).source,'verified_invite');assert.equal(f.docs.get('users/alice').plan,'lifetime');
 assert.equal(f.docs.get('invites/alice@example.com').consumedBy,'alice');assert(!f.docs.has('subscriptions/alice'));
 await assert.rejects(f.run({uid:'recreated-user'}),/invalid_invite/);assert(!f.docs.has('users/recreated-user'));
});
test('existing users and data are preserved exactly',async()=>{
 const f=fixture({'users/alice':{plan:'premium',td_records:[{id:1,amount:30}]},'invites/alice@example.com':{plan:'free'}});
 const before=JSON.stringify([...f.docs]);assert.equal((await f.run()).source,'existing_preserved');assert.equal(JSON.stringify([...f.docs]),before);
});
test('invalid invitations and orphan grants fail without partial creation',async()=>{
 for(const initial of [
  {'invites/alice@example.com':{email:'bob@example.com',plan:'premium'}},
  {'invites/alice@example.com':{email:'alice@example.com',plan:'admin'}},
  {'trialGrants/alice':{startedAt:1}}, {'subscriptions/alice':{plan:'single'}}
 ]){const f=fixture(initial),before=JSON.stringify([...f.docs]);await assert.rejects(f.run());assert.equal(JSON.stringify([...f.docs]),before);}
});
