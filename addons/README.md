# Fayna Sync: תוספים לסנכרון עסקאות

תוספים שרצים בתוך פלטפורמת המסחר ושולחים את הביצועים ליומן. הם קריאה בלבד: לא מבצעים פקודות ולא רואים סיסמה של הברוקר.

```
ATAS / Quantower  ──שליחת ביצועים──▶  syncIngest (שרת)  ──▶  users/{uid}/syncFills
       ▲ מפתח חיבור (מוצג פעם אחת)                                   │ האזנה בזמן אמת
       └────────── פיינה ← הגדרות ← חיבורים ◀── fayna-sync.js ◀─────┘ הופך ביצועים לעסקאות
```

## מבנה הבקשה
`POST https://us-central1-fayna-trading.cloudfunctions.net/syncIngest`

כותרת `Authorization: Bearer <מפתח החיבור>`, וגוף הבקשה:
```json
{ "source": "atas", "version": "1.0.0",
  "fills": [{ "id": "E1", "orderId": "O1", "account": "BX50K-123", "symbol": "MNQZ5@CME",
              "side": "buy", "qty": 2, "price": 21000.25, "time": "2026-11-03T14:30:00.000Z", "commission": 1.24 }] }
```
עד 500 ביצועים בבקשה. כל ביצוע נשמר פעם אחת לפי מקור, חשבון ומזהה, כך ששליחה חוזרת לא יוצרת כפילות.

## בנייה (Windows עם ‎.NET 8 SDK)
```
cd addons/atas      && dotnet build -c Release                      # דורש ATAS מותקן (AtasDir)
cd addons/quantower && dotnet build -c Release -p:QuantowerDir="<Quantower>\TradingPlatform\<version>\bin"
```
את קובצי ה־DLL שנוצרים מעתיקים לתיקייה `sync/` בריפו, ואז עמוד ההורדה מציע אותם.

## לפני הבדיקה האמיתית הראשונה
- להעלות את כללי מסד הנתונים ואת השרת: `firebase deploy --only firestore:rules,functions:billing:syncIngest`
- לוודא ש־`MyTrade.Time` ב־ATAS הוא UTC: להשוות זמן של עסקה ביומן לזמן בפלטפורמה.
- הכרטיס בהגדרות ← חיבורים מוצג רק למנהל עד שמשנים את `OPEN_TO_ALL` ב־`fayna-sync.js` ל־`true`.
