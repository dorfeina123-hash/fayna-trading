const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function initAuth() {'),end=html.indexOf('\n}',start);
function harness(requested){
 let callback,entries=0,errors=[];
 const ctx={setTimeout,clearTimeout,console,ADMIN_EMAIL:'admin@example.test',auth:{onAuthStateChanged:fn=>callback=fn,signOut:async()=>{}},db:{collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({name:'Trader',status:'active',plan:'pro'})})})})},loadSettingsFromFirestore:()=>Promise.resolve(),showApp:()=>entries++,_showAuthScreen:e=>errors.push(e)};
 vm.createContext(ctx);vm.runInContext('let _siteEntryRequested='+requested+';let _authInitialized=false,_registering=false,_manualLogin=false,currentUser=null;'+html.slice(start,end+2)+';initAuth();',ctx);
 return {run:s=>vm.runInContext(s,ctx),callback:()=>callback({uid:'trader',email:'trader@example.test'}),entries:()=>entries,errors};
}
test('restored Firebase session loads profile but remains on public opening',async()=>{
 const h=harness(false);await h.callback();assert.equal(h.entries(),0);assert.equal(h.run('currentUser.uid'),'trader');assert.deepEqual(h.errors,[]);
});
test('entry requested before profile finishes opens workspace once validation completes',async()=>{
 const h=harness(true);await h.callback();assert.equal(h.entries(),1);assert.deepEqual(h.errors,[]);
});
