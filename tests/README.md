# Navigation regression checks

Prerequisites: Node.js, Playwright (`npm install --no-save playwright`) and Microsoft Edge. Run `node tests/navigation.cjs` from the repository root.

Checks JavaScript syntax, CSS brace balance, preservation of existing declarations, duplicate DOM IDs, identical v53/index files, desktop/mobile navigation, expense categories, subscription gating, import dispatch, expandable sections, and preservation of an unfinished trade when using calculators.

The browser fixture blocks all network requests and substitutes authentication, data renderers, and storage integrations. It tests actual navigation handlers and clicks, not Firebase authentication, live financial calculations or cloud persistence. The authentication overlay is hidden only inside this fixture. Screenshots are written to navigation-desktop.png and navigation-mobile.png.
