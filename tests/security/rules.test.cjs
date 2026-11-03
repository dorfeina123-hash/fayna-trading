const {test,after,before}=require('node:test');
const fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,getDoc,deleteDoc}=require('firebase/firestore');
let env;
before(async()=>{
 if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Refusing to run security tests outside localhost emulator');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 env=await initializeTestEnvironment({projectId:'demo-fayna',firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  for(const uid of ['alice','legacy','orphan'])await setDoc(doc(db,'users',uid),{email:uid+'@example.com',isAdmin:false,plan:'pro',status:'active',td_accounts:[{id:'a'}],td_tradesList:[]});
  await setDoc(doc(db,'subscriptions','alice'),{plan:'single',status:'active'});
  await setDoc(doc(db,'trialGrants','orphan'),{startedAt:1});
  await setDoc(doc(db,'billingQuotes','quote'),{uid:'alice',settlementMinor:4603});
 });
});
after(async()=>{if(env)await env.cleanup()});
test('managed owner cannot bypass transactional account and trade saves',async()=>{
 const db=env.authenticatedContext('alice',{email:'alice@example.com'}).firestore();
 await assertFails(updateDoc(doc(db,'users','alice'),{td_accounts:[{id:'a'},{id:'b'}]}));
 await assertFails(updateDoc(doc(db,'users','alice'),{td_tradesList:[{pnl:1}]}));
 await assertFails(updateDoc(doc(db,'users','alice'),{plan:'premium'}));
 await assertFails(updateDoc(doc(db,'users','alice'),{planExpiresAt:9999999999999}));
 await assertSucceeds(updateDoc(doc(db,'users','alice'),{bio:'safe profile edit'}));
 await assertFails(getDoc(doc(db,'users','legacy')));
 await assertSucceeds(getDoc(doc(db,'subscriptions','alice')));
 await assertFails(setDoc(doc(db,'subscriptions','alice'),{plan:'unlimited'}));
 await assertFails(deleteDoc(doc(db,'subscriptions','alice')));
 await assertFails(getDoc(doc(db,'billingQuotes','quote')));
});
test('retained trial grant keeps direct trading saves blocked after missing subscription',async()=>{
 const db=env.authenticatedContext('orphan',{email:'orphan@example.com'}).firestore();
 await assertFails(updateDoc(doc(db,'users','orphan'),{td_accounts:[]}));
});
test('existing legacy sync remains permitted for own account only',async()=>{
 const db=env.authenticatedContext('legacy',{email:'legacy@example.com'}).firestore();
 await assertSucceeds(updateDoc(doc(db,'users','legacy'),{td_tradesList:[{acct:'a',pnl:1}]}));
 await assertFails(updateDoc(doc(db,'users','alice'),{td_tradesList:[]}));
 await assertFails(updateDoc(doc(db,'users','legacy'),{paymentStatus:'paid'}));
});
test('referral codes cannot be taken over and click counters only go up by one',async()=>{
 const alice=env.authenticatedContext('alice',{email:'alice@example.com'}).firestore();
 const legacy=env.authenticatedContext('legacy',{email:'legacy@example.com'}).firestore();
 await assertSucceeds(setDoc(doc(alice,'refCodes','CODEA'),{uid:'alice'}));
 await assertSucceeds(setDoc(doc(alice,'refCodes','CODEA'),{uid:'alice'}));
 await assertFails(setDoc(doc(legacy,'refCodes','CODEA'),{uid:'legacy'}));
 await assertFails(setDoc(doc(legacy,'refCodes','CODEB'),{uid:'alice'}));
 const anon=env.unauthenticatedContext().firestore();
 await assertFails(setDoc(doc(anon,'refClicks','CODEA'),{count:500}));
 await assertSucceeds(setDoc(doc(anon,'refClicks','CODEA'),{count:1}));
 await assertSucceeds(setDoc(doc(anon,'refClicks','CODEA'),{count:2}));
 await assertFails(setDoc(doc(anon,'refClicks','CODEA'),{count:99}));
});
test('a signed-out visitor can file a cancellation request but cannot read requests',async()=>{
 const anon=env.unauthenticatedContext().firestore();
 const {addDoc,collection}=require('firebase/firestore');
 await assertSucceeds(addDoc(collection(anon,'billing_requests'),{type:'cancel',plan:'',cycle:'',uid:null,email:'someone@example.com',provider:'public-form',createdAt:1}));
 await assertFails(addDoc(collection(anon,'billing_requests'),{type:'cancel',uid:'alice',email:'x@example.com'}));
 await assertFails(addDoc(collection(anon,'billing_requests'),{type:'cancel',uid:null,email:'x'.repeat(300)}));
});
