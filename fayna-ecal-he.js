/* v115 — Hebrew names for economic-calendar events.
   ForexFactory publishes titles in English ("Core CPI m/m", "FOMC Member Waller Speaks").
   t(title) returns the Hebrew name: an exact dictionary for the recurring releases,
   rules for period markers (m/m, y/y, q/q), release stages (Prelim, Flash, Final),
   country prefixes and speeches. Unknown titles come back unchanged, so nothing is
   ever lost; the table shows the English original underneath for reference. */
(function (root) {
  'use strict';

  const BASE = {
    'non-farm employment change': 'משרות חדשות במגזר הלא חקלאי (NFP)',
    'adp non-farm employment change': 'דוח התעסוקה של ADP',
    'unemployment rate': 'שיעור האבטלה',
    'unemployment claims': 'תביעות ראשונות לדמי אבטלה',
    'continuing jobless claims': 'תביעות נמשכות לדמי אבטלה',
    'average hourly earnings': 'שכר שעתי ממוצע',
    'jolts job openings': 'משרות פנויות (JOLTS)',
    'challenger job cuts': 'פיטורים מתוכננים (Challenger)',
    'employment cost index': 'מדד עלות העבודה',
    'nonfarm productivity': 'פריון העבודה',
    'unit labor costs': 'עלות עבודה ליחידה',
    'employment change': 'שינוי בתעסוקה',
    'claimant count change': 'שינוי במספר מקבלי דמי אבטלה',
    'cpi': 'מדד המחירים לצרכן',
    'core cpi': 'מדד המחירים לצרכן ליבה',
    'ppi': 'מדד המחירים ליצרן',
    'core ppi': 'מדד המחירים ליצרן ליבה',
    'pce price index': 'מדד מחירי ההוצאה לצריכה פרטית (PCE)',
    'core pce price index': 'מדד PCE ליבה',
    'import prices': 'מחירי יבוא',
    'export prices': 'מחירי יצוא',
    'retail sales': 'מכירות קמעונאיות',
    'core retail sales': 'מכירות קמעונאיות ליבה',
    'gdp': 'תוצר מקומי גולמי',
    'trimmed mean cpi': 'מדד המחירים לצרכן – ממוצע מקוצץ',
    'median cpi': 'מדד המחירים לצרכן – חציוני',
    'gdp price index': 'מדד מחירי התוצר',
    'federal funds rate': 'החלטת הריבית של הפד',
    'fomc statement': 'הודעת הפד (FOMC)',
    'fomc press conference': 'מסיבת העיתונאים של הפד',
    'fomc meeting minutes': 'פרוטוקול ישיבת הפד',
    'fomc economic projections': 'תחזיות כלכליות של הפד',
    'beige book': 'הספר הבז\' של הפד',
    'ism manufacturing pmi': 'מדד מנהלי הרכש ISM – תעשייה',
    'ism services pmi': 'מדד מנהלי הרכש ISM – שירותים',
    'ism manufacturing prices': 'ISM תעשייה – מחירים',
    'ism services prices': 'ISM שירותים – מחירים',
    'manufacturing pmi': 'מדד מנהלי הרכש – תעשייה',
    'services pmi': 'מדד מנהלי הרכש – שירותים',
    'composite pmi': 'מדד מנהלי הרכש המשולב',
    'chicago pmi': 'מדד מנהלי הרכש של שיקגו',
    'empire state manufacturing index': 'מדד הייצור של ניו יורק (Empire State)',
    'philly fed manufacturing index': 'מדד הייצור של פד פילדלפיה',
    'richmond manufacturing index': 'מדד הייצור של פד ריצ\'מונד',
    'industrial production': 'ייצור תעשייתי',
    'capacity utilization rate': 'ניצול כושר הייצור',
    'factory orders': 'הזמנות מפעלים',
    'durable goods orders': 'הזמנות מוצרים בני קיימא',
    'core durable goods orders': 'הזמנות מוצרים בני קיימא ליבה',
    'business inventories': 'מלאים עסקיים',
    'wholesale inventories': 'מלאי סיטונאים',
    'uom consumer sentiment': 'אמון הצרכנים של אוניברסיטת מישיגן',
    'uom inflation expectations': 'ציפיות האינפלציה של אוניברסיטת מישיגן',
    'cb consumer confidence': 'אמון הצרכנים (Conference Board)',
    'personal income': 'הכנסה אישית',
    'personal spending': 'הוצאה אישית',
    'consumer credit': 'אשראי צרכני',
    'building permits': 'היתרי בנייה',
    'housing starts': 'התחלות בנייה',
    'existing home sales': 'מכירות בתים קיימים',
    'new home sales': 'מכירות בתים חדשים',
    'pending home sales': 'עסקאות בתים ממתינות',
    'construction spending': 'הוצאות בנייה',
    'hpi': 'מדד מחירי הדירות',
    's&p/cs composite-20 hpi': 'מדד מחירי הדירות קייס־שילר',
    'nahb housing market index': 'מדד שוק הדיור (NAHB)',
    'trade balance': 'מאזן הסחר',
    'current account': 'החשבון השוטף',
    'federal budget balance': 'מאזן התקציב הפדרלי',
    'tic long-term purchases': 'רכישות זרים לטווח ארוך (TIC)',
    'crude oil inventories': 'מלאי נפט גולמי',
    'natural gas storage': 'מלאי גז טבעי',
    'treasury currency report': 'דוח המטבעות של משרד האוצר',
    'bank holiday': 'חג בנקים',
    'daylight saving time shift': 'מעבר שעון קיץ/חורף',
    'presidential election': 'בחירות לנשיאות',
    'parliamentary elections': 'בחירות לפרלמנט',
    'main refinancing rate': 'החלטת הריבית של הבנק המרכזי האירופי',
    'monetary policy statement': 'הודעת המדיניות המוניטרית',
    'ecb press conference': 'מסיבת העיתונאים של הבנק המרכזי האירופי',
    'ecb monetary policy meeting accounts': 'פרוטוקול ישיבת הבנק המרכזי האירופי',
    'official bank rate': 'החלטת הריבית של בנק אנגליה',
    'mpc official bank rate votes': 'הצבעות ועדת הריבית של בנק אנגליה',
    'boj policy rate': 'החלטת הריבית של בנק יפן',
    'boj press conference': 'מסיבת העיתונאים של בנק יפן',
    'cash rate': 'החלטת הריבית של בנק אוסטרליה',
    'rba rate statement': 'הודעת בנק אוסטרליה',
    'overnight rate': 'החלטת הריבית של בנק קנדה',
    'boc rate statement': 'הודעת בנק קנדה',
    'snb policy rate': 'החלטת הריבית של הבנק המרכזי של שווייץ',
    'official cash rate': 'החלטת הריבית של בנק ניו זילנד',
    'rbnz rate statement': 'הודעת בנק ניו זילנד',
    'ifo business climate': 'מדד האקלים העסקי (Ifo)',
    'zew economic sentiment': 'מדד הסנטימנט הכלכלי (ZEW)',
    'gfk consumer climate': 'מדד אקלים הצרכנים (GfK)',
    'tankan manufacturing index': 'מדד טנקאן – תעשייה',
    'caixin manufacturing pmi': 'מדד מנהלי הרכש Caixin – תעשייה',
    'caixin services pmi': 'מדד מנהלי הרכש Caixin – שירותים',
    'ivey pmi': 'מדד מנהלי הרכש Ivey',
    '10-y bond auction': 'מכרז אג"ח ל־10 שנים',
    '30-y bond auction': 'מכרז אג"ח ל־30 שנים',
    '5-y bond auction': 'מכרז אג"ח ל־5 שנים',
    '2-y bond auction': 'מכרז אג"ח לשנתיים',
    '3-y bond auction': 'מכרז אג"ח ל־3 שנים',
    '7-y bond auction': 'מכרז אג"ח ל־7 שנים',
    'g7 meetings': 'פגישות G7',
    'g20 meetings': 'פגישות G20',
    'opec-jmmc meetings': 'פגישות אופ"ק',
    'opec meetings': 'פגישות אופ"ק',
    'mi inflation gauge': 'מדד האינפלציה של מלבורן',
    'building approvals': 'אישורי בנייה',
    'building consents': 'אישורי בנייה',
    'ratingdog manufacturing pmi': 'מדד מנהלי הרכש RatingDog – תעשייה',
    'ratingdog services pmi': 'מדד מנהלי הרכש RatingDog – שירותים',
    'commodity prices': 'מחירי סחורות',
    'anz commodity prices': 'מחירי סחורות (ANZ)',
    'loan officer survey': 'סקר קציני אשראי של הפד',
    'rba monetary policy statement': 'דוח המדיניות המוניטרית של בנק אוסטרליה',
    'gov budget balance': 'מאזן התקציב הממשלתי',
    'rcm/tipp economic optimism': 'מדד האופטימיות הכלכלית (RCM/TIPP)',
    'omdia total vehicle sales': 'מכירות כלי רכב',
    'congressional elections': 'בחירות לקונגרס',
    'gdt price index': 'מדד מחירי החלב העולמי (GDT)',
    'api weekly statistical bulletin': 'מלאי נפט שבועי (API)',
    'labor cost index': 'מדד עלות העבודה',
    'monetary base': 'הבסיס המוניטרי',
    'household spending': 'הוצאות משקי בית',
    'unemployment change': 'שינוי במספר המובטלים',
    'core cpi flash estimate': 'מדד המחירים לצרכן ליבה (אומדן מהיר)',
    'cpi flash estimate': 'מדד המחירים לצרכן (אומדן מהיר)',
    'monetary policy meeting minutes': 'פרוטוקול ישיבת המדיניות המוניטרית',
    'goods trade balance': 'מאזן סחר הסחורות',
    'construction pmi': 'מדד מנהלי הרכש – בנייה',
    'boe monetary policy report': 'דוח המדיניות המוניטרית של בנק אנגליה',
    'monetary policy summary': 'סיכום המדיניות המוניטרית',
    'annual budget release': 'פרסום התקציב השנתי',
    'average cash earnings': 'שכר ממוצע',
    'lloyds hpi': 'מדד מחירי הדירות (Lloyds)',
    'foreign currency reserves': 'יתרות מטבע חוץ',
    'seco consumer climate': 'מדד אקלים הצרכנים של שווייץ',
    'jackson hole symposium': 'כנס ג\'קסון הול',
  };
  const PERIOD = { 'm/m': 'חודשי', 'y/y': 'שנתי', 'q/q': 'רבעוני', '3m/y': '3 חודשים בשנה', '3m/3m': '3 חודשים' };
  const STAGE = { prelim: 'ראשוני', flash: 'ראשוני מהיר', final: 'סופי', revised: 'מעודכן', advance: 'מוקדם', second: 'שני', third: 'שלישי', trimmed: 'מקוצץ', median: 'חציוני' };
  const COUNTRY = { german: 'גרמניה', french: 'צרפת', italian: 'איטליה', spanish: 'ספרד', 'eu economic': 'אירופה', chinese: 'סין', japanese: 'יפן' };
  const PEOPLE = {
    powell: 'פאוול', waller: 'וולר', bowman: 'באומן', jefferson: 'ג\'פרסון', williams: 'ויליאמס', barr: 'בר', cook: 'קוק',
    goolsbee: 'גולסבי', logan: 'לוגן', kashkari: 'קשקרי', daly: 'דיילי', hammack: 'האמק', musalem: 'מוסאלם', schmid: 'שמיד',
    bostic: 'בוסטיק', barkin: 'בארקין', harker: 'הארקר', collins: 'קולינס', kugler: 'קוגלר', miran: 'מירן', paulson: 'פולסון',
    lagarde: 'לגארד', bailey: 'ביילי', ueda: 'אואדה', bullock: 'בולוק', macklem: 'מקלם', orr: 'אור', schlegel: 'שלגל',
    hauser: 'האוזר', tschudin: 'צ\'ודין', pill: 'פיל', breeden: 'ברידן', lombardelli: 'לומברדלי', greene: 'גרין', mann: 'מאן', dhingra: 'דינגרה', taylor: 'טיילור',
    rogers: 'רוג\'רס', himino: 'הימינו', hunter: 'האנטר', kent: 'קנט', guindos: 'דה גינדוס', cipollone: 'צ\'יפולונה', elderson: 'אלדרסון', martin: 'מרטין', hawkesby: 'הוקסבי', conway: 'קונוויי',
    trump: 'טראמפ', bessent: 'בסנט', yellen: 'ילן', lane: 'ליין', schnabel: 'שנאבל', nagel: 'נאגל',
  };
  const ROLE = [
    [/^fed chair(?:man)?\s+/i, 'יו"ר הפד '], [/^fed vice chair(?: for supervision)?\s+/i, 'סגן יו"ר הפד '], [/^fed governor\s+/i, 'נגיד בפד '],
    [/^fomc member\s+/i, 'חבר הפד '], [/^ecb president\s+/i, 'נשיאת הבנק המרכזי האירופי '], [/^boe gov(?:ernor)?\s+/i, 'נגיד בנק אנגליה '],
    [/^boj gov(?:ernor)?\s+/i, 'נגיד בנק יפן '], [/^rba gov(?:ernor)?\s+/i, 'נגידת בנק אוסטרליה '], [/^boc gov(?:ernor)?\s+/i, 'נגיד בנק קנדה '],
    [/^rbnz gov(?:ernor)?\s+/i, 'נגיד בנק ניו זילנד '], [/^snb chairman\s+/i, 'יו"ר הבנק המרכזי של שווייץ '], [/^president\s+/i, 'הנשיא '],
    [/^treasury secretary\s+/i, 'שר האוצר '],
    [/^german buba president\s+/i, 'נשיא הבונדסבנק '], [/^rba deputy gov(?:ernor)?\s+/i, 'סגן נגידת בנק אוסטרליה '], [/^rba assist gov\s+/i, 'עוזר נגידת בנק אוסטרליה '],
    [/^boe deputy gov(?:ernor)?\s+/i, 'סגן נגיד בנק אנגליה '], [/^boc deputy gov(?:ernor)?\s+/i, 'סגן נגיד בנק קנדה '], [/^boj deputy gov(?:ernor)?\s+/i, 'סגן נגיד בנק יפן '],
    [/^rbnz deputy gov(?:ernor)?\s+/i, 'סגן נגיד בנק ניו זילנד '], [/^mpc member\s+/i, 'חבר ועדת הריבית של בנק אנגליה '], [/^gov board member\s+/i, 'חבר הנהלת הבנק המרכזי של שווייץ '],
    [/^ecb vice president\s+/i, 'סגן נשיאת הבנק המרכזי האירופי '], [/^ecb chief economist\s+/i, 'הכלכלן הראשי של הבנק המרכזי האירופי '], [/^ecb executive board member\s+/i, 'חבר הנהלת הבנק המרכזי האירופי '],
    [/^(rba)$/i, 'בנק אוסטרליה'], [/^(boe)$/i, 'בנק אנגליה'], [/^(boj)$/i, 'בנק יפן'], [/^(boc)$/i, 'בנק קנדה'], [/^(ecb)$/i, 'הבנק המרכזי האירופי'], [/^(snb)$/i, 'הבנק המרכזי של שווייץ'], [/^(rbnz)$/i, 'בנק ניו זילנד'], [/^(fomc)$/i, 'הפד'],
    [/^ecb\s+/i, 'הבנק המרכזי האירופי '],
  ];
  const cache = new Map();

  function person(s) {
    let out = s.trim(), role = '';
    for (const [rx, he] of ROLE) if (rx.test(out)) { role = he; out = out.replace(rx, ''); break; }
    const name = out.split(/\s+/).map(w => PEOPLE[w.toLowerCase()] || w).join(' ');
    if (!role && /^טראמפ$/.test(name)) role = 'הנשיא ';
    return role + name;
  }

  function t(title) {
    const raw = String(title || '').trim();
    if (!raw) return raw;
    if (cache.has(raw)) return cache.get(raw);
    let out = raw;
    const sp = /^(.*?)\s+(Speaks|Testifies|Press Conference)$/i.exec(raw);
    if (sp && !BASE[raw.toLowerCase()]) {
      const verb = { speaks: 'נאום', testifies: 'עדות בקונגרס של', 'press conference': 'מסיבת עיתונאים של' }[sp[2].toLowerCase()];
      out = `${verb} ${person(sp[1])}`;
    } else {
      let s = raw, period = '', stages = [], country = '';
      const pm = /\s+(m\/m|y\/y|q\/q|3m\/y|3m\/3m)$/i.exec(s);
      if (pm) { period = PERIOD[pm[1].toLowerCase()]; s = s.slice(0, pm.index); }
      for (const [k, he] of Object.entries(COUNTRY)) { const rx = new RegExp('^' + k + '\\s+', 'i'); if (rx.test(s)) { country = he; s = s.replace(rx, ''); break; } }
      let m;
      while ((m = /^(prelim|flash|final|revised|advance|second|third)\s+/i.exec(s))) { stages.push(STAGE[m[1].toLowerCase()]); s = s.slice(m[0].length); }
      const tm = /^(trimmed|median)\s+(.*)$/i.exec(s);
      if (tm && BASE[tm[2].toLowerCase()]) { stages.push(STAGE[tm[1].toLowerCase()]); s = tm[2]; }
      const base = BASE[s.toLowerCase()];
      if (base) {
        const tags = [...stages, period].filter(Boolean);
        out = (country ? country + ': ' : '') + base + (tags.length ? ` (${tags.join(', ')})` : '');
      }
    }
    cache.set(raw, out);
    return out;
  }
  const CUR_HE = { USD: 'ארה"ב', EUR: 'גוש האירו', GBP: 'בריטניה', JPY: 'יפן', AUD: 'אוסטרליה', CAD: 'קנדה', CHF: 'שווייץ', NZD: 'ניו זילנד', CNY: 'סין', All: 'עולמי' };
  const api = { t, country: c => CUR_HE[c] || c, translated: x => !/[A-Za-z]{3,}/.test(t(x).replace(/\((?:[A-Z0-9/&-]+|RCM\/TIPP|Challenger|Lloyds|RatingDog|Caixin|Ivey|Ifo|ZEW|GfK|JOLTS|API|ANZ|GDT|NFP|PCE|NAHB|TIC|Empire State|Conference Board)\)/g, '').replace(/\b(ISM|PMI|ADP|RatingDog|Caixin|Ivey|PCE|JOLTS|FOMC|G7|G20|RBA)\b/g, '')) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FaynaEcalHe = api;
})(typeof window !== 'undefined' ? window : globalThis);
