/* Synthetic emulator data only. Refuse to run without local emulators. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {initializeApp,deleteApp}=require('firebase/app');
const {getAuth,connectAuthEmulator,GoogleAuthProvider,signInWithCredential,signOut}=require('firebase/auth');
const {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,updateDoc,deleteDoc,serverTimestamp,increment,terminate}=require('firebase/firestore');
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
  // Execute the unchanged application functions against the emulator through a compat-shaped adapter.
  const html=fs.readFileSync('index.html','utf8');
  function source(name){const start=html.indexOf('function '+name+'('),end=html.indexOf('\n}',start);assert(start>=0&&end>start);return (html.slice(start-6,start)==='async '?'async ':'')+html.slice(start,end+2);}
  // Node VM objects have a different prototype; normalize only plain maps/arrays at the SDK adapter boundary, retaining Firestore sentinels.
  function bridge(value){if(Array.isArray(value))return Array.from(value,bridge);if(value&&value.constructor?.name==='Object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,bridge(v)]));return value;}
  function compat(db){return {collection:collection=>({doc:id=>{const r=doc(db,collection,id);return {get:async()=>{const s=await getDoc(r);return {exists:s.exists(),data:()=>s.data()};},set:(value,opts)=>opts?setDoc(r,bridge(value),bridge(opts)):setDoc(r,bridge(value)),update:value=>updateDoc(r,bridge(value)),delete:()=>deleteDoc(r)};}})};}
  let pending;const storage=new Map(),sync=[];
  const ctx={console,db:compat(existing.db),auth:existing.auth,currentUser:{uid:existing.uid},ADMIN_EMAIL:'dorfeina123@gmail.com',records:legacy.td_records,tradesList:updated,accounts:legacy.td_accounts,customExpenses:[],pnlOn:{},commSettings:{},customSymbols:[],recurringTemplates:[],_cloudSaveTimer:null,_cloudSyncing:false,setTimeout:callback=>{pending=callback;return 1;},clearTimeout(){},firebase:{firestore:{FieldValue:{serverTimestamp,increment}}},_updateSyncDot:s=>sync.push(s),_invalidateUsersCache(){},_logEvent:async()=>{},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null},document:{getElementById:()=>null},applyRecurring(){},renderAll(){},renderSymbolManager(){},_refreshSymDatalist(){},_consentDefaults:()=>({}),_refPayload:()=>({}),_applyConsentOnRegister(){},_recordReferral(){},sendRegistrationEmail(){}};
  vm.createContext(ctx);vm.runInContext(source('_cloudSave')+'\n'+source('_cloudLoad')+'\n'+source('_gaProvision'),ctx);
  assert.equal((await ctx._gaProvision(existing.auth.currentUser)).isNew,false);assert.equal(ctx.currentUser.plan,'lifetime');assert.equal(ctx.currentUser.subscriptionPlan,'premium');
  ctx._cloudSave();await pending();assert.equal(sync.at(-1),'synced');ctx.tradesList=[];ctx.records=[];ctx.accounts=[];await ctx._cloudLoad();assert.equal(sync.at(-1),'synced');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.tradesList)),updated);assert.deepEqual(JSON.parse(JSON.stringify(ctx.records)),legacy.td_records);assert.deepEqual(JSON.parse(JSON.stringify(ctx.accounts)),legacy.td_accounts);assert.deepEqual(JSON.parse(storage.get('dor_trades')),updated);
  ctx.db=compat(other.db);ctx.auth=other.auth;assert.equal((await ctx._gaProvision(other.auth.currentUser)).isNew,true);assert.equal(ctx.currentUser.plan,'pro');assert.equal(ctx.currentUser.isAdmin,false);
  await assertFails(getDoc(doc(other.db,'users',existing.uid)));await assertFails(updateDoc(doc(other.db,'users',existing.uid),{td_tradesList:[]}));await assertFails(updateDoc(ref,{isAdmin:true}));await assertFails(updateDoc(ref,{plan:'premium'}));
  await assertSucceeds(getDoc(doc(admin.db,'users',existing.uid)));await assertSucceeds(setDoc(doc(admin.db,'adminNotes','synthetic-note'),{note:'test'}));await assertFails(setDoc(doc(other.db,'adminNotes','synthetic-denied'),{note:'test'}));
  const afterCloud=(await getDoc(ref)).data();assert.equal(afterCloud.plan,'lifetime');assert.equal(afterCloud.subscriptionPlan,'premium');assert.deepEqual(afterCloud.td_records,legacy.td_records);assert.deepEqual(afterCloud.td_accounts,legacy.td_accounts);
  await signOut(existing.auth);await assertFails(getDoc(ref));await signInWithCredential(existing.auth,GoogleAuthProvider.credential(token('existing-google','existing@example.test')));assert.deepEqual((await getDoc(ref)).data(),afterCloud);
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/firebase-report.json',JSON.stringify({projectId,googleEmulator:true,legacyRoundTrip:true,tenantIsolation:true,adminRules:true,actualApplicationCloudFunctions:true,actualGoogleProvision:true,newUserDefault:'pro',scope:'emulated Google credentials and unchanged application functions; not production Google popup'},null,2));
  console.log('Google provider emulator, existing lifetime data round trip, expense/account preservation, tenant denial and admin rules passed.');
 }finally{await Promise.all(dbs.map(terminate));await Promise.all(apps.map(deleteApp));await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1});
