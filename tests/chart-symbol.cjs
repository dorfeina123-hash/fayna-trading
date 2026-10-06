const fs=require('fs'),vm=require('vm'),a=require('assert/strict');
const h=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const s=h.slice(h.indexOf('function _tradeChartSymbol('),h.indexOf('function _loadTradingViewChart('));
const c={};vm.createContext(c);vm.runInContext(s,c);
for(const [i,d,o] of [['MNQZ6@CME','2026-10-01','CME_MINI:MNQZ2026'],['MNQH0@CME','2029-12-10','CME_MINI:MNQH2030'],['MNQZ26','2026-01-01','CME_MINI:MNQZ2026'],['MNQ','','CME_MINI:MNQ1!'],['NASDAQ:AAPL','','NASDAQ:AAPL'],['BTCUSDT','','BTCUSDT']])a.equal(c._tradeChartSymbol(i,d),o);
for(const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|ld\+json/.test(m[1]))new vm.Script(m[2]);
console.log('Symbol mapping and inline syntax checks passed');
