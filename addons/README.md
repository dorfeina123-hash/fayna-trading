# Fayna Sync add-ons

Platform add-ons that send executions to the journal. Read-only: they never place orders
and never see a broker password.

```
ATAS / Quantower  ──POST fills──▶  syncIngest (Cloud Function)  ──▶  users/{uid}/syncFills
       ▲ pairing key (shown once)                                          │ onSnapshot
       └──────────── Fayna → Settings → Connections ◀── fayna-sync.js ◀────┘ pairs fills into trades
```

## Contract
`POST https://us-central1-fayna-trading.cloudfunctions.net/syncIngest`
Header `Authorization: Bearer <pairing key>`; body:
```json
{ "source": "atas", "version": "1.0.0",
  "fills": [{ "id": "E1", "orderId": "O1", "account": "BX50K-123", "symbol": "MNQZ5@CME",
              "side": "buy", "qty": 2, "price": 21000.25, "time": "2026-11-03T14:30:00.000Z", "commission": 1.24 }] }
```
Up to 500 fills per request. A fill is stored once per source + account + id, so resending is safe.

## Build (Windows, .NET 8 SDK)
```
cd addons/atas      && dotnet build -c Release                      # needs ATAS installed (AtasDir)
cd addons/quantower && dotnet build -c Release -p:QuantowerDir="<Quantower>\TradingPlatform\<version>\bin"
```
Copy the DLLs to `sync/` in this repo so the download page offers them.

## Before the first real test
- Publish `firestore.rules` and deploy the function: `firebase deploy --only firestore:rules,functions:billing:syncIngest`
- Verify ATAS `MyTrade.Time` is UTC: compare a trade's time in the journal with the platform.
- The card in Settings → Connections is admin-only until `OPEN_TO_ALL` in `fayna-sync.js` is set to `true`.
