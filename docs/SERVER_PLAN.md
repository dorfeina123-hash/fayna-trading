# Secure service plan — not deployed

## Boundary

Keep Firebase Auth as identity. A server verifies each ID token (including revocation for sensitive operations) and derives uid from that token, never from a request body. Scope every database path, job and cursor to uid and connection id. Avoid changing existing users/{uid} td_* fields during the first migration. Use versioned additive records with export/recovery and dual-read tests before any cutover. Current Firestore rules are preserved, not certified as sufficient for new backend features.

No cloud billing is enabled. Hosting and operational budget require a later decision; the earlier no-cloud-billing preference remains active. A local connector prototype is not a multi-user SaaS backend.

## Gmail

Separate OAuth from sign-in; single-use short-lived state bound to authenticated uid/session and PKCE. Exact redirect allowlist, minimal approved scope, explicit consent and disconnect. Tokens encrypted in a server-side secret store with key rotation, never in browser storage, logs or Git. Fetch only requested supplier/time windows, create invoice candidates, require review before writing finance records. Idempotency key scoped to uid/message/attachment; revoke and delete on disconnect according to disclosed retention. Background workers need bounded retries, dead-letter handling, audit metadata and cancellation.

## Brokers

Only documented authorized adapters. Never accept broker passwords in frontend. Per-account ownership proof and explicit account mapping; external fill ids plus revision tracking; cursors scoped to connection. Reconcile a preview against broker reports before enabling writes. Handle corrections and partial fills without counting the same execution twice. Market-data licensing and timezone verification are distinct prerequisites for charts and backtests.

## Trials and billing

Server is authoritative for eligibility and time. New eligible uid receives one durable trial record with server startedAt and endsAt = startedAt + 14 days; retries must not restart it. Reinstallation/device clocks cannot extend access. Existing users retain existing entitlements and are not automatically converted into trials.

States: ineligible, trialing, expired, active, canceled, past_due. Trial expiry alone NEVER creates a charge. Before checkout, show approved price, currency, tax treatment, billing interval, next-charge date and cancellation terms. Record explicit consent with policy/price versions and timestamp. Payment activation defaults OFF and requires separate owner approval, configured provider secrets and tested signed webhooks. Never trust client plan/consent fields as evidence of payment. Deduplicate provider event IDs and subscription operations transactionally. Provide self-service cancellation and receipts only after provider verification.

## AI and sharing

Server keys only, per-user usage limits and tenant-scoped retrieval. Mentor grants name exact allowed resources/actions, are opt-in and revocable; no broad cross-user queries. Avoid including financial or email contents in operational logs. Record access audit metadata and enforce deletion/retention policies.

## Required tests before service activation

Cross-tenant read/write denial; forged/expired/revoked tokens; OAuth state replay and wrong-owner callbacks; duplicate jobs/webhooks; disconnect during sync; price/consent tampering; trial boundary and concurrent enrollment; existing lifetime access; migration rollback and isolated staging fixtures. Provider sandbox end-to-end tests are mandatory before real connections or charges.
