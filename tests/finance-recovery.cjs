const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const recovery=require('../fayna-finance-recovery.js'),html=fs.readFileSync('index.html','utf8');
function source(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\n}',a);assert(a>=0,name);return (html.slice(a-6,a)==='async '?'async ':'')+html.slice(a,b+2);}
function storage(seed={}){const data=new Map(Object.entries(seed));return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),data};}
test('source finance cache is copied exactly without assigning unknown ownership',()=>{
 const original='[{"id":1,"date":"2026-09-01","amount":29}]',s=storage({dor_records:original});
 assert(recovery.capture(s,'owner','before-cloud',123));assert.equal(s.getItem('dor_records'),original);
 const snap=JSON.parse(s.getItem(recovery.SNAPSHOT_KEY));assert.equal(snap[0].ownerUid,null);assert.equal(snap[0].values.dor_records,original);
 assert(recovery.capture(s,'owner','again',124));assert.equal(JSON.parse(s.getItem(recovery.SNAPSHOT_KEY)).length,1);
});
test('first recovery copy survives later snapshot retention; storage failure preserves originals',()=>{
 const s=storage({dor_custom:'[{"id":"first"}]'});for(let i=0;i<8;i++){assert(recovery.capture(s,'owner','save',i));s.setItem('dor_custom',JSON.stringify([{id:'later'+i}]))}
 const snaps=JSON.parse(s.getItem(recovery.SNAPSHOT_KEY));assert.equal(snaps.length,3);assert.equal(JSON.parse(snaps[0].values.dor_custom)[0].id,'first');
 const failed={getItem:s.getItem,setItem:()=>{throw Error('quota')}};const before=s.getItem('dor_custom');assert.equal(recovery.capture(failed,'owner','save'),false);assert.equal(s.getItem('dor_custom'),before);
});
test('v2 backup includes original expense stores; merge is additive and idempotent',()=>{
 const row={id:'one',date:'2026-09-01',amount:29,type:'הוצאה'},state={records:[row],customExpenses:[],recurringTemplates:[],businessEvents:[],businessNotes:{month:'current'}};
 const data=recovery.backup(state);assert.equal(data.version,2);assert.equal(data.records[0],row);
 const incoming={...data,records:[{...row,amount:999},{...row,id:'two'}],businessNotes:{month:'old',other:'restored'},tradesList:[{id:'foreign'}]};
 const before=JSON.stringify(state),p=recovery.plan(state,incoming);assert.equal(p.totalAdded,1);assert.equal(p.data.records[0].amount,29);assert.equal(p.data.businessNotes.month,'current');assert.equal(p.data.businessNotes.other,'restored');assert.equal(p.data.tradesList,undefined);assert.equal(JSON.stringify(state),before);assert.equal(recovery.plan(p.data,incoming).totalAdded,0);
});
test('old original-expense exports and ledger v1 remain recoverable; invalid inputs never mutate',()=>{
 const state={records:[],customExpenses:[],recurringTemplates:[],businessEvents:[],businessNotes:{}};
 assert.equal(recovery.plan(state,{records:[{id:1,date:'2026-09-01',amount:29}]}).totalAdded,1);
 assert.equal(recovery.plan(state,{kind:'fayna-finance',version:1,businessEvents:[{id:'b',date:'2026-09-01',type:'expense',amount:4}]}).totalAdded,1);
 assert.throws(()=>recovery.plan(state,{records:[{id:1,amount:'bad'}]}));assert.throws(()=>recovery.plan(state,{kind:'fayna-trading',version:1}));assert.equal(state.records.length,0);
});
function syncHarness({ready=null,fail=false}={}){
 const s=storage({dor_records:'[{"id":"local-copy","date":"2026-09-01","amount":8}]'}),writes=[],timers=[];
 const ctx={console,localStorage:s,FaynaFinanceRecovery:recovery,setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},db:{collection:()=>({doc:()=>({get:async()=>{if(fail)throw Error('offline');return {exists:true,data:()=>({td_records:[{id:'cloud-row',date:'2026-09-02',amount:12}],td_tradesList:[],td_accounts:[],td_bizEvents:[]})}},set:async data=>writes.push(data)})})},_updateSyncDot(){},_invalidateUsersCache(){},showToast(){},applyRecurring(){},renderAll(){},renderSymbolManager(){},_refreshSymDatalist(){},document:{getElementById:()=>null}};
 vm.createContext(ctx);vm.runInContext(`let currentUser={uid:'owner'},_cloudReadyUid=${JSON.stringify(ready)},_cloudSaveTimer=null,_cloudSyncing=false,_cloudSaveAgain=false;let records=[],tradesList=[],customExpenses=[],recurringTemplates=[],accounts=[],businessEvents=[],businessNotes={},pnlOn={},commSettings={},customSymbols=[];`+['_preserveFinanceCache','_cloudSave','_cloudLoad','_silentSave'].map(source).join('\n'),ctx);
 return {s,writes,timers,run:c=>vm.runInContext(c,ctx)};
}
test('identified session cannot upload or silently replace local expenses before hydration',async()=>{
 const h=syncHarness();h.run('_cloudSave();_silentSave(false)');assert.equal(h.timers.length,0);assert.equal(h.writes.length,0);assert.match(h.s.getItem('dor_records'),/local-copy/);
});
test('successful cloud load preserves prior cache before replacement and enables cloud save',async()=>{
 const h=syncHarness();await h.run('_cloudLoad()');assert.equal(h.run('_cloudReadyUid'),'owner');assert.match(h.s.getItem('dor_records'),/cloud-row/);assert.match(JSON.parse(h.s.getItem(recovery.SNAPSHOT_KEY))[0].values.dor_records,/local-copy/);
 h.run('_cloudSave()');await h.timers.pop()();assert.equal(h.writes.length,1);assert.equal(h.writes[0].td_records[0].id,'cloud-row');
});
test('failed cloud read keeps uploads blocked and source cache intact',async()=>{
 const h=syncHarness({fail:true});await h.run('_cloudLoad()');h.run('_cloudSave();_silentSave(false)');assert.equal(h.writes.length,0);assert.equal(h.run('_cloudReadyUid'),null);assert.match(h.s.getItem('dor_records'),/local-copy/);
});
test('actual restore previews confirmation and backs up before additive writes; cancel changes nothing',async()=>{
 const actions=[],s=storage(),ctx={FaynaFinanceRecovery:recovery,localStorage:s,currentUser:{uid:'owner'},_cloudReadyUid:'owner',records:[{id:'kept',date:'2026-09-01',amount:8}],customExpenses:[],recurringTemplates:[],businessEvents:[],businessNotes:{},_preserveFinanceCache:()=>true,canUse:()=>true,customConfirm:async()=>false,workspaceDownload:()=>actions.push('backup'),saveData:()=>actions.push('save'),saveBizData:()=>actions.push('saveBiz'),renderAll(){},financeRender(){},showToast(){}};
 vm.createContext(ctx);vm.runInContext(source('workspaceRestore'),ctx);
 const input={files:[{size:100,text:async()=>JSON.stringify({records:[{id:'added',date:'2026-09-02',amount:12}]})}],value:'selected'};
 ctx.input=input;await vm.runInContext("workspaceRestore(input,'finance')",ctx);assert.equal(ctx.records.length,1);assert.equal(actions.length,0);
 ctx.customConfirm=async()=>true;await vm.runInContext("workspaceRestore(input,'finance')",ctx);assert.equal(ctx.records.length,2);assert.equal(ctx.records[0].id,'kept');assert.deepEqual(actions,['backup','save','saveBiz']);assert.equal(input.value,'');
});
