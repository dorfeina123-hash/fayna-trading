/* No automatic restoration. Keep source copies and plan additive financial merges. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FaynaFinanceRecovery=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const SNAPSHOT_KEY='fayna_finance_recovery_v1';
 const OWNER_KEY='fayna_finance_cache_owner';
 const KEYS=['dor_records','dor_custom','dor_recurring','dor_bizEvents','dor_bizNotes'];
 function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
 function capture(storage,requestedByUid,reason,now=Date.now()){
  try{
   const values={};let nonempty=false;
   for(const key of KEYS){const raw=storage.getItem(key);if(raw!==null){values[key]=raw;try{const parsed=JSON.parse(raw);if(parsed&&Object.keys(parsed).length)nonempty=true;}catch{nonempty=true;}}}
   if(!nonempty)return true;
   const raw=storage.getItem(SNAPSHOT_KEY),old=raw?JSON.parse(raw):[];
   if(!Array.isArray(old))return false;
   const ownerUid=storage.getItem(OWNER_KEY)||null;
   if(old.some(x=>x.ownerUid===ownerUid&&JSON.stringify(x.values)===JSON.stringify(values)))return true;
   const entry={version:1,at:now,ownerUid,requestedByUid:requestedByUid||null,reason,values};
   // Retain the earliest copy plus two recent copies. Unknown ownership stays unknown.
   const next=old.length<3?[...old,entry]:[old[0],old[old.length-1],entry];
   storage.setItem(SNAPSHOT_KEY,JSON.stringify(next));return true;
  }catch{return false;}
 }
 function mergeRows(current,incoming,name){
  if(!Array.isArray(current)||!Array.isArray(incoming))throw Error('מערך לא תקין: '+name);
  const key=id=>(typeof id==='string'&&id.length>0)||(typeof id==='number'&&Number.isFinite(id));
  const existing=new Map(current.map(r=>[String(r.id),r])),ids=new Set(existing.keys()),seen=new Set(),out=current.slice(),changes=[];let added=0,identical=0,conflicts=0;
  for(const row of incoming){
   if(!row||typeof row!=='object'||Array.isArray(row)||!key(row.id))throw Error('רשומה ללא מזהה תקין: '+name);
   const id=String(row.id);if(seen.has(id))throw Error('מזהה כפול בגיבוי: '+name);seen.add(id);
   if(!ids.has(id)){out.push(row);ids.add(id);added++;changes.push({collection:name,id,status:'added',incoming:row});}
   else if(canonical(existing.get(id))===canonical(row))identical++;
   else{conflicts++;changes.push({collection:name,id,status:'conflict',incoming:row,current:existing.get(id)});}
  }
  return {rows:out,added,identical,conflicts,changes};
 }
 function plan(current,data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('גיבוי לא תקין');
  const original=!data.kind&&(Array.isArray(data.records)||Array.isArray(data.customExpenses));
  if(!original&&(data.kind!=='fayna-finance'||![1,2].includes(data.version)))throw Error('זה אינו גיבוי כספים מתאים');
  const result={},added={},summary={},changes=[];
  for(const name of ['businessEvents','records','customExpenses','recurringTemplates']){
   const incoming=data[name]===undefined?[]:data[name];
   if(!Array.isArray(incoming))throw Error('מערך לא תקין: '+name);
   for(const row of incoming){
    if(!row||typeof row!=='object')throw Error('רשומה לא תקינה: '+name);
    if(name==='businessEvents'){
     if(typeof row.type!=='string'||typeof row.date!=='string'||(['income','expense'].includes(row.type)&&(!Number.isFinite(row.amount)||row.amount<0)))throw Error('תנועה לא תקינה');
    }else{
     if(!Number.isFinite(row.amount)||row.amount<0||(name!=='recurringTemplates'&&!/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')))throw Error('תאריך או סכום לא תקינים: '+name);
    }
   }
   const merged=mergeRows(current[name]||[],incoming,name);result[name]=merged.rows;added[name]=merged.added;summary[name]={current:(current[name]||[]).length,incoming:incoming.length,added:merged.added,identical:merged.identical,conflicts:merged.conflicts};changes.push(...merged.changes);
  }
  if(data.businessNotes!==undefined&&(!data.businessNotes||typeof data.businessNotes!=='object'||Array.isArray(data.businessNotes)||Object.values(data.businessNotes).some(v=>typeof v!=='string')))throw Error('הערות לא תקינות');
  result.businessNotes={...(data.businessNotes||{}),...(current.businessNotes||{})};
  let notesAdded=0,notesConflicts=0;for(const [key,value] of Object.entries(data.businessNotes||{})){if(!Object.hasOwn(current.businessNotes||{},key))notesAdded++;else if(current.businessNotes[key]!==value)notesConflicts++;}
  return {fingerprint:canonical({records:current.records||[],customExpenses:current.customExpenses||[],recurringTemplates:current.recurringTemplates||[],businessEvents:current.businessEvents||[],businessNotes:current.businessNotes||{}}),data:result,added,summary,changes,notesAdded,notesConflicts,totalAdded:Object.values(added).reduce((a,b)=>a+b,0)};
 }
 function backup(state,now=new Date().toISOString()){
  return {kind:'fayna-finance',version:2,records:state.records,customExpenses:state.customExpenses,recurringTemplates:state.recurringTemplates,businessEvents:state.businessEvents,businessNotes:state.businessNotes,exported:now};
 }
 function ownedCopies(storage,uid){
  if(typeof uid!=='string'||!uid)return [];
  const raw=storage.getItem(SNAPSHOT_KEY),rows=raw?JSON.parse(raw):[];if(!Array.isArray(rows))throw Error('עותקי ההגנה אינם תקינים');
  return rows.filter(row=>row&&row.version===1&&row.ownerUid===uid&&row.values&&Number.isFinite(row.at)).map(row=>{
   const read=(key,fallback)=>row.values[key]===undefined?fallback:JSON.parse(row.values[key]);
   const data={records:read('dor_records',[]),customExpenses:read('dor_custom',[]),recurringTemplates:read('dor_recurring',[]),businessEvents:read('dor_bizEvents',[]),businessNotes:read('dor_bizNotes',{})};
   return {at:row.at,backup:backup(data,new Date(row.at).toISOString())};
  });
 }
 return Object.freeze({SNAPSHOT_KEY,OWNER_KEY,capture,plan,backup,canonical,ownedCopies});
});
