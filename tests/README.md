# UI regression checks

Prerequisites: Node.js, Playwright (`npm install --no-save playwright`) and Microsoft Edge.

From the repository root run:

```
node tests/navigation.cjs
node tests/home.cjs
```

Navigation checks JavaScript syntax, CSS brace balance, preservation of declarations, duplicate DOM IDs, matching versioned/index files, desktop/mobile navigation, expense categories, subscription gates, import dispatch and calculator draft preservation.

Home checks period boundaries, fees, losing trades, drawdown from zero, manual daily summaries, invalid amounts, empty data, account filtering, desktop/mobile layout, action buttons and escaping user-controlled text. Screenshots use synthetic data only.

Browser fixtures block all network requests and substitute authentication and persistence integrations. They do not verify Firebase login or cloud saves. Authentication overlays are hidden only in the isolated fixtures. Screenshots are saved in the repository root for local inspection.
