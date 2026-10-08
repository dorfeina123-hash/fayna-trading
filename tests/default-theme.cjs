const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');const code=fs.readFileSync('saas-default-theme.js','utf8');
for(const [saved,expected] of [[null,'light'],['dark',null],['light',null]]){const calls=[],ctx={window:{_applyTheme:m=>calls.push(m)},document:{readyState:'complete'},localStorage:{getItem:()=>saved,setItem:()=>{throw Error('must not overwrite preference')}}};vm.runInNewContext(code,ctx);a.deepEqual(calls,expected?[expected]:[]);}
console.log('Light default and existing dark/light preference preservation passed without storage writes.');
