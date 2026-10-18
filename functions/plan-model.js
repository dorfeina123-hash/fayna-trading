/* Shared launch catalog: browser preview and server eligibility use the same policy.
   Monthly USD prices were chosen by the owner; this file cannot enable payment or migrate a user. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FaynaPlanModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = '2026-10-18-launch-monthly-1';
  const DAY_MS = 86400000;
  const common = { export_csv:true, backup:true };
  const freeFeatures = { ...common, calendar:false, stats_advanced:false, import_csv:true, export_pdf:false, reports:false, multi_accounts:false, drivers:false };
  const fullFeatures = { calendar:true, stats_advanced:true, import_csv:true, export_csv:true, export_pdf:true, reports:true, multi_accounts:true, drivers:true, backup:true };
  // null means no commercial cap; it survives JSON serialization without becoming zero.
  const plans = {
    free: { label:'חינם מוגבל', monthlyMinor:0, yearlyMinor:0, accounts:1, newTradesPerMonth:30, features:freeFeatures, audience:'מסלול המשך מוגבל לאחר הניסיון' },
    single: { label:'Fayna One', monthlyMinor:1490, yearlyMinor:null, accounts:1, newTradesPerMonth:null, features:fullFeatures, audience:'כל היכולות לחשבון מסחר אחד' },
    unlimited: { label:'Fayna Unlimited', monthlyMinor:2490, yearlyMinor:null, accounts:null, newTradesPerMonth:null, features:fullFeatures, audience:'כל היכולות לחשבונות מסחר ללא הגבלה' },
  };
  function deepFreeze(o) { Object.values(o).forEach(v=>{if(v && typeof v==='object')deepFreeze(v);}); return Object.freeze(o); }
  deepFreeze(plans);
  function millis(value) {
    const n = value?.toMillis ? value.toMillis() : typeof value==='number' ? value : NaN;
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  function normalize(plan) { const legacy={basic:'single',pro:'unlimited',premium:'unlimited',lifetime:'unlimited'}; return Object.hasOwn(plans,plan)?plan:Object.hasOwn(legacy,plan)?legacy[plan]:'free'; }
  // All dates must be supplied by trusted server records. No client clock/registration claims.
  function entitlement(managed, legacyPlan, now) {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error('invalid_server_time');
    if (!managed) return { plan:normalize(legacyPlan), source:'legacy', status:'legacy_preserved', trialEndsAt:null, trialDaysRemaining:0 };
    if (managed.status === 'trialing') {
      const start=millis(managed.trialStartedAt), end=millis(managed.trialEndsAt);
      const valid = start !== null && end === start + 14*DAY_MS && start <= now;
      if (!valid) return {plan:'free',source:'managed',status:'invalid_trial',trialEndsAt:null,trialDaysRemaining:0};
      const active = now < end;
      return {plan:active?'unlimited':'free',source:'managed',status:active?'trialing':'trial_expired',trialEndsAt:end,trialDaysRemaining:active?Math.ceil((end-now)/DAY_MS):0};
    }
    const end=millis(managed.currentPeriodEnd);
    const active = ['active','cancel_at_period_end'].includes(managed.status) && end !== null && now < end;
    return {plan:active?normalize(managed.plan):'free',source:'managed',status:active?managed.status:'free',trialEndsAt:null,trialDaysRemaining:0};
  }
  function trialRecord(now) {
    if (!Number.isSafeInteger(now) || now<=0) throw new Error('invalid_server_time');
    return {plan:'unlimited',status:'trialing',policyVersion:VERSION,trialStartedAt:now,trialEndsAt:now+14*DAY_MS,autoRenew:false};
  }
  function price(plan,cycle) {
    if (!Object.hasOwn(plans,plan) || !['monthly','yearly'].includes(cycle)) throw new Error('invalid_price_selection');
    const amount=plans[plan][cycle==='yearly'?'yearlyMinor':'monthlyMinor'];
    if (amount===null) throw new Error('billing_cycle_unavailable');
    return amount;
  }
  return Object.freeze({version:VERSION,merchantDisplayName:'Fayna Group',customerContactEmail:'dorfeina123@gmail.com',currency:'USD',pricesApproved:true,availableCycles:Object.freeze(['monthly']),trialDays:14,publicPlanIds:Object.freeze(['single','unlimited']),trialPlan:'unlimited',trialRequiresCard:false,autoChargeAfterTrial:false,plans,normalize,entitlement,trialRecord,price});
});
