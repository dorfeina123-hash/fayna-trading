const test=require('node:test'),assert=require('node:assert/strict'),{fetchUsdRate,makeQuote}=require('./fx.cjs');
test('server quote converts approved USD prices to ILS minor units with exact rounding',()=>{
 const now=Date.parse('2026-10-18T10:00:00Z'),fx={rateMillionths:3089000,publishedAt:now-86400000,source:'Bank of Israel'};
 const one=makeQuote('single',1490,fx,now),unlimited=makeQuote('unlimited',2490,fx,now);
 assert.equal(one.settlementMinor,4603);assert.equal(unlimited.settlementMinor,7692);
 assert.equal(one.displayMinor,1490);assert.equal(one.settlementCurrency,'ILS');assert.equal(one.billingEnabled,false);
 assert.equal(one.expiresAt-now,600000);
});
test('missing, stale and future FX quotes fail closed instead of guessing rates',async()=>{
 const now=Date.now(),response=usd=>async()=>({ok:true,json:async()=>({exchangeRates:usd?[usd]:[]})});
 for(const row of [null,{key:'USD',currentExchangeRate:0,lastUpdate:new Date(now).toISOString()},{key:'USD',currentExchangeRate:3,lastUpdate:new Date(now-8*86400000).toISOString()},{key:'USD',currentExchangeRate:3,lastUpdate:new Date(now+3600000).toISOString()}])await assert.rejects(fetchUsdRate(response(row),now),/fx_unavailable/);
 const r=await fetchUsdRate(response({key:'USD',currentExchangeRate:3.089,lastUpdate:new Date(now-86400000).toISOString()}),now);assert.equal(r.rateMillionths,3089000);
 await assert.rejects(fetchUsdRate(async()=>({ok:false}),now),/fx_unavailable/);
});
