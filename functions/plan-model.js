/* Shared draft catalog: browser preview and server eligibility use the same policy.
   Prices are proposals only; this file cannot enable payment or migrate a user. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FaynaPlanModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = '2026-10-18-draft-1';
  const DAY_MS = 86400000;
  const common = { export_csv:true, backup:true };
  const freeFeatures = { ...common, calendar:false, stats_advanced:false, import_csv:true, export_pdf:false, reports:false, multi_accounts:false, drivers:false };
  const basicFeatures = { ...freeFeatures, calendar:true, multi_accounts:true };
  const proFeatures = { ...basicFeatures, stats_advanced:true, reports:true, drivers:true };
  const plans = {
    free: { label:'חינם', monthlyAgorot:0, yearlyAgorot:0, accounts:1, newTradesPerMonth:30, features:freeFeatures, audience:'להתחלת הרגל התיעוד' },
    basic: { label:'בסיסי', monthlyAgorot:4900, yearlyAgorot:49000, accounts:3, newTradesPerMonth:500, features:basicFeatures, audience:'לסוחר שרוצה יומן מסודר' },
    pro: { label:'Pro', monthlyAgorot:8900, yearlyAgorot:89000, accounts:10, newTradesPerMonth:5000, features:proFeatures, audience:'לסוחר פעיל ולניהול מספר חשבונות' },
    premium: { label:'פרימיום', monthlyAgorot:14900, yearlyAgorot:149000, accounts:25, newTradesPerMonth:20000, features:{ ...proFeatures, export_pdf:true }, audience:'לסוחר עם פעילות רחבה וחשבונות רבים' },
  };
  function deepFreeze(o) { Object.values(o).forEach(v=>{if(v && typeof v==='object')deepFreeze(v);}); return Object.freeze(o); }
  deepFreeze(plans);
  function millis(value) {
    const n = value?.toMillis ? value.toMillis() : typeof value==='number' ? value : NaN;
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  function normalize(plan) { return plan === 'lifetime' ? 'premium' : Object.hasOwn(plans,plan) ? plan : 'free'; }
  // All dates must be supplied by trusted server records. No client clock/registration claims.
  function entitlement(managed, legacyPlan, now) {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error('invalid_server_time');
    if (!managed) return { plan:normalize(legacyPlan), source:'legacy', status:'legacy_preserved', trialEndsAt:null, trialDaysRemaining:0 };
    if (managed.status === 'trialing') {
      const start=millis(managed.trialStartedAt), end=millis(managed.trialEndsAt);
      const valid = start !== null && end === start + 14*DAY_MS && start <= now;
      if (!valid) return {plan:'free',source:'managed',status:'invalid_trial',trialEndsAt:null,trialDaysRemaining:0};
      const active = now < end;
      return {plan:active?'pro':'free',source:'managed',status:active?'trialing':'trial_expired',trialEndsAt:end,trialDaysRemaining:active?Math.ceil((end-now)/DAY_MS):0};
    }
    const end=millis(managed.currentPeriodEnd);
    const active = ['active','cancel_at_period_end'].includes(managed.status) && end !== null && now < end;
    return {plan:active?normalize(managed.plan):'free',source:'managed',status:active?managed.status:'free',trialEndsAt:null,trialDaysRemaining:0};
  }
  function trialRecord(now) {
    if (!Number.isSafeInteger(now) || now<=0) throw new Error('invalid_server_time');
    return {plan:'pro',status:'trialing',policyVersion:VERSION,trialStartedAt:now,trialEndsAt:now+14*DAY_MS,autoRenew:false};
  }
  function price(plan,cycle) {
    if (!Object.hasOwn(plans,plan) || !['monthly','yearly'].includes(cycle)) throw new Error('invalid_price_selection');
    return plans[plan][cycle==='yearly'?'yearlyAgorot':'monthlyAgorot'];
  }
  return Object.freeze({version:VERSION,currency:'ILS',pricesApproved:false,trialDays:14,trialPlan:'pro',trialRequiresCard:false,autoChargeAfterTrial:false,plans,normalize,entitlement,trialRecord,price});
});
