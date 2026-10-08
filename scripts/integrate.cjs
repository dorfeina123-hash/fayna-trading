const fs=require('node:fs');
let h=fs.readFileSync('dor_trading_v74.html','utf8');
h=h.replace('</head>','<link rel="stylesheet" href="saas-design.css?v=75">\n<script defer src="saas-dashboard.js?v=75"></script>\n</head>');
h=h.replace("  root.querySelectorAll('[data-home-nav]')", "  if(typeof SaasDashboard!=='undefined')SaasDashboard.decorate(root,model,rows,now,tradeNet);\n  root.querySelectorAll('[data-home-nav]')");
h=h.replace('כל המסחר שלך. במבט אחד.','מרכז השליטה').replace('תמונת מצב קצרה, והפעולה הבאה שלך.','הביצועים שלך לפי העסקאות הרשומות ביומן.');
const start=h.indexOf('function _tradeSpark(t, ti) {'),end=h.indexOf('\n// ═',start);
if(start<0||end<0)throw Error('Missing spark function');
h=h.slice(0,start)+`function _tradeSpark(t, ti) {
  return '<button type="button" class="bn" onclick="openTradeChart('+ti+')" aria-label="פתיחת גרף הנכס">גרף נכס</button>';
}
`+h.slice(end);
fs.writeFileSync('index.html',h);fs.writeFileSync('dor_trading_v75.html',h);
