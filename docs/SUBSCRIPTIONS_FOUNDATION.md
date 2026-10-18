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
- Preserve existing profile plan and trading data; no migration, trial assignment, expiration, automatic downgrade, new charge or renewal.
- Hebrew RTL pricing and subscription management. Existing four plan feature definitions reused; paid prices remain unpublished. All legacy payment entry points fail closed, including Bit/Paybox override.
- Firebase callable requiring Auth + App Check. Identity comes only from token uid. Status reads the user's own records. A repeated cancellation request uses one deterministic transactional document, does not alter access and is explicitly pending review.
- Checkout always fails; webhook always returns 503 and writes nothing. There is no activation flag, provider SDK, secret or payment link in the new backend.
- subscriptions/{uid} is reserved for server-managed entitlements. subscriptionCancellationRequests/{uid} contains pending review requests; billingEvents and billingOperations reserved for verified events and idempotency.
- Server module imports successfully against installed Firebase dependencies. Lockfile included.

## Staging connection (not performed)
1. Use an isolated Firebase staging project; export and review its current rules before any deployment. Never infer a production project from client configuration.
2. Review signup/invite compatibility and legacy writers against tightened rules. Configure App Check and the Firebase Functions client SDK in staging. The browser adapter expects `window.faynaBillingCallable = firebase.functions().httpsCallable('billing')` after initialization. No SDK/endpoint is auto-connected in this release.
3. Deploy only to staging. Test real Auth, App Check rejection, cross-user denial, concurrent requests, and Firestore rules in the emulator and staging before merging. Local server tests use an in-memory transaction adapter; they do not prove deployed IAM/rules or platform token validation.
4. Inspect anonymized counts of legacy plans, status, expiry and lifetime grants with authorized Admin tooling. Retain a verified backup. Agree on a migration cutoff and exceptions; prepare a dry-run report before any writes.

## Required next phase and launch blockers
- Business decisions: provider + merchant account/country, currency, plan features/prices including tax display, monthly/yearly terms, trial eligibility, grandfathering/cutoff/grace period, cancellation/refund policy and explicit authorization to charge. No default decision is inferred.
- Provider-specific hosted checkout, consent record including exact price/cycle/terms version, verified signature on raw webhook body, event deduplication, ownership mapping, out-of-order reconciliation, provider idempotency, cancellation at provider and reconciliation. These are intentionally not simulated as completed.
- The existing users CREATE rule permits self-selected plan values; old registration consumes invitations before profile creation. Fix this together using server provisioning before enforcing paid feature authorization. Do not deploy a restrictive create rule alone and break invited users.
- Browser feature gates protect UI only. Any paid server operation must authorize from server-owned entitlements, not localStorage/profile plan/client isAdmin. Admin legacy manual grants need a separate audited workflow in the next phase.
- New billing data is not yet integrated with legacy account deletion/export; define retention and include these collections before enabling real subscriptions.
- Legacy expiry/referral writers are suspended in this branch. Restore their business behavior via server jobs only after approval of transition/reward policies. No claim of a scheduled expiry job is made.
- Cancellation in this release is a request for review, not provider cancellation. There is no automatic notification/fulfillment worker; real self-service cancellation cannot launch until the provider adapter is complete.

## Verification performed
- `node --test functions/billing.test.cjs`: 4 pass (auth/action/charge denial, own-user identity, repeat cancellation, preservation, rejected webhook).
- `node tests/subscriptions.cjs`: actual repository billing HTML/CSS in offline browser fixture, desktop/mobile RTL, disabled purchase, unavailable-server message, zero client writes; inline syntax, CSS balance, declaration preservation, no new duplicate IDs, index/v75 equality.
- `node tests/finance-summary.cjs` and `node tests/data-export.cjs`: pass.
- `node tests/home.cjs` fails 8 vs 14 style blocks. `node tests/workspace.cjs` fails 5 vs 3 KPI cards. Both reproduced against unchanged v74 baseline; not introduced by this change. Navigation test also pins an obsolete v56 equality and is not represented as passed.
- No production deploy, real checkout, live user migration, rules emulator or live Firebase integration test performed.

Reference: https://firebase.google.com/docs/functions/callable and https://firebase.google.com/docs/app-check/cloud-functions
