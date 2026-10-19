# Fayna SaaS rollout — 2026-10-19

## Product and preservation
Hebrew RTL, existing colors, professional terminal direction. 14-day full trial without automatic charges; One USD14.90/month for one active trading account, Unlimited USD24.90/month for unlimited active accounts, identical paid features. Display USD and settle ILS. No annual price or renewal FX policy approved. Existing users and financial history remain unchanged until the owner decides transition terms.

## Trusted signup foundation in this branch
provisionAccount is an App Check callable, disabled unless FAYNA_PROVISIONING_ENABLED=true AND the caller has the server-issued fayna_managed_signup claim. Auth identity is fetched on the server and must have a verified, non-disabled email. Only name/phone are accepted from the browser; UID, plan, admin, email and trial dates are never accepted.

A transaction reads profile, subscription, trial receipt and invitation before writes. Existing profiles are untouched. Orphan entitlements require investigation, never reset. New non-invited profiles start server-owned Free. Trial enrollment remains the separate guarded startTrial action; this endpoint alone does not start the trial. A verified email invitation preserves an explicit legacy grant and records consumedBy/consumedAt atomically. Recreated users cannot claim it again. No admin rights are granted.

Rules block cohort clients from direct profile creation and invite deletion. Consumed invitations cannot be deleted by ordinary clients. The old signup remains compatible and still permits self-selected plans: this is a staged foundation, not a complete global security cutover. Deploying functions alone does not solve that legacy path.

## Remaining SaaS work, in order
1. Connect staged email verification and Google signup to provisioning, eligible trial enrollment and workspace hydration. Recover interrupted signup without duplicate data or consent/referral grants. Preserve public landing behavior.
2. Test real SDK, Functions, App Check and two identities in a separate Firebase staging project. Deploy rules/functions together; assign cohort claims only from trusted administration. Repository rules do not prove production deployment.
3. Complete managed entitlement bootstrap, offline fail-closed behavior, Free usage accounting and downgrade/archive acceptance. Add tenant-scoped server backups/export, recovery and revision checks across managed stores.
4. Implement Grow Sandbox checkout, authenticated callbacks, idempotency, exact amount/currency matching, recurring cancellation, reconciliation and failed-payment handling after API access is available. Checkout and webhook remain disabled.
5. Add authorized admin subscription/support/audit/reconciliation tools, monitoring and tested recovery procedures.
6. Finalize existing-user transition, tax display, renewal FX and cancellation/refund terms; obtain explicit owner charging approval before activation.

## Verification limits
Node tests cover tampering, verified identity, preservation, replay, orphan receipts, idempotency, default-off and cohort gating. Emulator CI covers direct-create and invite-delete bypasses. No production Auth records, claims, rules, Functions, billing or existing user data are changed. Unit transaction fixtures do not replace real staging acceptance.
