const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\n}',a);assert(a>=0,name);return (html.slice(a-6,a)==='async '?'async ':'')+html.slice(a,b+2);}
function setup(accts,selected=['__all__']){
 const values={'at-date':'2026-10-18','at-sym':'ES','at-qty':'1','at-entry':'100','at-exit':'101','at-time':'10:00','at-dur':'','at-strategy':'','at-notes':'','at-comm':'','at-acct':'','me-date':'2026-10-18','me-pnl':'50','me-count':'2','me-which':'','me-notes':'','me-acct':'','me-acct-new':''};
 let saves=0,lastToast='';
 const elements=Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,style:{}}]));elements['acct-picker']={style:{}};
 const c={FaynaAccountPolicy:require('../functions/account-policy.js'),document:{getElementById:id=>elements[id]},window:{_atDir:'long'},showToast:t=>lastToast=t,_getFuturesMultiplier:()=>50,tradeComm:()=>0,renderAll(){},renderTJ(){},renderAcctMenu(){},applyAcctFilter(){},closeAddTrade(){},closeManualEntry(){},saveData:()=>saves++,saveAccounts:()=>saves++,fmtD:x=>x,customConfirm:async()=>true,checkLimit:()=>false,canUse:()=>true,customPrompt:async()=> 'another',showUpgradeModal(){}};
 vm.createContext(c);vm.runInContext('let accounts='+JSON.stringify(accts)+';let tradesList=[];let selectedAccounts=new Set('+JSON.stringify(selected)+');let _meImg=null;'+['_activeTradingAccounts','_requireTradeAccount','_canCreateTradingAccount','saveAddTrade','saveManualEntry','_setTradeAcct','deleteAccount','_newTradeAcct'].map(fn).join('\n'),c);
 return {c,elements,run:s=>vm.runInContext(s,c),saves:()=>saves,toast:()=>lastToast};
}
test('manual trade cannot be added without a real account; one available account binds automatically',()=>{
 const empty=setup([]);empty.run('saveAddTrade()');assert.equal(empty.run('tradesList.length'),0);assert.equal(empty.saves(),0);
 const one=setup([{id:'a',name:'main'}]);one.run('saveAddTrade()');assert.equal(one.run('tradesList[0].acct'),'a');assert.equal(one.saves(),1);
});
test('multiple accounts require explicit destination; stale/foreign IDs are rejected',()=>{
 const f=setup([{id:'a',name:'one'},{id:'b',name:'two'}]);f.run('saveAddTrade()');assert.equal(f.saves(),0);
 f.elements['at-acct'].value='foreign';f.run('saveAddTrade()');assert.equal(f.saves(),0);
 f.elements['at-acct'].value='b';f.run('saveAddTrade()');assert.equal(f.run('tradesList[0].acct'),'b');
});
test('daily summary also binds to a real account',()=>{
 const empty=setup([]);empty.run('saveManualEntry()');assert.equal(empty.saves(),0);
 const one=setup([{id:'a',name:'main'}]);one.run('saveManualEntry()');assert.equal(one.run('tradesList[0].acct'),'a');
});
test('inline account creation cannot bypass capacity; archiving preserves trade references',async()=>{
 const f=setup([{id:'a',name:'main'}]);await f.run('_newTradeAcct(0)');assert.equal(f.run('accounts.length'),1);
 f.run("tradesList=[{acct:'a',pnl:10}]");await f.run("deleteAccount('a')");assert.equal(f.run('accounts.length'),1);assert.equal(f.run('accounts[0].active'),false);assert.equal(f.run('tradesList[0].acct'),'a');
});
