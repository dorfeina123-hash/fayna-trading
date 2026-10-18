# Subscription foundation — development only

## Existing system inspected
- Static GitHub Pages app in index.html; versioned copies through v74. Auto promotion is disabled in the workflow. New v75 matches index.
- Firebase compat 10.12.2: Auth email/password + Google, Firestore profiles and td_* trading fields in users/{uid}. Legacy lifetime maps to premium in the UI.
- Existing registration defaults to Pro, supports invitations; subscriptionPlan defaults to free independently of plan. Neither is proof of a provider payment.
- Browser billing previously opened administrator-configured payment links; cancellation changed profile fields without contacting a provider. Two expiry paths and referral rewards wrote entitlements in the browser.
- Repository rules protect plan/status/admin/email on update but allowed expiry/payment metadata changes. This draft additionally protects these fields and adds server-owned collections.
- No live Firebase access, deployed rules export, Auth inventory, payment account, or user records were available or read. No production data was changed. Repository rules are not evidence of the deployed rules.

- Public GitHub Pages URL returned HTTP 200 and matched origin/main after newline normalization on 2026-10-18. This checks the served app shell, not authenticated Firebase behavior.

## Implemented
- Preserve existing profile plan and trading data; no live migration, trial assignment, charge or renewal has been performed. Managed trials resolve to Free at expiry without rewriting profile/trading data; legacy profiles retain their original rights.
- Hebrew RTL pricing and subscription management. Research-based shared draft catalog: 14-day Pro trial, Free and three paid tiers (49/89/149 ILS monthly; ten monthly payments for an annual term). Prices are clearly proposals. Existing legacy feature policy is preserved. All legacy payment entry points fail closed, including Bit/Paybox override.
- Firebase callable requiring Auth + App Check. Identity comes only from token uid. Status reads the user's own records. A repeated cancellation request uses one deterministic transactional document, does not alter access and is explicitly pending review.
- Checkout always fails; webhook always returns 503 and writes nothing. Checkout has no activation flag, provider SDK, secret or payment link. Trial enrollment has a separate disabled-by-default rollout gate; it cannot enable billing.
- subscriptions/{uid} is reserved for server-managed entitlements. subscriptionCancellationRequests/{uid} contains pending review requests; billingEvents and billingOperations reserved for verified events and idempotency.
- Server module imports successfully against installed Firebase dependencies. Lockfile included.

## Staging connection (not performed)
1. Use an isolated Firebase staging project; export and review its current rules before any deployment. Never infer a production project from client configuration.
2. Review signup/invite compatibility and legacy writers against tightened rules. Configure App Check and the Firebase Functions client SDK in staging. The browser adapter expects `window.faynaBillingCallable = firebase.functions().httpsCallable('billing')` after initialization. No SDK/endpoint is auto-connected in this release.
3. Deploy only to staging. Test real Auth, App Check rejection, cross-user denial, concurrent requests, and Firestore rules in the emulator and staging before merging. Local server tests use an in-memory transaction adapter; they do not prove deployed IAM/rules or platform token validation.
4. Inspect anonymized counts of legacy plans, status, expiry and lifetime grants with authorized Admin tooling. Retain a verified backup. Agree on a migration cutoff and exceptions; prepare a dry-run report before any writes.

## Trial model update — 2026-10-18
See [Hebrew research and business proposal](SUBSCRIPTION_MODEL_HE.md) and `functions/plan-model.js` (shared by browser and server).

- Exact 14 x 24 hour trial from explicit first activation after verified email. `startTrial` requires `FAYNA_TRIALS_ENABLED=true`, a valid `FAYNA_TRIAL_COHORT_START`, and a trusted `fayna_trial_eligible=true` Auth custom claim. Cohort age is checked using Admin Auth creation metadata, not client profile timestamps. Default is disabled. Do not set production values yet.
- An authorized server provisioning workflow must assign eligibility only after resolving invitations and legacy grants; it is not implemented here. Lifetime/premium/admin/dated legacy rights cannot be replaced by a trial via this endpoint.
- Transaction creates server-owned subscription and private `trialGrants/{uid}` once. Repeat requests never extend it. A retained grant with missing subscription resolves to Free instead of regaining the default profile Pro rights. UID is not proof of one trial per human; account recreation abuse/retention policy remains open.
- Trial expiry is computed on server status reads; no scheduled job or profile rewrite is required for the model. Browser managed feature previews use cached server identity and elapsed monotonic time, with no legacy feature-policy changes. These UI gates are not a security boundary.
- Monthly trade-intake limits and active account selection are proposed, not fully enforced. All manual/import/cloud write paths need transactional server accounting and rules before rollout. Do not substitute a total history cap or remove old data.
- Server status/bootstrap still needs real SDK hookup and fail-closed managed authorization on reload/offline. Paid backend features must always query current authoritative access. No public trial rollout until these checks and the signup CREATE fix below are complete.

## Required next phase and launch blockers
- Business decisions: provider + merchant account/country, currency, confirmation of the proposed plan features/prices including tax display, monthly/yearly terms, trial eligibility, grandfathering/cutoff/grace period, cancellation/refund policy and explicit authorization to charge. No default decision is inferred.
- Provider-specific hosted checkout, consent record including exact price/cycle/terms version, verified signature on raw webhook body, event deduplication, ownership mapping, out-of-order reconciliation, provider idempotency, cancellation at provider and reconciliation. These are intentionally not simulated as completed.
- The existing users CREATE rule permits self-selected plan values; old registration consumes invitations before profile creation. Fix this together using server provisioning before enforcing paid feature authorization. Do not deploy a restrictive create rule alone and break invited users.
- Browser feature gates protect UI only. Any paid server operation must authorize from server-owned entitlements, not localStorage/profile plan/client isAdmin. Admin legacy manual grants need a separate audited workflow in the next phase.
- New billing data is not yet integrated with legacy account deletion/export; define retention and include these collections before enabling real subscriptions.
- Legacy expiry/referral writers are suspended in this branch. Restore their business behavior via server jobs only after approval of transition/reward policies. No claim of a scheduled expiry job is made.
- Cancellation in this release is a request for review, not provider cancellation. There is no automatic notification/fulfillment worker; real self-service cancellation cannot launch until the provider adapter is complete.

## Verification performed
- `node --test functions/billing.test.cjs`: 7 pass (auth/action/charge denial, own-user identity, repeat cancellation, preservation, rejected webhook, exact trial boundaries, immutable draft prices/export, gated one-time enrollment and orphaned grant fallback).
- `node tests/subscriptions.cjs`: actual repository billing HTML/CSS in offline browser fixture, desktop/mobile RTL, disabled purchase, unavailable-server message, zero client writes, proposed monthly/yearly catalog, managed trial/expiry state, cross-user cache isolation and managed feature gates; inline syntax, CSS balance, declaration preservation, no new duplicate IDs, index/v75 equality.
- `node tests/finance-summary.cjs` and `node tests/data-export.cjs`: pass.
- `node tests/home.cjs` fails 8 vs 14 style blocks. `node tests/workspace.cjs` fails 5 vs 3 KPI cards. Both reproduced against unchanged v74 baseline; not introduced by this change. Navigation test also pins an obsolete v56 equality and is not represented as passed.
- No production deploy, real checkout, live user migration, rules emulator or live Firebase integration test performed.

Reference: https://firebase.google.com/docs/functions/callable and https://firebase.google.com/docs/app-check/cloud-functions
