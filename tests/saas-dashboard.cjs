const a=require('node:assert/strict'),{summary}=require('../saas-dashboard.js');
const source=[{date:'2026-10-01',sym:'NQ',pnl:100},{date:'2026-10-01',sym:'NQ',pnl:-40},{date:'2026-10-02',sym:'ES',pnl:NaN}];
const before=JSON.stringify(source),r=summary(source,t=>t.pnl);
a.equal(r.factor,2.5);a.equal(r.days['2026-10-01'].length,2);a.equal(r.days['2026-10-02'],undefined);a.equal(JSON.stringify(source),before);
a.equal(summary([],t=>t.pnl).factor,null);a.equal(summary([{date:'2026-10-01',pnl:10}],t=>t.pnl).factor,null);
console.log('Dashboard source data, empty state, missing PnL and profit factor checks passed.');
