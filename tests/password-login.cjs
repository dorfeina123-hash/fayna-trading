const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function source(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\n}',a);assert(a>=0,name);return (html.slice(a-6,a)==='async '?'async ':'')+html.slice(a,b+2);}
function setup({restored=false,blocked=false,fail=false,emit=false}={}){
 const els={'login-email':{value:'trader@example.test'},'login-pass':{value:'fictional-password'},'remember-me':{checked:true},'login-msg':{textContent:''},'login-btn':{disabled:false,textContent:'כניסה למערכת'},'auth-screen':{style:{display:'flex'}},'welcome-back-screen':{style:{}}};
 let entries=0,reads=0,listener;
 const profile={uid:'trader',name:'Trader',status:blocked?'blocked':'active',plan:'pro'};
 const auth={currentUser:restored?{uid:'trader'}:null,setPersistence:async()=>{},signOut:async()=>{auth.currentUser=null},onAuthStateChanged:fn=>listener=fn,signInWithEmailAndPassword:async()=>{if(fail)throw {code:'auth/invalid-credential'};const user={uid:'trader',email:'trader@example.test'};auth.currentUser=user;if(emit)listener(user);return {user}}};
 const firebaseAuth=()=>{};firebaseAuth.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};
 const ctx={auth,firebase:{auth:firebaseAuth},setTimeout,clearTimeout,console,ADMIN_EMAIL:'admin@example.test',document:{getElementById:id=>els[id]||null},localStorage:{setItem(){},removeItem(){}},db:{collection:()=>({doc:()=>({get:async()=>{reads++;await new Promise(r=>setTimeout(r,5));return {exists:true,data:()=>profile}}})})},loadSettingsFromFirestore:()=>Promise.resolve(),showApp:()=>{entries++;els['auth-screen'].style.display='none'},showMsg:(el,type,text)=>el.textContent=text,_showAuthScreen:text=>{els['login-msg'].textContent=text;els['login-btn'].disabled=false}};
 vm.createContext(ctx);vm.runInContext(`let _authProfileTask=null,_authInitialized=false,_registering=false,_manualLogin=false,_siteEntryRequested=false,_loginAttempts=0;const REMEMBER_KEY='email';let currentUser=${restored?JSON.stringify(profile):'null'};`+['_handleAuthUser','_ensureAuthProfile','initAuth','doLogin'].map(source).join('\n')+';initAuth();',ctx);
 return {login:()=>vm.runInContext('doLogin()',ctx),entries:()=>entries,reads:()=>reads,els};
}
test('same-user password sign-in completes without a new Firebase auth event',async()=>{const h=setup({restored:true});await h.login();assert.equal(h.entries(),1);assert.equal(h.els['login-btn'].disabled,false);assert.equal(h.els['auth-screen'].style.display,'none');});
test('new sign-in explicitly validates profile even if auth event is absent',async()=>{const h=setup();await h.login();assert.equal(h.reads(),1);assert.equal(h.entries(),1);assert.equal(h.els['login-btn'].disabled,false);});
test('auth event and password completion share one pending profile read',async()=>{const h=setup({emit:true});await h.login();assert.equal(h.reads(),1);assert.equal(h.entries(),1);});
test('blocked profile never enters workspace',async()=>{const h=setup({blocked:true});await h.login();assert.equal(h.entries(),0);assert.match(h.els['login-msg'].textContent,/חסומה/);assert.equal(h.els['login-btn'].disabled,false);});
test('invalid credentials show an error and release the login button',async()=>{const h=setup({fail:true});await h.login();assert.equal(h.entries(),0);assert.match(h.els['login-msg'].textContent,/שגויים/);assert.equal(h.els['login-btn'].disabled,false);});
