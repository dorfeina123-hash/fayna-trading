/* No automatic restoration. Keep source copies and plan additive financial merges. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FaynaFinanceRecovery=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const SNAPSHOT_KEY='fayna_finance_recovery_v1';
 const OWNER_KEY='fayna_finance_cache_owner';
 const KEYS=['dor_records','dor_custom','dor_recurring','dor_bizEvents','dor_bizNotes'];
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
  const ids=new Set(current.map(r=>String(r.id))),seen=new Set(),out=current.slice();let added=0;
  for(const row of incoming){
   if(!row||typeof row!=='object'||Array.isArray(row)||!key(row.id))throw Error('רשומה ללא מזהה תקין: '+name);
   const id=String(row.id);if(seen.has(id))throw Error('מזהה כפול בגיבוי: '+name);seen.add(id);
   if(!ids.has(id)){out.push(row);ids.add(id);added++;}
  }
  return {rows:out,added};
 }
 function plan(current,data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('גיבוי לא תקין');
  const original=!data.kind&&(Array.isArray(data.records)||Array.isArray(data.customExpenses));
  if(!original&&(data.kind!=='fayna-finance'||![1,2].includes(data.version)))throw Error('זה אינו גיבוי כספים מתאים');
  const result={},added={};
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
   const merged=mergeRows(current[name]||[],incoming,name);result[name]=merged.rows;added[name]=merged.added;
  }
  if(data.businessNotes!==undefined&&(!data.businessNotes||typeof data.businessNotes!=='object'||Array.isArray(data.businessNotes)||Object.values(data.businessNotes).some(v=>typeof v!=='string')))throw Error('הערות לא תקינות');
  result.businessNotes={...(data.businessNotes||{}),...(current.businessNotes||{})};
  return {data:result,added,totalAdded:Object.values(added).reduce((a,b)=>a+b,0)};
 }
 function backup(state,now=new Date().toISOString()){
  return {kind:'fayna-finance',version:2,records:state.records,customExpenses:state.customExpenses,recurringTemplates:state.recurringTemplates,businessEvents:state.businessEvents,businessNotes:state.businessNotes,exported:now};
 }
 return Object.freeze({SNAPSHOT_KEY,OWNER_KEY,capture,plan,backup});
});
