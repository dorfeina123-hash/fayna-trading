/* Trade math checks — Node only, no browser, no network, synthetic data.
   Covers direction, R multiples of shorts, contract multipliers and zero commission rates. */
const fs=require('fs'),vm=require('vm'),a=require('assert/strict');
const h=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const part=(from,to)=>{const i=h.indexOf(from),j=h.indexOf(to,i);a(i>=0&&j>i,from);return h.slice(i,j);};
const c={customSymbols:[],commSettings:{enabled:true,ratePerContract:1.58,ratePerContractFull:3.98},histRate:()=>3};
vm.createContext(c);
vm.runInContext([part('function _symBase(','function _customSymbolFor('),part('function _customSymbolFor(','// Commission rate per contract'),part('function _commRateFor(','// ── Symbol manager UI'),part('const _FUTURES_MULT','// ── Manual Add Trade'),part('function _isMicroContract(','// Daily net-P&L map')].join('\n'),c);

for(const [sym,mult] of [['MNQZ6',2],['NQZ6',20],['ESH7',50],['SIZ6',5000],['SILZ6',1000],['HGZ6',25000],['6EZ6',125000],['M6EZ6',12500],['ZNZ6',1000],['MBTZ6',0.1],['BTCZ6',5],['mnqz6',2],['MNQZ2026',2],['MNQZ6@CME',2],['CME_MINI:NQZ2026',20],['CLOV',1],['TSLA',1]])a.equal(c._getFuturesMultiplier(sym),mult,sym);

c.commSettings.ratePerContract=0;
a.equal(c.tradeComm({qty:2,sym:'MNQZ6',pnl:10}),0,'a saved rate of 0 stays 0');
c.commSettings.ratePerContract=1.58;

const short={sym:'NQZ6',qty:1,dir:'short',sell:100,buy:90,stopLoss:105,pnl:200,commOverride:0};
a.equal(c._tradeR(short),2,'a short risks entry(sell)-stop: 200 / (5×20)');
const long={sym:'NQZ6',qty:1,dir:'long',buy:100,sell:90,stopLoss:95,pnl:-200,commOverride:0};
a.equal(c._tradeR(long),-2);
a.equal(c._tradeDir({buy:100,sell:110,stopLoss:115}),'short','stop above both fills');
a.equal(c._tradeDir({buy:100,sell:110,stopLoss:95}),'long','stop below both fills');
a.equal(c._tradeDir({buy:100,sell:110}),null,'no stop and no saved direction is unknown');

a.equal(c._recILS({currency:'ILS',amountILS:365,amount:100,rate:3.6}),365,'the original shekel amount wins');
a.equal(c._recILS({amount:100,rate:3.5}),350);
a.equal(c._recILS({amount:100}),300,'a missing rate falls back to the date rate');
c.records=[{type:'משיכה',date:'2026-10-01',amount:100,wdNet:0},{type:'הוצאה',date:'2026-10-01',amount:9}];
c.accounts=[{name:'A',withdrawals:[{date:'2026-10-02',amount:300,fee:15}]},{name:'B'}];
a.deepEqual(Array.from(c._wdRecords(),r=>r.wdNet),[0,285],'both withdrawal stores, a zero net stays zero');
console.log('Trade calculation checks passed');
