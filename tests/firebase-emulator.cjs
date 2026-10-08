/* Synthetic emulator data only. Refuse to run without local emulators. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {initializeApp,deleteApp}=require('firebase/app');
const {getAuth,connectAuthEmulator,GoogleAuthProvider,signInWithCredential,signOut}=require('firebase/auth');
const {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,updateDoc,terminate}=require('firebase/firestore');
for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST'])assert.match(process.env[key]||'',/^(127\.0\.0\.1|localhost):\d+$/,key+' must be local');
const projectId='demo-fayna-ui';
function token(sub,email){return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:projectId,sub,email,email_verified:true,name:'Synthetic test user',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.';}
(async()=>{
 const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')}});const apps=[],dbs=[];
 try{
  await env.clearFirestore();
  async function login(name,email){const app=initializeApp({projectId,apiKey:'emulator-only',authDomain:'localhost'},name);apps.push(app);const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});const result=await signInWithCredential(auth,GoogleAuthProvider.credential(token(name,email)));assert.equal(result.user.providerData[0].providerId,'google.com');const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);dbs.push(db);return {auth,db,uid:result.user.uid};}
  const existing=await login('existing-google','existing@example.test'),other=await login('other-google','other@example.test'),admin=await login('admin-google','dorfeina123@gmail.com');
  const legacy={email:'existing@example.test',name:'משתמש סינתטי קיים',isAdmin:false,plan:'lifetime',status:'active',subscriptionPlan:'premium',td_accounts:[{id:'legacy-prop',name:'Synthetic Prop'}],td_records:[{id:'expense-1',type:'הוצאה',amount:79}],td_tradesList:[{id:'trade-1',date:'2026-10-01',sym:'SYNTHETIC-MNQ',pnl:100}]};
  const ref=doc(existing.db,'users',existing.uid);await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'users',existing.uid),legacy));
  assert.deepEqual((await assertSucceeds(getDoc(ref))).data(),legacy);
  const updated=[...legacy.td_tradesList,{id:'trade-2',date:'2026-10-02',sym:'SYNTHETIC-ES',pnl:-40}];await assertSucceeds(updateDoc(ref,{td_tradesList:updated}));
  const saved=(await getDoc(ref)).data();assert.deepEqual(saved,{...legacy,td_tradesList:updated});
  await assertFails(getDoc(doc(other.db,'users',existing.uid)));await assertFails(updateDoc(doc(other.db,'users',existing.uid),{td_tradesList:[]}));await assertFails(updateDoc(ref,{isAdmin:true}));await assertFails(updateDoc(ref,{plan:'premium'}));
  await assertSucceeds(getDoc(doc(admin.db,'users',existing.uid)));await assertSucceeds(setDoc(doc(admin.db,'adminNotes','synthetic-note'),{note:'test'}));await assertFails(setDoc(doc(other.db,'adminNotes','synthetic-denied'),{note:'test'}));
  await signOut(existing.auth);await assertFails(getDoc(ref));await signInWithCredential(existing.auth,GoogleAuthProvider.credential(token('existing-google','existing@example.test')));assert.deepEqual((await getDoc(ref)).data(),saved);
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/firebase-report.json',JSON.stringify({projectId,googleEmulator:true,legacyRoundTrip:true,tenantIsolation:true,adminRules:true,scope:'SDK emulator integration and unchanged rules; not production Google OAuth or full UI provisioning'},null,2));
  console.log('Google provider emulator, existing lifetime data round trip, expense/account preservation, tenant denial and admin rules passed.');
 }finally{await Promise.all(dbs.map(terminate));await Promise.all(apps.map(deleteApp));await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1});
