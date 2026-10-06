const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const fn=html.slice(html.indexOf('async function dmClearTrades()'),html.indexOf('async function dmClearRecords()'));
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if(!/src=|ld\+json/.test(m[1])) new vm.Script(m[2]);
assert.match(html,/onclick="dmClearTrades\(\)">מחיקת כל העסקאות/);
async function scenario(accept,empty=false,concurrent=false){
 let saves=0,confirms=0,message='';
 const c={showToast:()=>{},renderAll:()=>{},renderDM:()=>{},saveData:()=>saves++,customConfirm:async(text,opts)=>{confirms++;message=text;assert.equal(opts.danger,true);if(concurrent)vm.runInContext('tradesList.push({id:3})',c);return accept;}};
 vm.createContext(c);vm.runInContext('let records=[{id:"expense"}],accounts=[{id:"account"}];let tradesList='+ (empty?'[]':'[{id:1,acct:"a"},{id:2,acct:"b"}]')+';'+fn,c);
 await vm.runInContext('dmClearTrades()',c);
 assert.equal(vm.runInContext('records.length+accounts.length',c),2);
 assert.equal(saves,!empty&&accept?1:0);assert.equal(confirms,empty?0:1);
 assert.equal(vm.runInContext('tradesList.length',c),empty?0:accept?(concurrent?1:0):2);
 if(!empty)assert(message.includes('2')&&message.includes('מכל התיקים'));
}
(async()=>{await scenario(false);await scenario(true);await scenario(true,true);await scenario(true,false,true);console.log('Bulk deletion: cancel, confirm, empty journal, concurrent additions, expense/account preservation and save passed. Inline scripts compile.');})().catch(e=>{console.error(e);process.exitCode=1;});
