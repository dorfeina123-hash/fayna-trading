"use strict";
// This service is intentionally separate from legacy registration until staging acceptance.
const model=require('./plan-model.js');
function fail(code){const e=new Error(code);e.code=code;throw e;}
function profileInput(data){
 if(!data || typeof data!=='object' || Array.isArray(data))fail('invalid_profile');
 if(Object.keys(data).some(k=>!['name','phone'].includes(k)))fail('untrusted_profile_field');
 const name=typeof data.name==='string'?data.name.trim():'';
 const phone=typeof data.phone==='string'?data.phone.trim():'';
 if(!name || name.length>120 || phone.length>40 || /[<>\x00-\x1f]/.test(name+phone))fail('invalid_profile');
 return {name,phone};
}
async function provision({db,uid,input,authRecord,now,timestamp}){
 const profile=profileInput(input);
 const email=authRecord.email?.trim().toLowerCase();
 if(!email || !authRecord.emailVerified || authRecord.disabled)fail('verified_email_required');
 if(!Number.isSafeInteger(now)||now<=0)fail('invalid_server_time');
 const userRef=db.doc(`users/${uid}`),subRef=db.doc(`subscriptions/${uid}`);
 const grantRef=db.doc(`trialGrants/${uid}`),inviteRef=db.doc(`invites/${email}`);
 return db.runTransaction(async tx=>{
  const [user,sub,grant,invite]=await Promise.all([tx.get(userRef),tx.get(subRef),tx.get(grantRef),tx.get(inviteRef)]);
  // Existing profile is never patched, downgraded or enrolled by this endpoint.
  if(user.exists)return {created:false,source:'existing_preserved'};
  if(sub.exists || grant.exists)fail('orphaned_entitlement');
  let plan='free',source='new_free';
  if(invite.exists){
   const value=invite.data();
   if(value.email?.toLowerCase()!==email || value.consumedBy || !['free','basic','pro','premium','lifetime','single','unlimited'].includes(value.plan))fail('invalid_invite');
   // Legacy invitations are explicit grants. They are not turned into expiring subscriptions.
   plan=value.plan;source='verified_invite';
  }
  tx.create(userRef,{...profile,email,plan,status:'active',isAdmin:false,
   registeredAt:timestamp,lastLogin:timestamp,loginCount:1,welcomeSent:false,
   provisioningVersion:1,provisioningSource:source});
  if(invite.exists)tx.update(inviteRef,{consumedBy:uid,consumedAt:timestamp});
  else tx.create(subRef,{plan:'free',status:'free',policyVersion:model.version,createdAt:now});
  return {created:true,source,plan};
 });
}
module.exports={profileInput,provision};
