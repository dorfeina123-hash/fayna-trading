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

test('managed signup cannot create its profile or consume invites directly',async()=>{
 await env.withSecurityRulesDisabled(async context=>{
  await setDoc(doc(context.firestore(),'invites','cohort@example.com'),{email:'cohort@example.com',plan:'premium'});
  await setDoc(doc(context.firestore(),'invites','consumed@example.com'),{email:'consumed@example.com',plan:'premium',consumedBy:'original'});
 });
 const db=env.authenticatedContext('cohort',{email:'cohort@example.com',email_verified:true,fayna_managed_signup:true}).firestore();
 await assertFails(setDoc(doc(db,'users','cohort'),{email:'cohort@example.com',name:'Test',isAdmin:false,plan:'premium',status:'active'}));
 await assertSucceeds(getDoc(doc(db,'invites','cohort@example.com')));
 await assertFails(deleteDoc(doc(db,'invites','cohort@example.com')));
 const consumed=env.authenticatedContext('recreated',{email:'consumed@example.com'}).firestore();
 await assertFails(deleteDoc(doc(consumed,'invites','consumed@example.com')));
});
