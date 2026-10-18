# Automatic trade sync — options (research 2026-10-18)

Goal: trades appear in Fayna without manual import. Accounts in scope: Bulenox, Apex, TakeProfit/MFFU (Rithmic) and Tradovate users.

## 1. Tradovate official API (OAuth)
- API access is a paid add-on (~$25/month reported by developers) and **OAuth credentials for third-party apps are issued only to approved NinjaTrader Ecosystem partners** (support answer relayed on Tradovate's forum, Jan 2026).
- Developers report historical endpoints (`fill/list`, `fillPair/list`) returning empty arrays via OAuth while live endpoints work (Apr–May 2026); support points to a separate Reporting API for history.
- Fit: good long-term for Tradovate users, but needs a partner application and real testing. No password storage (OAuth).
Sources: community.tradovate.com threads "Third-Party OAuth Integration" and "How to retrieve historical fills/trades via OAuth".

## 2. Rithmic R|Protocol API (server-side)
- No OAuth: a server must log in with the user's **Rithmic username + password** (conflicts with our rule of never storing broker passwords).
- Per-user API fees at several brokers/firms (e.g. ~$100/month add-on reported for Bulenox; $20–$125 elsewhere), API not available on demo/trial accounts, prop-firm rules vary (Apex restricts automation).
- Fit: poor for a SaaS journal — cost per user, password custody, approval and prop-firm terms.
Source: PickMyTrade blog "Rithmic Access Denied: API Access Level" (Sep 2026, vendor source — verify with each firm).

## 3. Recommended: platform add-on ("Fayna Sync") + our server
The trading platform the trader already uses (ATAS, NinjaTrader 8, Quantower …) is already connected to Rithmic/Tradovate and sees every fill. A small add-on inside it sends each execution to Fayna:
- No broker password, no Rithmic/Tradovate API fees, works for every prop firm on that platform, real-time.
- User pairs the add-on once with a revocable device token from Fayna settings; the server (already built: `server/`, tenant isolation, fill revisions, dedupe, preview/reconcile) receives fills at a new `/v1/ingest/fills` endpoint and maps them to the journal account.
- Work: one add-on per platform (C# for ATAS and NinjaTrader), the ingest endpoint + pairing screen, and Firebase Blaze for hosting (already chosen for billing).
- Limitation: syncs only while the platform runs on the trader's computer; history before installation still comes from file import.

## 4. Keep file import as the baseline
Already supports ATAS, Tradovate (fixed today), NinjaTrader, TopstepX, MT4/5, IBKR, Binance.

## Decision needed
Which platform do you and most clients execute in? That picks the first add-on.
