# Fayna Trading — ארכיטקטורת Live Sync
### מסמך תכנון מוסכם · חמישה סוכנים · גרסה 1.0

---

## 0. האילוץ שמכריע את כל השאר

**היום המערכת היא אתר סטטי על GitHub Pages. אין שרת.**

זו לא הערה טכנית שולית — היא פוסלת מראש כמעט כל דרישה במסמך שלך:

| דרישה שביקשת | האם אפשרי מדפדפן בלבד |
|---|---|
| HTTP-only Secure Cookies לטוקנים | ❌ — רק שרת יכול לכתוב עוגייה כזו |
| הצפנת AES-256 של טוקנים במסד | ❌ — המפתח היה נחשף בקוד הלקוח |
| Vault / KMS | ❌ — דורש צד שרת |
| Rithmic R\|API+ | ❌ — פרוטוקול protobuf בינארי, לא רץ בדפדפן |
| Rate limiting מרכזי | ❌ — כל לקוח מגביל רק את עצמו |
| Refresh token אוטומטי כשהמשתמש לא בדף | ❌ — אין תהליך שרץ ברקע |
| הפרדה מוחלטת בין משתמשים | ⚠️ — חלקית, רק דרך חוקי Firestore |

**המסקנה המוסכמת של כל חמשת הסוכנים: שרת אינו אופציה — הוא תנאי סף.**

---

## 1. סוכן אינטגרציות ו-API

### Tradovate — מה שאפשר באמת

REST:
```
Live: https://live.tradovateapi.com/v1
Demo: https://demo.tradovateapi.com/v1

POST /auth/accesstokenrequest
  { name, password, appId, appVersion, cid, sec }
  → { accessToken, mdAccessToken, expirationTime, userId }

POST /auth/renewaccesstoken     (חידוש לפני פקיעה)
GET  /account/list              (רשימת חשבונות)
GET  /fill/list                 (מילויים היסטוריים)
GET  /position/list             (פוזיציות פתוחות)
```

WebSocket:
```
wss://live.tradovateapi.com/v1/websocket        — חשבון והוצאות
wss://md.tradovateapi.com/v1/websocket          — נתוני שוק

פרוטוקול הפריים של Tradovate (לא JSON רגיל):
  'o'         — פתיחת חיבור
  'h'         — heartbeat (יש להשיב '[]' כל ~2.5 שניות)
  'a[...]'    — מערך הודעות
  'c'         — סגירה

הודעת אימות ראשונה:
  authorize\n1\n\n<accessToken>

הרשמה לאירועים:
  user/syncrequest\n2\n\n{"users":[<userId>]}
```

**קריטי:** אם לא שולחים heartbeat כל 2.5 שניות — Tradovate מנתק. זה מקור התקלה הנפוץ ביותר.

### Rithmic — האמת הלא נוחה

R\|API+ הוא **protobuf על גבי TCP/WebSocket מאובטח**, לא REST. כדי להשתמש בו נדרש:

1. הסכם חתום מול Rithmic (לא הרשמה עצמית)
2. אישור Conformance — Rithmic בודקים את היישום שלך לפני אישור לייב
3. SDK בצד שרת (C++/C#/Java/Python) — **אין נתיב דפדפן**

**המלצה:** לדחות את Rithmic לשלב ב'. לבנות את השכבה נכון מול Tradovate תחילה, עם ממשק מופשט שיאפשר להוסיף ספק שני בלי שכתוב.

### שכבת הפשטה לספקים

```js
// כל ספק ממש את החוזה הזה — הליבה לא יודעת מי הספק
class BrokerAdapter {
  async connect(credentialRef) {}      // מקבל הפניה לכספת, לא סוד
  async listAccounts() {}
  async fetchFills({ since }) {}
  onExecutionReport(cb) {}             // push בזמן אמת
  onPositionUpdate(cb) {}
  async disconnect() {}
}

class TradovateAdapter extends BrokerAdapter { /* REST + WS */ }
class RithmicAdapter  extends BrokerAdapter { /* protobuf, שלב ב' */ }
```

### טיפול בשגיאות — מדיניות אחידה

```js
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

async function callBroker(fn, { maxAttempts = 5 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const status = err.status ?? 0;

      // 4xx — טעות שלנו או של המשתמש. לא לנסות שוב.
      if (status >= 400 && status < 500 && !RETRYABLE.has(status)) {
        throw new BrokerError(status, userMessageFor(status));
      }
      if (++attempt >= maxAttempts) throw err;

      // Retry-After מהשרת גובר על החישוב שלנו
      const retryAfter = err.headers?.['retry-after'];
      const base = retryAfter ? Number(retryAfter) * 1000
                              : Math.min(1000 * 2 ** attempt, 30_000);
      const jitter = Math.random() * 0.3 * base;   // מונע rearm סימולטני
      await sleep(base + jitter);
    }
  }
}

function userMessageFor(status) {
  return {
    400: 'הבקשה נדחתה — בדוק את פרטי החשבון שהוזנו.',
    401: 'ההרשאה פגה. יש להתחבר מחדש לברוקר.',
    403: 'לחשבון אין הרשאה לפעולה זו. בדוק את הגדרות ה-API אצל הברוקר.',
    404: 'החשבון או הנתון המבוקש לא נמצא.',
    429: 'הברוקר הגביל את קצב הבקשות. ננסה שוב אוטומטית בעוד רגע.',
  }[status] ?? 'שגיאת תקשורת מול הברוקר. ננסה שוב אוטומטית.';
}
```

**הבחנה שחייבת להיות ב-UI:** 4xx = *המשתמש צריך לפעול*. 5xx = *אנחנו מטפלים, שב בשקט*. ערבוב בין השניים הוא מה שגורם לסוחרים לנתק ולחבר שוב סתם.

---

## 2. סוכן אבטחה — הביקורת

### הממצא החמור ביותר

הקוד הקיים ב-`tvConnect()` שולח מהדפדפן:
```js
body: JSON.stringify({ name: user, password: pass, cid, sec })
```

**סיסמת הברוקר וה-API Secret עוברים במכשיר של המשתמש.** בכל DevTools פתוח הם גלויים. אם המערכת תשרת יותר ממשתמש אחד — זו חשיפה של אמצעי גישה לחשבון מסחר.

**דירוג המצב הנוכחי: 2/10.**

### הארכיטקטורה הנדרשת

```
דפדפן                    שרת Fayna                    ברוקר
  │                          │                          │
  │  עוגיית סשן              │                          │
  │  HttpOnly Secure         │                          │
  │  SameSite=Strict         │                          │
  ├─────────────────────────►│                          │
  │                          │  טוקן ברוקר              │
  │                          │  מוצפן AES-256-GCM       │
  │                          │  מפתח ב-KMS              │
  │                          ├─────────────────────────►│
  │                          │◄──── WebSocket ──────────┤
  │◄──── SSE / WS משלנו ─────┤                          │
  │      (נתונים בלבד,       │                          │
  │       לעולם לא טוקנים)   │                          │
```

**הכללים שאינם ניתנים למשא ומתן:**

1. סודות הברוקר **לא עוזבים את השרת**. הלקוח מקבל מזהה חיבור, לא טוקן.
2. הצפנה במנוחה: AES-256-GCM, מפתח מנוהל ב-KMS ולא בקוד ולא במשתני סביבה בלבד.
3. עוגיית הסשן: `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age` קצר + refresh מסתובב.
4. הפרדת דיירים: כל שאילתה מסוננת ב-`userId` **בצד שרת**. לעולם לא לסמוך על סינון שהגיע מהלקוח.
5. Audit log לכל פעולה פיננסית — מי, מתי, מאיזה IP.
6. Rate limiting לכל משתמש בשרת, לא רק מול הברוקר.

```js
// הצפנת טוקן לפני כתיבה למסד
import { createCipheriv, randomBytes } from 'node:crypto';

function sealToken(plaintext, dek) {          // dek מגיע מ-KMS
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ct.toString('base64'),
    v: 1,                                      // גרסת סכימה לרוטציית מפתח
  };
}
```

---

## 3. סוכן ניהול סיכונים

מנוע הסיכון חייב לרוץ **בשרת**, על זרם ה-Execution Reports — לא בדפדפן. סוחר שסוגר את הטאב לא אמור לאבד את אכיפת הסיכון.

```js
class RiskEngine {
  constructor(rules) { this.rules = rules; this.state = null; }

  // נקרא על כל מילוי שמגיע מהברוקר
  onFill(fill, session) {
    const s = this.recompute(fill, session);
    const breaches = [];

    if (this.rules.dailyMaxLoss && s.dayPnl <= -this.rules.dailyMaxLoss)
      breaches.push({ code: 'DAILY_MAX_LOSS', severity: 'stop', value: s.dayPnl });

    // Trailing drawdown — נמדד מהשיא, לא מנקודת הפתיחה
    if (this.rules.trailingDD) {
      s.peak = Math.max(s.peak, s.equity);
      const dd = s.peak - s.equity;
      if (dd >= this.rules.trailingDD)
        breaches.push({ code: 'TRAILING_DD', severity: 'stop', value: dd });
      else if (dd >= this.rules.trailingDD * 0.8)
        breaches.push({ code: 'TRAILING_DD_WARN', severity: 'warn', value: dd });
    }

    if (this.rules.maxContracts && Math.abs(s.netPosition) > this.rules.maxContracts)
      breaches.push({ code: 'POSITION_SIZE', severity: 'warn' });

    // דפוס התנהגותי: הגדלת סיכון מיד אחרי הפסד
    if (session.lastFillPnl < 0 && fill.qty > session.lastFillQty)
      breaches.push({ code: 'RISK_ESCALATION', severity: 'warn' });

    return { state: s, breaches };
  }
}
```

**הבחנה שסוחרי פרופ מפספסים:** Trailing Drawdown נמדד מ**שיא ההון**, ולא מהיתרה ההתחלתית. חשבון שעלה ל-$52,000 וירד ל-$50,500 כבר ניצל $1,500 מהתקציב — גם אם הוא "ברווח". החישוב למעלה מטפל בזה נכון.

**אכיפה, לא רק התראה:** ברמת `stop` המערכת צריכה לנעול את הדשבורד, לשלוח התראה, ולסמן את היום כסגור. התראה שאפשר להתעלם ממנה אינה בקרת סיכון.

---

## 4. סוכן ניתוח ביצועים

```js
function computeMetrics(trades) {
  const wins   = trades.filter(t => t.net > 0);
  const losses = trades.filter(t => t.net < 0);

  const grossWin  = wins.reduce((s, t) => s + t.net, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net, 0));

  const winRate   = trades.length ? wins.length / trades.length : 0;
  const avgWin    = wins.length   ? grossWin  / wins.length   : 0;
  const avgLoss   = losses.length ? grossLoss / losses.length : 0;

  return {
    profitFactor: grossLoss ? grossWin / grossLoss : (grossWin ? Infinity : 0),
    winRate,
    // תוחלת לעסקה — המדד היחיד שקובע אם השיטה רווחית
    expectancy: winRate * avgWin - (1 - winRate) * avgLoss,
    // Kelly חלקי — מה גודל הסיכון שהמתמטיקה מצדיקה
    kelly: avgLoss ? winRate - (1 - winRate) / (avgWin / avgLoss) : 0,
    avgR: mean(trades.filter(t => t.riskAmount).map(t => t.net / t.riskAmount)),
  };
}
```

### זיהוי דפוסים פסיכולוגיים

| דפוס | הגדרה מדידה |
|---|---|
| Revenge Trading | עסקה תוך < 5 דק' מהפסד, בגודל > 1.5× מהקודמת |
| Over-trading | מספר עסקאות ביום > 1.6× מהחציון האישי |
| Loss Chasing | 3+ עסקאות רצופות בגודל עולה, כולן מפסידות |
| Cutting Winners | ממוצע R של הזוכות < 1.0 בעוד המפסידות ≥ 1.0 |
| Session Drift | > 30% מהעסקאות מחוץ לחלון הזמן המתוכנן |

**עיקרון:** לזהות מנתונים אמיתיים בלבד, לא מהצהרות. הסוחר לא ידווח על Revenge Trading — החותם שלו בזמנים ובגדלים כן.

---

## 5. סוכן UI & UX

### הדשבורד בזמן מסחר — קריאה בשלוש שניות

היררכיה: **סטטוס חיבור → סיכון שנותר → P&L → פוזיציות → היסטוריה**.

מחוון חיבור שאומר את האמת:
```
🟢 מחובר · עדכון אחרון לפני 2 שניות
🟡 מתחבר מחדש… ניסיון 2 מתוך 5
🔴 מנותק · נתונים מ-14:32 · [חבר מחדש]
```

**חוק ברזל:** כשהחיבור מת — הנתונים על המסך מקבלים חיווי "לא עדכני" ומועמעים. סוחר שמקבל החלטה על סמך P&L תקוע מ-14:32 בלי לדעת — זה הכשל החמור ביותר שמערכת כזו יכולה לייצר.

תקציב הסיכון כבר-התקדמות, לא כמספר:
```
סיכון יומי  ████████████░░░░░░  $840 / $1,200
                                נותרו $360
```

### היגיינת זמן אמת

- **Throttle לרינדור**: עדכוני WS מצטברים ומרונדרים ב-`requestAnimationFrame`, לא בכל הודעה. 20 מילויים בשנייה לא אמורים לגרום ל-20 רינדורים.
- **התאוששות אופטימית**: בניתוק — להציג מיד את המצב האחרון הידוע עם חותמת זמן, ולא מסך ריק.
- **מובייל**: סטטוס + סיכון + P&L בלבד. פירוט העסקאות בגלילה.

---

## 6. ההחלטה המשותפת

```
שלב 0  (חובה לפני הכל)
  שרת מינימלי — Cloud Run / Fly.io / Railway
  Firebase Auth כזהות, השרת מאמת את ה-ID token
  כספת סודות (KMS + Secret Manager)

שלב 1  Tradovate
  OAuth/Login בצד שרת · טוקנים מוצפנים · WS גייטוויי
  היסטוריית מילויים → הז'ורנל הקיים

שלב 2  סיכון בזמן אמת
  RiskEngine על זרם המילויים · אכיפה · התראות

שלב 3  אנליטיקה
  מדדים + זיהוי דפוסים על נתונים אמיתיים

שלב 4  Rithmic
  רק אחרי הסכם + Conformance
```

### מחסנית מומלצת

| רכיב | בחירה | נימוק |
|---|---|---|
| Runtime | Node 20 + TypeScript | אותה שפה כמו הלקוח |
| אירוח | Cloud Run | חיבורי WS ארוכים, סקיילינג לאפס |
| מסד | Firestore (קיים) + Postgres לעסקאות | Firestore לא מתאים לאגרגציות כבדות |
| סודות | Google Secret Manager + KMS | הצפנה מנוהלת |
| לקוח→שרת | SSE | פשוט יותר מ-WS, מספיק לכיוון אחד |

---

## 7. הציונים

| סוכן | תחום | לפני | אחרי התוכנית |
|---|---|---|---|
| אבטחה | סודות וסשנים | **2** | 9 |
| אינטגרציות | חיבור ושגיאות | 3 | 8 |
| סיכונים | אכיפה בזמן אמת | 2 | 8 |
| אנליטיקה | מדדים ודפוסים | 6 | 9 |
| UI/UX | דשבורד לייב | 5 | 8 |
| | **משוקלל** | **3.6** | **8.4** |

---

## 8. מה שצריך להיעשות עכשיו, לפני הכל

הקוד הקיים ב-`tvConnect()` שולח סיסמה ו-API Secret מהדפדפן.

**עד שהשרת קיים — יש לנטרל את מסך החיבור הזה.** לא להשאיר אותו "לא מקושר": משתמש שימצא אותו ויזין פרטים אמיתיים חושף את חשבון המסחר שלו.

זו ההמלצה היחידה במסמך שדחופה לפני כל פיתוח.
