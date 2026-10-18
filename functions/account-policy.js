/* Account ownership and eligibility policy, shared by browser and trusted server. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FaynaAccountPolicy=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function error(code){const e=new Error(code);e.code=code;throw e;}
 function active(accounts){return accounts.filter(a=>a && a.active!==false && a.archived!==true);}
 function target(accounts,requested,selected){
  const available=active(accounts);
  if(requested){if(!available.some(a=>a.id===requested))error('invalid_trade_account');return requested;}
  const candidates=(selected||[]).filter(id=>id!=='__all__' && available.some(a=>a.id===id));
  if(candidates.length===1)return candidates[0];
  if(available.length===1)return available[0].id;
  error(available.length?'choose_trade_account':'create_trade_account');
 }
 // Preserve exact historical exceptions only. Copying an unassigned record is not a valid new trade.
 function canonical(v){
  if(v===null || typeof v==='string' || typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='number' && Number.isFinite(v))return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v && typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  error('invalid_workspace_value');
 }
 function validateWorkspace(previous,next,capacity){
  if(!Array.isArray(next.td_accounts)||!Array.isArray(next.td_tradesList))error('invalid_workspace');
  const ids=new Set();
  for(const a of next.td_accounts){if(!a || typeof a.id!=='string'||!a.id||a.id==='__all__'||a.id.length>150||ids.has(a.id))error('invalid_account_id');ids.add(a.id);}
  const priorAccounts=previous.td_accounts||[],currentActive=active(next.td_accounts),priorActive=active(priorAccounts);
  const priorById=new Map(priorAccounts.map(a=>[a.id,a]));
  if(capacity!==null && currentActive.length>capacity){
   // Existing excess accounts remain readable; only their unchanged content can be retained.
   for(const a of currentActive)if(!priorById.has(a.id)||priorById.get(a.id).active===false||priorById.get(a.id).archived===true)error('account_limit');
   if(currentActive.length>priorActive.length)error('account_limit');
  }
  const unchanged=new Map();
  for(const t of previous.td_tradesList||[]){const key=canonical(t);unchanged.set(key,(unchanged.get(key)||0)+1);}
  const priorRefs=new Set((previous.td_tradesList||[]).map(t=>t?.acct).filter(Boolean));
  for(const id of priorRefs)if(priorById.has(id)&&!ids.has(id))error('account_has_trades');
  const allowedIds=new Set(currentActive.map(a=>a.id));
  if(capacity!==null && currentActive.length>capacity)allowedIds.clear(); // select/archive down to quota before new trading
  for(const t of next.td_tradesList){
   if(!t||typeof t!=='object'||Array.isArray(t))error('invalid_trade');
   const key=canonical(t),count=unchanged.get(key)||0;
   if(count){unchanged.set(key,count-1);continue;}
   if(typeof t.acct!=='string'||!ids.has(t.acct))error('trade_account_required');
   if(!allowedIds.has(t.acct))error('trade_account_read_only');
  }
  return next;
 }
 return Object.freeze({active,target,canonical,validateWorkspace});
});
