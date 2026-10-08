# Master upgrade continuation — 2026-10-08

Owner's full request is preserved verbatim in FAYNA_MASTER_UPGRADE_2026-10-08.md. This supplements the approved roadmap and UI status; it does not erase prior recovery/test work. Its statement that main index is a prototype is historical: main was restored to full v74 at c2a0e12ee40d0bed063b8b9bf67b3411ab3d6ebb. Development remains codex/saas-foundation; Claude's backend branch is separate.

## Existing features and reuse map

| Area | Existing source | Current / next work |
| --- | --- | --- |
| Home | renderHome / _homeModel; saas-dashboard.js | Real KPIs/calendar, account and period filters. Added averages, ratio, chronological max streaks and day strategy/notes. Custom dates, strategy filters, comparison and interactive curve remain pending. |
| Journal | renderTJ, openTradeAnnotate, workspaceTradeDetails | Existing editing, tags/strategy, notes and images retained; wider UX/accessibility review pending. |
| Imports | fayna-import.js | Existing broker parsers/Excel preview/dedup retained and tested. JSON/undo/timezone expansion requires format fixtures. |
| Charts | openTradeChart, fayna-trade-markers.js | Symbol mapping/Pine export exist. Licensed historical OHLCV/replay is unavailable; no invented candles. |
| Analysis | renderStats, strategy attribution, fayna-metrics.js/fayna-merge.js | Existing performance and strategy tools retained; periodic comparisons and discipline dashboard require extension. |
| Prop / finance | accounts, financeCombinedRows, records/customExpenses/businessEvents | Existing targets/withdrawals/fees preserved. Display currency conversion fixed; backend expense merge awaits API contract. |
| Notebook | td_lrNotes and lr-notes within legacy routines | Stored notes preserved; not exposed as a completed new notebook. Extend compatible fields after mapping. |
| AI / tour / alerts | existing assistant, coach, notifications, onboarding functions | Keep existing data and behavior. Do not claim server-backed AI/mentors/14-day trial is active. |
| Backend | Claude-owned branch, unavailable remotely | Exact Gmail/broker/subscription UI waits for BACKEND_API_CONTRACT.md. No backend implementation or merge in this frontend task. |

## This increment

- Light default only when no valid saved dark/light choice; no preference storage writes, auth or entitlement changes.
- Six responsive KPI cards plus detailed-trade average ratio and max streaks. Breakeven breaks a streak; manual aggregate rows are excluded from averages/streaks. Missing metrics show a dash. Day details use textContent for notes and strategy.
- Avoid recomputing detailed metrics for calendar-only rows; reuse the period summary for an all-time calendar where possible.
- Existing dark/light/RTL/mobile accessibility and financial regressions remain mandatory. New theme tests preserve stored choices and new metric tests check chronology, manual summaries and empty states.

## Measurement and limits

Same Node v24.19.0 VM harness, 10,000 synthetic unsorted rows, 30 runs. Prior summary median 6.104 ms / p95 7.151 ms. Enhanced summary median 21.716 ms / p95 24.414 ms. Extra chronology sorting and metric work add cost; this is not a speedup claim. The application model normally supplies sorted period rows, but real app load/CPU/RAM/Firestore call counts have not been measured here. scripts/measure-dashboard.cjs requires the previous module snapshot as its argument; raw report is under local artifacts/dashboard-measurement.json.

Further release blockers: full authenticated app/Google popup/admin UI, whole-site visual/accessibility review, browser performance profiling, backend contract integration and all remaining roadmap features. No main merge, production publication, billing activation, rules change or Pro-default change.
