# Finance display conversion — 2026-10-08

The manual ledger's currency selector previously filtered rows by their saved currency. Legacy expenses already converted, so a mixed ledger could lose manual rows when switching USD/ILS and show inconsistent totals.

The presentation module now converts all in-period manual income/expense rows to the selected display currency. USD is multiplied by the row's valid saved rate; ILS is divided. Missing/invalid saved rates use the existing date-based historical rate. Values are rounded to two decimals. Original records, amount, currency and IDs are untouched; opening/editing still uses businessEvents, not the converted copy. Legacy expense and withdrawal fee logic stays unchanged, and totals/reports/export use the common combined rows.

A visible note discloses that fallback historical rates are estimates, not live quotes. This does not implement a live FX provider. The historical table must be updated separately if accurate recent FX is required.

Regression tests cover mixed USD/ILS, stored and fallback rates, date scope, legacy expense and withdrawal fees, source preservation and round-trip switching. The browser test interacts with the actual selector and financial report route; row count stays fixed while amounts/totals change. It also caught and fixed secondary finance tabs being overwritten by the new bottom-navigation synchronization.

Example synthetic fixture: USD expense 100 at 3.5 plus ILS income 600 at 3 plus legacy USD expense 20 at 4 gives a net USD 80 and ILS 170. Different record-specific rates mean the aggregate is not necessarily a single-rate conversion.

Development branch / draft PR only. No production deployment or Firebase/auth/rules/billing changes.
