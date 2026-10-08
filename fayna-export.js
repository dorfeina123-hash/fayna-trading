(function(){
'use strict';
function csv(rows){
  const cell=v=>{let s=String(v??'');if(typeof v!=='number'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
}
function tradeRows(list,accounts,commission,net){
 return [['תאריך','שעת כניסה','שעת יציאה','תיק','מספר חשבון','סימול','כמות','מחיר קנייה','מחיר מכירה','רווח גולמי USD','עמלה USD','רווח נטו USD','משך','אסטרטגיה','הערות'],...list.map(t=>{
  const a=accounts.find(a=>a.id===t.acct)||{};
  return [t.date,t.btime,t.stime,a.name,a.number,t.sym,t.qty,t.buy,t.sell,t.pnl,commission(t),net(t),t.dur,t.strategy,t.notes];
 })];
}
function financeData(d){return {businessEvents:d.businessEvents,businessNotes:d.businessNotes,records:d.records,customExpenses:d.customExpenses,recurringTemplates:d.recurringTemplates,accountWithdrawals:d.accounts.map(a=>({id:a.id,name:a.name,withdrawals:a.withdrawals||[]}))};}
function packageData(d,kind){return {kind:kind==='finance'?'fayna-finance-export':'fayna-data-export',version:1,exportedAt:new Date().toISOString(),finance:financeData(d),...(kind==='all'?{trading:{tradesList:d.tradesList,accounts:d.accounts,commSettings:d.commSettings,customSymbols:d.customSymbols},pnlOn:d.pnlOn}:{})};}
function open(d,api){
 document.getElementById('fayna-export-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='fayna-export-dialog';dialog.dir='rtl';
 dialog.style.cssText='width:min(560px,90vw);max-height:85vh;overflow:auto;padding:24px;border-radius:16px;border:1px solid var(--border2);background:var(--bg2);color:var(--t1);font-family:inherit';
 dialog.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><h2>ייצוא נתונים</h2><button type="button" class="bn" id="data-export-close">סגירה</button></div>
 <p>CSV נפתח ב־Excel. קובצי JSON שומרים את הנתונים המפורטים, כולל רשומות ישנות וארכיון.</p>
 <section><h3>עסקאות</h3><p id="export-trade-count"></p><button class="bn" data-export="trades">כל העסקאות · CSV</button> <button class="bn" data-export="selected">התיקים שנבחרו · CSV</button></section>
 <section><h3>ניהול כספי</h3><p>CSV כולל את התנועות בתקופה ובמטבע שמוצגים בניהול הכספי, כולל הוצאות ומשיכות מהמערכת הקודמת. JSON כולל את כל התקופות והמטבעות והרשומות המקוריות.</p><button class="bn" data-export="finance-csv">התקופה המוצגת · CSV</button> <button class="bn" data-export="finance">כל הנתונים הכספיים · JSON</button></section>
 <section><h3>מסחר וכספים יחד</h3><p>עותק מפורט של העסקאות, החשבונות, ההוצאות, המשיכות וההגדרות הכלולות בהם. הקובץ מיועד לשמירת עותק ולעיבוד נתונים; אינו קובץ לשחזור אוטומטי.</p><button class="btn-p" data-export="all">הורדת עותק מלא · JSON</button></section><p role="status" id="data-export-status"></p>`;
 dialog.querySelector('#export-trade-count').textContent=d.tradesList.length+' עסקאות בכל התיקים · '+d.selectedTrades.length+' בתיקים שנבחרו. הייצוא כולל את כל התאריכים בתיקים אלה.';
 dialog.querySelector('#data-export-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
 dialog.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>{
  const kind=b.dataset.export,status=dialog.querySelector('#data-export-status');
  const feature=['all','finance'].includes(kind)?'backup':'export_csv';
  if(!api.allowed(feature)){dialog.close();api.upgrade(feature);return;}
  try{
   if(kind==='finance-csv'){api.financeCSV();return;}
   const date=new Date().toISOString().slice(0,10);
   if(kind==='trades'||kind==='selected'){
    const list=kind==='trades'?d.tradesList:d.selectedTrades;
    if(!list.length){status.textContent='אין עסקאות לייצוא בטווח שנבחר.';return;}
    api.download('fayna-trades-'+kind+'-'+date+'.csv',csv(tradeRows(list,d.accounts,api.commission,api.net)),'text/csv;charset=utf-8');
   }else api.download('fayna-'+kind+'-export-'+date+'.json',JSON.stringify(packageData(d,kind),null,2),'application/json');
   status.textContent='הקובץ הוכן ונשלח להורדה.';
  }catch(e){status.textContent='לא ניתן לייצא את הנתונים: '+e.message;}
 });
 document.body.appendChild(dialog);dialog.showModal();
}
if(typeof window!=='undefined')window.FaynaExport={open};
if(typeof module!=='undefined')module.exports={csv,tradeRows,financeData,packageData};
})();
