/* Currency is a display choice, never a filter or a mutation of saved ledger records. */
(function(){
'use strict';
function convertedRows(rows,target,rateOf,inPeriod){
 if(!['USD','ILS'].includes(target))throw new Error('Unsupported display currency');
 return rows.filter(e=>inPeriod(e.date)).flatMap(e=>{
  const source=e.currency||'USD',amount=Number(e.amount);
  if(!['USD','ILS'].includes(source)||!Number.isFinite(amount))return [];
  let rate=Number(e.rate);if(!Number.isFinite(rate)||rate<=0)rate=Number(rateOf(String(e.date||'')));
  if(source!==target&&(!Number.isFinite(rate)||rate<=0))return [];
  const convert=n=>Math.round((source===target?n:source==='USD'?n*rate:n/rate)*100)/100;
  const result={...e,amount:convert(amount),currency:target,sourceAmount:amount,sourceCurrency:source};
  if(e.net!=null&&Number.isFinite(Number(e.net)))result.net=convert(Number(e.net));
  return [result];
 });
}
if(typeof window!=='undefined'){
 window.financePeriodRows=function(){return convertedRows(financeRows(),financeCurrency,histRate,financeInPeriod);};
 const render=window.financeRender;
 window.financeRender=function(){
  render();
  const panel=document.getElementById('tp-biz');if(!panel)return;
  let note=panel.querySelector('[data-currency-disclosure]');
  if(!note){note=document.createElement('p');note.dataset.currencyDisclosure='';note.className='ws-muted';note.setAttribute('role','note');panel.append(note);}
  note.textContent='כל התנועות מוצגות ב'+(financeCurrency==='ILS'?'שקל':'דולר')+'. ההמרה לצורכי תצוגה בלבד: לפי שער שמור ברשומה, ובהיעדרו לפי השער ההיסטורי המשוער במערכת. זה אינו שער חי. הסכום והמטבע המקוריים נשמרים ללא שינוי.';
 };
}
if(typeof module!=='undefined')module.exports={convertedRows};
})();
