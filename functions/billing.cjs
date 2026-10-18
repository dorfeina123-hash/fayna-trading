'use strict';
const model = require('./plan-model.js');
const PLANS = Object.freeze(Object.keys(model.plans));
function snapshot(user, managed, now=Date.now()) {
  const access = model.entitlement(managed,user.plan,now);
  return {
    ...access,
    // Preserve the old API value for existing lifetime profiles; no legacy migration.
    plan: managed ? access.plan : user.plan || 'free',
    billingEnabled:false,
    serverNow:now,
    workspaceRevision:Number.isSafeInteger(user.td_workspaceRevision)?user.td_workspaceRevision:0,
    policyVersion:model.version,
    trialDays:model.trialDays,
    cancellationRequest:managed?.cancellationRequest || null,
    currentPeriodEnd:managed?.currentPeriodEnd?.toMillis?.() || (typeof managed?.currentPeriodEnd==='number'?managed.currentPeriodEnd:null),
  };
}
function validateAction(action) {
  if (!['status','requestCancellation','checkout','startTrial','saveWorkspace','getQuote'].includes(action)) throw new Error('invalid_action');
}
module.exports = { PLANS,snapshot,validateAction };
