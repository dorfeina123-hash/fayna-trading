const assert = require('node:assert/strict');
const {parseAny, workbookText, dedupe} = require('../fayna-import.js')._core;
const headers = ['Account','Instrument','Open time','Open price','Open volume','Close time','Close price','Close volume','Price PnL','Profit (ticks)','PnL','Comment'];
const rows = [headers,
 ['TEST','MNQZ6@CME','2026-10-01 04:18:22',100,2,'2026-10-01 04:37:40',110,-2,10,40,40,'Long'],
 ['TEST','MNQZ6@CME','2026-10-06 17:29:30',110,-3,'2026-10-06 17:30:00',105,3,-5,-20,30,'Short'],
 ['TEST','MNQZ6@CME','2026-10-06 18:00:00',100,1,'2026-10-06 18:01:00',100,-1,0,0,0,'Zero'],
 ['TEST','MNQZ6@CME','2026-10-06 19:00:00',100,1,'',0,0,0,0,'','Open']];
const fake = {utils:{sheet_to_json:s=>s,sheet_to_csv:()=> 'fallback'},SSF:{parse_date_code:()=>({y:2026,m:10,d:6,H:17,M:29,S:30})}};
const book={SheetNames:['Statistics','Journal','Executions'],Sheets:{Statistics:[['Name','Total'],['Total trades',3]],Journal:rows,Executions:[]}};
const result=parseAny(workbookText(book,fake),'auto');
assert.equal(result.format,'atas');assert.equal(result.trades.length,3);assert.equal(result.warnings.length,1);
assert.deepEqual(result.trades.map(t=>[t.qty,t.buy,t.sell,t.pnl,t.dir]),[[2,100,110,40,'long'],[3,105,110,30,'short'],[1,100,100,0,'long']]);
assert.equal(result.trades[0].date,'2026-10-01');assert.equal(result.trades[0].btime,'04:18:22');
assert.equal(result.trades[1].dur,'30s');assert.equal(result.trades[0].sourceAccount,'TEST');
assert.equal(dedupe([...result.trades,...result.trades]).fresh.length,3);
const numeric=structuredClone(book);numeric.Sheets.Journal[1][2]=46201.5;
assert.match(workbookText(numeric,fake),/2026-10-06 17:29:30/);
assert.equal(workbookText({SheetNames:['Other'],Sheets:{Other:[['Symbol','Date']]}},fake),'fallback');
console.log('ATAS import regression checks passed');
