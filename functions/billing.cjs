'use strict';
// No provider SDK, secret, checkout URL, or activation switch exists in this release.
const PLANS = Object.freeze(['free', 'basic', 'pro', 'premium']);
function snapshot(user, managed) {
  return {
    plan: managed?.plan || user.plan || 'free',
    source: managed ? 'managed' : 'legacy',
    status: managed?.status || 'legacy_preserved',
    billingEnabled: false,
    cancellationRequest: managed?.cancellationRequest || null,
    // Legacy dates are informational; no migration or access mutation is performed.
    currentPeriodEnd: managed?.currentPeriodEnd?.toMillis?.() || null,
  };
}
function validateAction(action) {
  if (!['status', 'requestCancellation', 'checkout'].includes(action)) {
    throw new Error('invalid_action');
  }
}
module.exports = { PLANS, snapshot, validateAction };
