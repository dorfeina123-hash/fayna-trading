# Missing expenses investigation — 19 October 2026

## Evidence and limits

The owner reports missing financial expenses following the recent changes.
No authenticated production expense records have been inspected or restored yet:
the available browser is still on login. Specific missing entries, dates and the
original browser/device are awaiting the owner's response. No matching backup JSON
was found in the checked Downloads and Codex workspace paths. This is not proof
that no backup exists elsewhere.

Confirmed code issues:

1. `_cloudSave` previously required only an identified user, not successful
   workspace hydration. An identified session on the public landing could run a
   background save while the workspace arrays were empty/stale. A synthetic test
   exercises the exact save function and now verifies no upload before hydration.
   This is a plausible loss path, not a verified cause for this user's records.
2. The v1 financial backup contained businessEvents/businessNotes only; it omitted
   records, customExpenses and recurringTemplates. Those stores remain separate
   in the app. An old financial backup therefore cannot recover omitted expenses.
3. Financial display can exclude records by period/type/search, archived state,
   unsupported dates and, when the currency helper is unavailable, currency.
   The current daily/monthly display alone cannot establish deletion.
4. The existing 'automatic backup' feature is a reminder, not historical cloud
   backups. Git version history contains code, not the user's Firestore data.

## Prepared safeguards

- Cloud saves require a successful workspace read for the same UID. The readiness
  check runs both before scheduling and immediately before the write. Failed reads
  and logout leave/reset the gate closed. Local finance save paths and silent
  unload saves are also gated to prevent replacing caches with unloaded arrays.
- Preserve exact finance cache strings before cloud hydration/local replacement.
  Up to three browser-local recovery copies retain the earliest plus two recent
  versions. These are forward-looking safeguards, not recovered historical data.
  Unknown cache ownership remains unknown; copies are never restored automatically.
- Financial backup v2 includes original records, free expenses, recurring templates,
  manual ledger and notes. Account-level withdrawals remain in the trading backup;
  the UI states that boundary.
- Financial restore accepts v1/v2 and original expense-export JSON. Validate and
  preview an additive merge, preserve existing IDs/notes, export the current state
  before writing, and never replace trading arrays. Invalid/cancelled restores do
  not alter source arrays.
- Source counts and a clear all-period/no-type/no-search view distinguish hidden
  entries from genuinely absent source records.

## Next steps for actual recovery

First inspect the authenticated original account and original device without
clearing site storage. Export current originals and ledger. Check all dates,
archives and source expense screens. Compare the cloud/current-device copies and
any user-supplied downloaded JSON. Only restore identifiable missing entries from
a verified source, keeping a before/after backup and duplicate/conflict counts.
If cloud data was overwritten and no device/file copy exists, investigate the
Firebase project's configured backup/PITR availability through authorized access;
do not assume that such backups were enabled. Do not restore an entire database
over current users or transactions.

No private financial data is committed in this audit or tests.
