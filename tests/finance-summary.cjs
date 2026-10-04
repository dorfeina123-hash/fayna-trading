/* Finance summary checks (v58) — Node only, no browser, no network, synthetic data.
   Usage: node tests/finance-summary.cjs [file.html]   (default: highest dor_trading_vNN.html)
   Verifies: original expenses + free expenses + withdrawals are read into the summary exactly once,
   a withdrawal's fee is an expense (not subtracted twice), old records without a fee still work,
   nothing in the source data is mutated, and the withdrawal-with-fee save path. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const file=process.argv[2]||fs.readdirSync(root).filter(f=>/^dor_trading_v\d+\.html$/.test(f)).sort((a,b)=>parseInt(a.match(/\d+/))-parseInt(b.match(/\d+/))).pop();
const html=fs.readFileSync(path.join(root,file),'utf8');
const raw=html.split('/* v58-finance-begin')[1]?.split('/* v58-finance-end */')[0];
const block=raw&&raw.slice(raw.indexOf('*/')+2);
if(!block){console.error('FAIL: v58 finance block missing in '+file);process.exit(1);}
const line=n=>{const m=html.match(new RegExp('^function '+n+'\\(.*$','m'));if(!m)throw Error('missing '+n);return m[0];};
const wdCalc=html.split('function _wdFeeCalc')[1].split('function cWd(){')[0];
let failed=0;const eq=(a,b,msg)=>{const ok=Math.abs(a-b)<0.011;if(!ok){failed++;console.error('FAIL',msg,'got',a,'expected',b);}else console.log('ok  ',msg);};
const truthy=(v,msg)=>{if(!v){failed++;console.error('FAIL',msg);}else console.log('ok  ',msg);};

function makeCtx(){
  const toasts=[];
  const ctx={console,toasts,records:[],customExpenses:[],accounts:[],businessEvents:[],financeCurrency:'USD',financeRange:'all',financeDate:new Date('2026-10-04T12:00:00'),
    histRate:()=>3.65,escHtml:s=>String(s),showToast:(m)=>toasts.push(m),saveData(){ctx.saved=(ctx.saved||0)+1;},renderAll(){},_nextId:1000,uid(){return ctx._nextId++;},
    mCurrency:'USD',_wdFeeMode:'pct',document:{getElementById:id=>id==='finance-form-status'?ctx.status:id==='finance-modal'?{close(){}}:ctx.fields[id]||null},status:{textContent:''},fields:{}};
  vm.createContext(ctx);
  vm.runInContext([line('financeRows'),line('financePeriodRows'),line('financeTotals'),block,'function _wdFeeCalc'+wdCalc].join('\n'),ctx);
  return ctx;
}
const D='2026-10-02';
function seed(c){
  c.businessEvents=[
    {id:'fin_1',type:'income',date:D,amount:200,currency:'USD',category:'תקבול ממשיכה',note:'manual'},
    {id:'fin_2',type:'expense',date:D,amount:20,currency:'USD',category:'כללי'},
    {id:'fin_3',type:'expense',date:D,amount:999,currency:'USD',archived:true},
    {id:'bz_4',type:'test',date:D,acct:'x'}];
  c.records=[
    {id:1,date:D,type:'הוצאה',amount:50,rate:3.65,cat:'מבחן',company:'APEX'},
    {id:2,date:'2026-09-01',type:'הוצאה',amount:30,rate:3.65,cat:'מנוי',recurringId:'rec_1'},
    {id:3,date:D,type:'הוצאה',amount:100,rate:3.65,currency:'ILS',amountILS:365,cat:'ציוד'},
    {id:4,date:D,type:'משיכה',amount:500,rate:3.65,company:'APEX',cat:'משיכה'},                                   // old: no fee fields
    {id:5,date:D,type:'משיכה',amount:1000,rate:3.65,company:'BULENOX',wdGross:1000,wdPct:8,wdFeeAmt:80,wdNet:920}, // new: fee as amount
    {id:6,date:D,type:'הכנסה',amount:777,rate:3.65}];
  c.customExpenses=[{id:'cx1',category:'עמלות מסחר',desc:'x',date:D,amount:40,rate:3.65}];
  c.accounts=[{id:'a1',name:'APEX-1',withdrawals:[{id:'wd_1',date:D,amount:200,note:''},{id:'wd_2',date:'2026-10-03',amount:300,fee:15,note:''}]}];
  c.recurringTemplates=[{id:'rec_1',amount:30}];
}
const snap=c=>JSON.stringify([c.records,c.customExpenses,c.accounts,c.businessEvents,c.recurringTemplates]);

let c=makeCtx();seed(c);const before=snap(c);
let rows=c.financeCombinedRows(),t=c.financeTotals(rows);
// income: ledger 200 + old wd 500 + new wd 1000 + acct 200 + acct 300 ; the 'הכנסה' record and archived row are excluded
eq(t.income,200+500+1000+200+300,'USD income counts every withdrawal once (gross) + ledger receipt');
// expense: ledger 20 + log 50 + recurring record 30 + ILS record 100 + custom 40 + fees 80 + 15 ; archived 999 excluded; template not counted
eq(t.expense,20+50+30+100+40+80+15,'USD expense counts log, recurring-generated record, free expense, ledger and withdrawal fees once');
eq(t.net,t.income-t.expense,'net = income - expense');
eq(rows.filter(r=>r.wd).reduce((s,r)=>s+r.amount,0),2000,'withdrawals gross total');
eq(rows.filter(r=>r.wdFee).reduce((s,r)=>s+r.amount,0),95,'withdrawal fee total (as expenses)');
eq(rows.filter(r=>r.id==='rec:4').length+rows.filter(r=>r.id==='recfee:4').length,1,'old withdrawal without fee: income row only, no fee row');
// withdrawal net effect equals the old wdNet semantics (gross - fee), i.e. the fee is not subtracted twice
eq(rows.filter(r=>r.id==='rec:5'||r.id==='recfee:5').reduce((s,r)=>s+(r.type==='income'?r.amount:-r.amount),0),920,'new withdrawal net effect = wdNet (920)');
truthy(rows.filter(r=>!r.legacy).length===2,'only active ledger income/expense rows come from businessEvents');
truthy(c.financeSuspects(rows).length>=1&&rows.some(r=>r.suspect),'same-day same-amount withdrawal in two places is flagged (ledger 200 vs account 200)');
eq(t.income,2200,'flagged rows are NOT dropped from the total');
truthy(snap(c)===before,'no source array was mutated by reading/summarising');
// ILS view
c.financeCurrency='ILS';rows=c.financeCombinedRows();
eq(rows.find(r=>r.id==='rec:3').amount,365,'ILS: expense entered in ILS keeps its original ILS amount');
eq(rows.find(r=>r.id==='rec:1').amount,50*3.65,'ILS: USD record converted with its own rate');
truthy(!rows.some(r=>!r.legacy),'ILS view: USD ledger rows are not mixed in (existing behaviour)');
// month filter
c.financeCurrency='USD';c.financeRange='month';rows=c.financeCombinedRows();
truthy(!rows.some(r=>r.id==='rec:2'),'month view excludes other months');
c.financeRange='year';rows=c.financeCombinedRows();truthy(rows.some(r=>r.id==='rec:2'),'year view includes September');

// save withdrawal with amount + fee entered separately
c=makeCtx();let n0=c.records.length;
c.financeSaveWithdrawal({type:'withdrawal',date:D,currency:'USD',company:'APEX',fee:'80',note:'t'},1000);
let r=c.records[c.records.length-1];
truthy(c.records.length===n0+1&&r.type==='משיכה','USD withdrawal saved as one records entry');
eq(r.wdGross,1000,'wdGross');eq(r.wdFeeAmt,80,'wdFeeAmt');eq(r.wdNet,920,'wdNet');eq(r.wdPct,8,'wdPct derived from the amount');
c.financeSaveWithdrawal({type:'withdrawal',date:D,currency:'ILS',company:'APEX',fee:'292'},3650);
r=c.records[c.records.length-1];
eq(r.wdGross,1000,'ILS withdrawal converted to USD gross');eq(r.wdFeeAmt,80,'ILS fee converted');eq(r.amountILS,3650,'original ILS amount kept');
n0=c.records.length;
c.financeSaveWithdrawal({type:'withdrawal',date:D,currency:'USD',company:'APEX',fee:'1001'},1000);
truthy(c.records.length===n0&&/עמלה/.test(c.status.textContent),'fee greater than amount is rejected, nothing saved');
c.financeSaveWithdrawal({type:'withdrawal',date:D,currency:'USD',company:'APEX',fee:''},500);
r=c.records[c.records.length-1];eq(r.wdFeeAmt,0,'empty fee = 0');eq(r.wdNet,500,'net = gross when no fee');
// the summary reads the saved record exactly once (no separate fee expense record exists)
c.financeRange='all';c.financeCurrency='USD';
rows=c.financeCombinedRows();
eq(rows.filter(x=>x.type==='expense'&&!x.wdFee).length,0,'saving a withdrawal creates no separate expense record');

// old withdrawal form fee helper
c=makeCtx();c.fields={'f-wp':{value:'20'},'f-wf':{value:'7.5'}};
c._wdFeeMode='pct';let k=c._wdFeeCalc(100,3.65);eq(k.fee,20,'form: percent mode');
c._wdFeeMode='abs';k=c._wdFeeCalc(100,3.65);eq(k.fee,7.5,'form: amount mode (USD)');eq(k.p,7.5,'form: amount mode derives percent');
c.mCurrency='ILS';c.fields['f-wf'].value='36.5';k=c._wdFeeCalc(100,3.65);eq(k.fee,10,'form: amount mode (ILS converted)');
c.fields['f-wf'].value='99999';k=c._wdFeeCalc(100,3.65);eq(k.fee,100,'form: fee is clamped to the gross');

console.log(failed?`\n${failed} FAILED`:'\nAll finance summary checks passed ('+file+')');
process.exit(failed?1:0);
