# SaaS implementation — stage 1

Development branch only. No production deployment, Firebase migration, OAuth activation or payment activation is authorized by this change.

## Recovery audit

- Audited recursive main tree at db155b5b9bb506662a64d1631ab189824f55a8d0.
- Latest complete numbered release: v74. Its blob ffaf4533b9a5db9eacf335c1d271552f7fbd11c7 is identical to index_previous_backup.html.
- index.html and prototype/dashboard-v2.html share blob 4603f95778fcf346bf78a028a80c1f51ca7c0621 (13,795 bytes); they are the isolated demonstration, not the application (v74: 1,689,768 bytes).
- The old workflow considered every changed HTML file except two root names; nested prototype HTML could overwrite index.html. Replaced automatic copying/committing with read-only regression checks. Production changes now require reviewed canonical source updates.
- Existing root modules: import, export, metrics, merge and trade markers. Existing regression files retained. Earlier numbered snapshots remain available unchanged. No server implementation is present in main. The separate integration draft PR is not deployed or silently merged here.

## Implemented in this stage

- Restored complete v74 application on development branch, then created v75 with the new visual layer.
- Ported dashboard-v2 palette, panel geometry, typography scale and responsive KPI/calendar layout onto existing application IDs and data flows. Existing account/range filters and real equity series remain authoritative.
- Four KPI cards, calendar day details scoped to the selected account and period, explicit empty states. Calendar currently shows the current month; historical calendar navigation remains in the existing calendar page.
- No prototype values or synthetic candle paths copied. Removed the legacy generated price sparkline from trade rows and retained the real chart-opening action.
- Existing auth scripts, Google sign-in, Firebase config, storage keys, entitlements and Firestore rules retained. No database writes or user sessions were used for development tests.
- Automated source-preservation and parser/export/dashboard checks added to CI. Browser/mobile/keyboard and Firebase emulator validation remain release blockers; passing source checks is not proof of full regression safety.

## Remaining roadmap stages

1. Complete six-section navigation across desktop/mobile, accessible visual review in both themes, dashboard historical month control and performance testing.
2. Journal/import: persist source timezone and close date, reliable account scoping and provider fixtures. Replace external Pine workaround with a licensed OHLCV chart source before claiming in-app executions on candles.
3. Analysis/strategies: consolidate metrics, overtrading/discipline analyses, weekly/monthly reviews; lab and backtest must remain labeled simulation and use licensed data.
4. Notebook, opt-in mentor permissions, server-backed AI, six-step tour of available features, one-time welcome email and notification preferences. Audit existing browser agents and email triggers before reusing them.
5. Backend, Gmail, broker sync and subscription policies per SERVER_PLAN.md. No client tokens, broker passwords or payment secrets. Do not enable any of these via a visual placeholder.

## Release gate

Draft PR only. No merge to main before passing CI, UI testing, account-isolation/emulator tests, migration/recovery rehearsal and owner approval. Payment processing has a separate explicit approval gate. Existing paid/lifetime users must retain their entitlements.
