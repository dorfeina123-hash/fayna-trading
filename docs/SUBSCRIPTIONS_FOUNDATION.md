# Subscription foundation ג€” current audit and rollout state

Updated 2026-10-18. Draft PR only; no application production deployment or live charge.

## Current business decisions
- Existing billing screen reused; Hebrew RTL.
- 14-day full Unlimited trial without card; no automatic charge after trial.
- Two public paid plans with identical active features: One (one active account), Unlimited (no active account limit), no paid trade-count quota.
- Owner's latest approved launch display prices: USD 14.90 / 24.90 monthly. Annual prices are not approved; annual selection is hidden and rejects quotes. Earlier ILS proposals are superseded.
- Display USD, actual settlement ILS, as explicitly requested. Server quote uses Bank of Israel representative USD rate, integer minor-unit rounding, source date and ten-minute validity. No invented fallback exchange rate.
- Fayna Group umbrella / Fayna Trading product. English customer display name saved in Grow as FaynaGroup (spaces rejected by Grow). Customer-facing email saved to the requested address. Legal/general business name is locked in Grow and needs support to change.
- Existing users are not migrated or automatically assigned trials. Original lifetime grants and profile rights remain unchanged. Limited Free fallback retained after managed trial pending final rollout terms.

## Existing system inspected
Static GitHub Pages app; Firebase compat 10.12.2 email/password and Google Auth. Profiles and td_* arrays share users/{uid}; no schema rewrite. Versioned v75 equals index. Automatic HTML promotion is disabled. Public Pages returned HTTP 200 and matched main before branch changes.

Repository rules are not evidence of deployed Firebase rules. No live Firebase user inventory or deployed rules were read. Grow merchant UI was inspected after the user signed in; recurring billing and webhook screens exist. The only external settings changed were the explicitly requested customer display name/email. No payment, provider subscription, webhook destination, bank details or legal name changed. Merchant IDs, credentials and private financial details are not stored in the repository.

## Implemented in development
- Shared immutable plan model; exact 336-hour trial and expiry-to-Free without rewriting trading history. Once-per-UID transactional grants; orphan grant cannot restore legacy default Pro.
- Trial enrollment disabled by default. Requires Auth, App Check, verified email, trusted fayna_trial_eligible custom claim, configured cohort cutoff and Auth creation metadata. Client profile timestamps cannot prove eligibility. No claim of one trial per human after account recreation.
- Server-only subscription/cancellation/quote collections; checkout always rejects and webhook always returns 503 without writes. Cancellation is clearly a pending review request, never a claim that a provider cancellation completed.
- Managed workspace writes: trusted token UID and server subscription determine account capacity, irrespective of client profile plan/price. All new or edited trades need an owned active account. Existing exact historical exceptions remain unchanged; duplicates of unassigned history do not bypass validation.
- Direct managed td_accounts/td_tradesList browser writes denied by rules, including retained-grant/orphan cases. Server write is transactional and guarded by the workspace revision actually loaded from cloud; stale-device saves abort instead of replacing newer data.
- Browser manual trade, daily summary, classic CSV, importer wizard and extension intake require an account. A sole active account is selected automatically; multiple accounts require a destination. All account factory paths used for inline/daily/add-account creation check capacity. Backups are checked before replacement. Deletion of account becomes archive to preserve trade references.
- Existing excess accounts remain readable after downgrade. New trade writes are blocked until active accounts fit capacity. The account menu now labels archived accounts, supports capacity-checked restoration and an explicit sole-account selection that archives other accounts without deleting history. Final staged acceptance testing remains.
- Actual public Bank of Israel API fetched successfully by the backend rate helper. Quote endpoint ignores client amount/currency/uid and stores the exact quote server-side. Quote button displays settlement amount/source date; no provider request is made.

## Validation
- 17 Node server/policy/FX tests pass: identity isolation, charge rejection, exact trial boundaries, enrollment conditions, account caps, historical preservation, immutable account ownership, quote rounding/source freshness and stale-save rejection.
- 6 real-entry-function tests pass for manual trades/daily summary, destination ambiguity, inline capacity and archive preservation.
- Offline actual repository HTML/CSS browser tests pass for desktop/mobile RTL, both feature maps/PDF, USD monthly prices, hidden unapproved annual option, server quote display, legacy expiry/referral display, trial/expiry, cache identity and payment guards; syntax/CSS/declarations/IDs and index/v75 equality.
- Existing finance-summary, data-export, ATAS import and bulk deletion regressions pass.
- Original home/workspace tests have failures that also reproduce on v74 (style count 8 vs 14; KPI count 5 vs 3). They are not represented as passing.
- Added isolated CI Firestore emulator tests on demo-fayna (localhost only) for managed trading bypass, cross-user access, protected fields and legacy compatibility. Local host lacks Java. The isolated CI emulator job completed successfully for code commit efd67b0; managed bypass, cross-user access, protected fields and legacy compatibility checks passed. No production Firebase rules were deployed.

## Remaining launch blockers
1. Actual Grow API/Sandbox authorization and userId + dedicated recurring pageCode via secret storage. Merchant UI access is not proof of API entitlement. Do not put provider secrets into adminPrefs/localStorage or public scripts. Official recurring setup: https://developers.grow.business/reference/create-payment-process-3
2. Provider hosted checkout, verified server callback/webhook, amount/currency/ownership matching, deduplication/order handling, reconciliation and actual cancellation. No mock is represented as a provider integration.
3. Choose renewal FX policy: fixed ILS agreed at signup or recalculation on renewal, with explicit recurring amount/terms consent. Confirm tax presentation, cancellation/refund terms and transition for existing users. Initial display prices and ILS settlement choice alone are not authorization to charge.
4. Secure signup/invite provisioning before eligibility assignment: old users CREATE permits self-selected profile plans; invites are consumed client-side. Do not deploy a restrictive create rule in isolation and break existing invited signups.
5. Real staging SDK/Functions/App Check integration; managed startup/offline fail-closed entitlement bootstrap. UI gates are not server authorization. Old browser legacy writers stay until migration; managed cohorts must always use transactional saves.
6. Staged acceptance of account selection/restore, Free monthly usage accounting, live authorized data inventory/backups, new billing collection export/deletion/retention and full staged acceptance tests.
7. Explicit owner authorization before production billing/deployment. No assumption of approval from urgency or price selection.

Sources: https://firebase.google.com/docs/functions/callable ; https://firebase.google.com/docs/firestore/security/test-rules-emulator ; https://www.boi.org.il/qawebsite/ ; https://developers.grow.business/discuss/688f5d52758134232e8e70a8
