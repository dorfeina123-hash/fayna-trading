'use strict';
const RATE_URL='https://boi.org.il/PublicApi/GetExchangeRates';
async function fetchUsdRate(fetcher=fetch,now=Date.now()) {
 const r=await fetcher(RATE_URL,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000),redirect:'error'});
 if(!r.ok)throw new Error('fx_unavailable');
 const data=await r.json();
 const usd=data?.exchangeRates?.find(x=>x.key==='USD');
 const rate=Number(usd?.currentExchangeRate),publishedAt=Date.parse(usd?.lastUpdate);
 if(!Number.isFinite(rate)||rate<=0||rate>100||!Number.isFinite(publishedAt)||publishedAt>now+300000||now-publishedAt>7*86400000)throw new Error('fx_unavailable');
 return {rateMillionths:Math.round(rate*1000000),publishedAt,source:'Bank of Israel',sourceUrl:RATE_URL};
}
function makeQuote(plan,usdMinor,fx,now){
 if(!Number.isSafeInteger(usdMinor)||usdMinor<=0||!Number.isSafeInteger(fx.rateMillionths)||fx.rateMillionths<=0||!Number.isSafeInteger(now))throw new Error('invalid_quote');
 const settlementMinor=Number((BigInt(usdMinor)*BigInt(fx.rateMillionths)+500000n)/1000000n);
 if(!Number.isSafeInteger(settlementMinor)||settlementMinor<=0)throw new Error('invalid_quote');
 return {plan,cycle:'monthly',displayCurrency:'USD',displayMinor:usdMinor,settlementCurrency:'ILS',settlementMinor,fxRateMillionths:fx.rateMillionths,fxPublishedAt:fx.publishedAt,fxSource:fx.source,createdAt:now,expiresAt:now+10*60000,billingEnabled:false};
}
module.exports={fetchUsdRate,makeQuote};
