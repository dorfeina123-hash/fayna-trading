/* Read-only inventory and explicit preview. No network, storage writes or automatic restore. */
(()=>{
 'use strict';
 const labels={records:'יומן הוצאות מקורי',customExpenses:'הוצאות חופשיות',businessEvents:'תנועות ידניות',recurringTemplates:'הוצאות חוזרות'};
 let pending=null;
 const owners=new WeakMap();
 function identity(){return typeof currentUser!=='undefined'&&currentUser?.uid&&currentUser.status!=='blocked'&&typeof _cloudReadyUid!=='undefined'&&_cloudReadyUid===currentUser.uid&&typeof auth!=='undefined'&&auth.currentUser?.uid===currentUser.uid?currentUser.uid:null;}
 function state(){return {records,customExpenses,recurringTemplates,businessEvents,businessNotes};}
 function text(tag,value,cls){const el=document.createElement(tag);el.textContent=String(value);if(cls)el.className=cls;return el;}
 function dialog(id,title){let el=document.getElementById(id);if(!el){el=document.createElement('dialog');el.id=id;el.className='ws-dialog fy-recovery-dialog';el.setAttribute('aria-labelledby',id+'-title');document.body.append(el);}el.replaceChildren();const head=document.createElement('div');head.className='ws-panel-title';const h=text('h2',title);h.id=id+'-title';head.append(h);const close=text('button','סגירה','bn');close.type='button';close.addEventListener('click',()=>el.close());head.append(close);el.append(head);return el;}
 function table(headings,rows){const wrap=document.createElement('div');wrap.className='fy-recovery-table';const t=document.createElement('table');const thead=document.createElement('thead'),tr=document.createElement('tr');headings.forEach(h=>tr.append(text('th',h)));thead.append(tr);t.append(thead);const body=document.createElement('tbody');rows.forEach(values=>{const row=document.createElement('tr');values.forEach(v=>row.append(text('td',v)));body.append(row);});t.append(body);wrap.append(t);return wrap;}
 function button(label,handler){const b=text('button',label,'bn');b.type='button';b.addEventListener('click',handler);return b;}
 function center(){
  const uid=identity();if(!uid){showToast('יש להמתין לסיום טעינת החשבון לפני בדיקת הנתונים.','error');return;}
  const box=dialog('finance-recovery-center','בדיקת הוצאות ושחזור');
  owners.set(box,uid);
  box.append(text('p','הבדיקה אינה משנה נתונים. רשומות יכולות להיות מוסתרות בגלל תקופה, חיפוש או ארכיון.','ws-muted'));
  box.append(table(['מקור','רשומות שמורות','טווח תאריכים'],Object.entries(labels).map(([key,label])=>{const list=state()[key],dates=list.map(x=>x.date||x.startDate).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')).sort();return [label,list.length,dates.length?dates[0]+' — '+dates[dates.length-1]:'—'];})));
  const controls=document.createElement('div');controls.className='ws-toolbar';controls.append(button('הצגת כל התקופות',()=>{box.close();financeShowAll();}),button('גיבוי המצב הנוכחי',()=>workspaceBackup('finance')));
  const upload=document.createElement('label');upload.className='bn';upload.append(text('span','בדיקת קובץ גיבוי'));const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','בחירת גיבוי כספי לבדיקה');input.addEventListener('change',()=>workspaceRestore(input,'finance'));upload.append(input);controls.append(upload);box.append(controls);
  box.append(text('h3','עותקי הגנה במכשיר הזה'));
  box.append(text('p','מוצגים רק עותקים המשויכים לחשבון המחובר. עותקים ללא שיוך או של חשבון אחר אינם מוצגים. אלה עותקי מכשיר, ולא גיבוי ענן היסטורי.','ws-muted'));
  try{
   const copies=FaynaFinanceRecovery.ownedCopies(localStorage,uid);
   if(!copies.length)box.append(text('p','לא נמצאו במכשיר הזה עותקים המשויכים לחשבון. אפשר לבדוק קובץ גיבוי או את המכשיר המקורי.'));
   copies.forEach(copy=>{const row=document.createElement('div');row.className='fy-recovery-copy';row.append(text('span',new Intl.DateTimeFormat('he-IL',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jerusalem'}).format(copy.at)));row.append(button('בדיקת העותק',async()=>{if(identity()!==uid){showToast('החשבון השתנה. יש לפתוח את הבדיקה מחדש.','error');return;}const content=JSON.stringify(copy.backup);const file=new File([content],'finance-device-copy.json',{type:'application/json'});await workspaceRestore({files:[file],value:''},'finance');}));box.append(row);});
  }catch{box.append(text('p','לא ניתן לקרוא את עותקי ההגנה. הנתונים המקוריים לא השתנו.','text-destructive'));}
  box.showModal();
 }
 function review(data){
  const uid=identity();if(!uid)return Promise.reject(Error('יש להמתין לסיום טעינת החשבון לפני שחזור'));
  if(pending)return Promise.reject(Error('יש לסיים או לבטל את בדיקת הגיבוי הקודמת'));
  const baseline=FaynaFinanceRecovery.canonical(state()),plan=FaynaFinanceRecovery.plan(state(),data);
  const box=dialog('finance-recovery-preview','בדיקת גיבוי לפני שחזור');
  owners.set(box,uid);
  box.append(text('p','יש לוודא שהגיבוי שייך לחשבון: '+(currentUser.email||currentUser.name||'החשבון המחובר'),'ws-muted'));
  box.append(text('p',`${plan.totalAdded} רשומות חסרות ו־${plan.notesAdded} הערות יתווספו. רשומות קיימות לא יוחלפו. לפני המיזוג יורד גיבוי של המצב הנוכחי.`));
  const identical=Object.values(plan.summary).reduce((n,v)=>n+v.identical,0),conflicts=Object.values(plan.summary).reduce((n,v)=>n+v.conflicts,0);
  box.append(text('p',`${identical} רשומות זהות ידולגו. ${conflicts} רשומות שונות עם מזהה קיים יישארו ללא שינוי.`,'ws-muted'));
  box.append(text('p','ההתאמה נעשית לפי מזהה הרשומה בגיבוי. הוצאות עם מזהים שונים לא מאוחדות אוטומטית.','ws-muted'));
  box.append(table(['מקור','קיימות','בגיבוי','להוספה','זהות','התנגשויות'],Object.entries(plan.summary).map(([key,v])=>[labels[key],v.current,v.incoming,v.added,v.identical,v.conflicts])));
  if(plan.notesConflicts)box.append(text('p',`${plan.notesConflicts} הערות שונות באותו מזהה: ההערות הקיימות יישמרו.`));
  const changes=plan.changes.slice(0,40);
  if(changes.length){box.append(text('h3','הרשומות לבדיקה'));box.append(table(['מקור / מזהה','תאריך / תיאור','סכום קיים','סכום בגיבוי','תוצאה'],changes.map(x=>[labels[x.collection]+' / '+x.id,(x.incoming.date||x.incoming.startDate||'—')+' · '+(x.incoming.desc||x.incoming.note||x.incoming.company||x.incoming.type||''),x.current?.amount??'—',x.incoming.amount??'—',x.status==='added'?'תתווסף':'הקיימת תישמר'])));if(plan.changes.length>40)box.append(text('p','מוצגות 40 הרשומות הראשונות; הסיכום כולל את כולן.','ws-muted'));box.append(text('p','הסכומים מוצגים כפי שנשמרו, לפני המרה. שינוי ברשומה קיימת לא יחליף אותה.','ws-muted'));}
  const status=text('p','','ws-muted');status.setAttribute('role','status');box.append(status);
  return new Promise(resolve=>{
   let result=null;pending={uid,box};
   const controls=document.createElement('div');controls.className='ws-toolbar';
   const apply=button('יצירת גיבוי ומיזוג הרשומות החסרות',()=>{
    if(identity()!==uid){status.textContent='החשבון או מצב הטעינה השתנו. יש לבטל ולפתוח את הבדיקה מחדש.';apply.disabled=true;return;}
    if(FaynaFinanceRecovery.canonical(state())!==baseline){status.textContent='הנתונים השתנו מאז פתיחת הבדיקה. יש לבטל ולבדוק את הגיבוי מחדש.';apply.disabled=true;return;}
    result=plan;box.close();
   });apply.disabled=plan.totalAdded===0&&plan.notesAdded===0;controls.append(apply,button('ביטול',()=>box.close()));box.append(controls);
   box.addEventListener('close',()=>{pending=null;resolve(result);},{once:true});box.showModal();
  });
 }
 window.FaynaFinanceRecoveryUI=Object.freeze({center,review});
 if(typeof auth!=='undefined'&&typeof auth.onAuthStateChanged==='function')auth.onAuthStateChanged(user=>{
  for(const id of ['finance-recovery-center','finance-recovery-preview']){const box=document.getElementById(id);if(box&&owners.has(box)&&owners.get(box)!==user?.uid){if(box.open)box.close();box.replaceChildren();owners.delete(box);}}
 });
})();
