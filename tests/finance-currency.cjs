const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {convertedRows}=require('../saas-finance-currency');
const source=[{id:'usd',date:'2026-10-01',type:'expense',amount:100,currency:'USD',rate:3.5},{id:'ils',date:'2026-10-02',type:'income',amount:600,currency:'ILS',rate:3},{id:'old',date:'2026-09-01',amount:80},{id:'fallback',date:'2026-10-03',type:'expense',amount:10,currency:'USD',rate:0}];
const before=JSON.stringify(source),period=d=>d.startsWith('2026-10'),rate=()=>3;
const usd=convertedRows(source,'USD',rate,period),ils=convertedRows(source,'ILS',rate,period);
assert.deepEqual(usd.map(e=>e.amount),[100,200,10]);assert.deepEqual(ils.map(e=>e.amount),[350,600,30]);assert.deepEqual(usd.map(e=>e.id),ils.map(e=>e.id));assert.equal(JSON.stringify(source),before);
assert.equal(convertedRows([{amount:100,currency:'USD',rate:Infinity}],'ILS',rate,()=>true)[0].amount,300);
assert.equal(convertedRows([{amount:100,currency:'USD'}],'ILS',()=>NaN,()=>true).length,0);
assert.equal(convertedRows([{amount:100,currency:'USD'}],'USD',()=>NaN,()=>true)[0].amount,100);
assert.deepEqual(convertedRows([], 'ILS',rate,period),[]);
// Exercise the actual combined finance summary: both ledger currencies plus legacy records and fees.
const html=fs.readFileSync('index.html','utf8'),extract=name=>{const s=html.indexOf('function '+name+'(');return html.slice(s,html.indexOf('\n}',s)+2);};
const ctx={Intl,window:{financeRender(){}},document:{},financeCurrency:'USD',businessEvents:source.filter(e=>e.id!=='old'),records:[{id:'legacy',date:'2026-10-01',type:'הוצאה',amount:20,rate:4},{id:'withdraw',date:'2026-10-03',type:'משיכה',amount:50,wdGross:50,wdFeeAmt:5,rate:3}],customExpenses:[],accounts:[],histRate:rate,financeInPeriod:period,financeRows:()=>source.filter(e=>e.id!=='old')};
vm.createContext(ctx);vm.runInContext(extract('financeConvert')+'\n'+extract('financeLegacyRows')+'\n'+extract('financeSuspects')+'\n'+extract('financeCombinedRows'),ctx);vm.runInContext(fs.readFileSync('saas-finance-currency.js','utf8'),ctx);ctx.financePeriodRows=ctx.window.financePeriodRows;
const total=rows=>rows.reduce((s,e)=>s+(e.type==='income'?e.amount:-e.amount),0);
assert.equal(total(ctx.financeCombinedRows()),115);ctx.financeCurrency='ILS';assert.equal(total(ctx.financeCombinedRows()),275);assert.equal(ctx.financeCombinedRows().length,6);assert.equal(JSON.stringify(source),before);
console.log('Mixed USD/ILS conversion, stored/fallback rates, legacy/fees totals, date scope and source preservation passed.');
