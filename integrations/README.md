# ATAS / Gmail integration preview

Status: development foundation, **not deployed or connected**. The production journal,
expenses, Firebase user documents and account data are untouched. No credentials or
personal records belong in this directory or GitHub.

## Implemented and checked

- `atas/JournalCapture.cs`: read-only ATAS indicator prototype. Opt-in, exact account
  selection; snapshots the chart TradingManager's available MyTrades and receives
  OnNewMyTrade events. Stores local JSON revisions with stable hashed filenames.
  No networking, broker credentials, order placement or cancellation.
- Compiled against locally installed ATAS 8.0.15.302 / .NET 10. SDK assemblies are
  referenced from the installation and are not redistributed.
- `core.mjs`: validates exact decimal strings, rejects unresolved timestamps,
  enforces account/route selection from a server-provided connection, scopes stable
  fill IDs by user through the storage adapter.
- `gmail.mjs`: bounded Gmail read-only candidate scanner, exact supplier addresses,
  deterministic draft IDs, no expense booking, no sending or deletion of emails.
- `core.test.mjs`: synthetic isolation, replay, correction, validation and Gmail tests.

Run `node --test integrations/core.test.mjs`. Build on Windows using
`dotnet build integrations/atas/Fayna.Atas.csproj -c Release`.

## ATAS verification still required

The DLL has NOT been installed into ATAS or activated. Building successfully does
not establish runtime coverage. In a demo account, compare the chart API data to
the actual ATAS journal: manual fills, partial fills, multiple instruments,
commission updates, reconnects and historical ranges. OnNewMyTrade may have
strategy/chart scope. Do not advertise complete journal history until verified.

When explicitly enabled, the preview writes under
`%LOCALAPPDATA%/Fayna/AtasPreview/outbox`. This contains private trading data.
The prototype keeps revisions; it does not upload or delete them. Scans run on
OnCalculate, not an independent background timer. Unknown timezone values are
preserved, and the ingest core refuses them rather than guessing UTC. CaptureStatus
reports failures programmatically; a visible status panel is still needed.

## Required next implementation before release

1. Deploy an authenticated backend in the Firebase/Google Cloud project. Verify
   Firebase ID tokens (including revocation); never trust a request body UID.
2. Add expiring one-time device pairing, revocable hashed per-device credentials,
   account/route allowlists, rate limits, bounded batches and durable retry/backoff.
   The ingress core is NOT an HTTP endpoint and supplies no authentication by itself.
3. Implement a Firestore transactional repository in a separate server-only
   namespace. `atomicUpsert(uid,id,revision,fill)` must create once, acknowledge exact
   retries, and retain changed revisions for review, never blindly overwrite.
   Do not replace `td_records`, `td_trades` or other existing arrays. Do not merge
   new rules before reading/testing the current production rules.
4. Add reviewed execution-to-journal reconstruction, instrument contract metadata,
   partial close/reversal tests and a reconciliation step for already imported trades.
5. Register Google OAuth consent + web client and exact server callback; store
   refresh tokens encrypted server-side, bind single-use OAuth state to the verified
   user, implement disconnect/revocation. No OAuth secrets in the static site.
6. Add Gmail scheduler/checkpoints and bounded retries. `saveDraft` must create-if-absent
   so rescans cannot reset approved/rejected drafts. Message deduplication does NOT
   detect an invoice resent in another message; invoice identity/content deduplication
   and PDF/OCR extraction remain to implement. Amounts currently require review.
7. Add site connection/status/account selection and invoice review screens only after
   the backend is available. End-to-end tests must use each user's separate connection.

Google `gmail.readonly` grants broad mailbox read access even when the application
only searches selected suppliers. It is a restricted scope and may require OAuth
verification/security assessment for a public service. The scanner requests full
MIME messages to inspect attachment metadata but does not persist message bodies.
Cloud billing/project administration and each user's Google consent are required
before activation; no paid service has been enabled by this change.

## Sources

- https://docs.atas.net/en/md_DataFeedsCore_2Docs_2en_20030__IndicatorEvents.html
- https://docs.atas.net/en/classATAS_1_1DataFeedsCore_1_1MyTrade.html
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/guides/push
