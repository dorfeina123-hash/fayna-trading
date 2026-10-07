(function(){
'use strict';
const zones=['Asia/Jerusalem','America/New_York','America/Chicago','Etc/UTC'];
function dateParts(v){
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v||'');
  if(!m) throw Error('יש למלא תאריך ושעה מלאים לכניסה וליציאה.');
  const p=m.slice(1).map(x=>Number(x||0));
  const d=new Date(Date.UTC(p[0],p[1]-1,p[2],p[3],p[4],p[5]));
  if(d.getUTCFullYear()!==p[0]||d.getUTCMonth()+1!==p[1]||d.getUTCDate()!==p[2]||p[3]>23||p[4]>59||p[5]>59) throw Error('תאריך או שעה אינם תקינים.');
  return p;
}
function build(o){
  if(!zones.includes(o.zone)) throw Error('בחר את אזור הזמן של שעות העסקה בקובץ המקורי.');
  if(!['long','short'].includes(o.direction)) throw Error('בחר את כיוון העסקה.');
  const a=dateParts(o.entryTime),b=dateParts(o.exitTime);
  if(Date.UTC(...[b[0],b[1]-1,...b.slice(2)])<Date.UTC(...[a[0],a[1]-1,...a.slice(2)])) throw Error('היציאה חייבת להיות אחרי הכניסה.');
  for(const k of ['entry','exit','qty']) if(o[k]===''||!Number.isFinite(Number(o[k]))) throw Error('יש למלא מחירים וכמות תקינים.');
  if(Number(o.qty)<=0) throw Error('הכמות חייבת להיות חיובית.');
  const symbol=String(o.symbol||'').trim().toUpperCase();
  if(!/^[A-Z0-9_!:./-]+$/.test(symbol)) throw Error('סימול הגרף אינו תקין.');
  const quote=JSON.stringify;
  const buy=o.direction==='long';
  return `//@version=6
indicator("Fayna trade markers", overlay=true, max_labels_count=2, max_lines_count=1)
int entryTime = timestamp(${quote(o.zone)}, ${a.join(', ')})
int exitTime = timestamp(${quote(o.zone)}, ${b.join(', ')})
float entryPrice = ${Number(o.entry)}
float exitPrice = ${Number(o.exit)}
if barstate.isfirst
    if syminfo.tickerid != ${quote(symbol)}
        runtime.error("Open the trade symbol: " + ${quote(symbol)})
    label.new(entryTime, entryPrice, ${quote((buy?'BUY':'SELL')+' ENTRY | Qty '+Number(o.qty)+' | '+Number(o.entry))}, xloc=xloc.bar_time, yloc=yloc.price, style=label.style_label_up, color=color.teal, textcolor=color.white)
    label.new(exitTime, exitPrice, ${quote((buy?'SELL':'BUY')+' EXIT | '+Number(o.exit))}, xloc=xloc.bar_time, yloc=yloc.price, style=label.style_label_down, color=color.orange, textcolor=color.white)
    line.new(entryTime, entryPrice, exitTime, exitPrice, xloc=xloc.bar_time, color=color.gray, style=line.style_dashed)
`;
}
function open(t,symbol){
  if(!t) return;
  document.getElementById('fayna-marker-dialog')?.remove();
  const d=document.createElement('dialog');d.id='fayna-marker-dialog';d.dir='rtl';
  d.style.cssText='width:min(620px,90vw);max-height:88vh;overflow:auto;background:var(--bg2,#202427);color:var(--t1,#eee);border:1px solid var(--border2,#555);border-radius:16px;padding:24px;font-family:inherit';
  d.innerHTML=`<form><h2 style="margin-top:0">סימון העסקה ב־TradingView</h2>
    <p>הכנת סימוני כניסה ויציאה לגרף החיצוני. לאחר ההעתקה, פתח את Pine Editor ב־TradingView, הדבק את הקוד בסקריפט חדש ובחר Add to chart. עבור לתאריך העסקה בגרף.</p>
    <p>בדוק את הכיוון והשעות מול הדוח המקורי. אזור הזמן הוא של הדוח, ולא בהכרח של המחשב.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">
    <label>סימול TradingView<input name="symbol" required dir="ltr"></label>
    <label>כיוון<select name="direction" required><option value="">בחר כיוון</option><option value="long">Long — קנייה בכניסה</option><option value="short">Short — מכירה בכניסה</option></select></label>
    <label>אזור זמן<select name="zone" required><option value="">בחר אזור זמן</option><option value="Asia/Jerusalem">ישראל</option><option value="America/New_York">ניו יורק</option><option value="America/Chicago">שיקגו</option><option value="Etc/UTC">UTC</option></select></label>
    <label>כמות<input name="qty" type="number" step="any" required></label>
    <label>זמן כניסה<input name="entryTime" type="datetime-local" step="1" required></label>
    <label>זמן יציאה<input name="exitTime" type="datetime-local" step="1" required></label>
    <label>מחיר כניסה<input name="entry" type="number" step="any" required></label>
    <label>מחיר יציאה<input name="exit" type="number" step="any" required></label></div>
    <p role="status" id="marker-status"></p>
    <button type="submit" class="btn-p">הכן סימונים</button> <button type="button" id="marker-close" class="bn">סגירה</button>
    <section id="marker-result" hidden><p>1. העתק את הקוד. 2. פתח את הגרף. 3. הדבק ב־Pine Editor והוסף לגרף.</p>
    <textarea aria-label="קוד סימוני העסקה" readonly dir="ltr" style="width:100%;height:150px"></textarea>
    <button type="button" id="marker-copy" class="btn-p">העתק קוד</button> <a id="marker-link" target="_blank" rel="noopener noreferrer">פתח גרף ב־TradingView</a>
    <p>נדרשת גישה ל־Pine Editor ולנתוני הנכס בחשבון TradingView. הסימונים מופיעים בגרף החיצוני, ולא בגרף המוטמע באתר.</p></section></form>`;
  const form=d.querySelector('form'),field=k=>form.elements.namedItem(k),status=d.querySelector('#marker-status'),result=d.querySelector('#marker-result');
  for(const el of d.querySelectorAll('input,select,textarea')) el.style.cssText+=';display:block;box-sizing:border-box;width:100%;margin-top:5px;padding:8px;background:var(--bg3,#292e32);color:inherit;border:1px solid var(--border2,#555);border-radius:7px;font:inherit';
  field('symbol').value=symbol;field('qty').value=t.qty||'';
  field('entryTime').value=t.date&&t.btime?t.date+'T'+t.btime:'';
  // ATAS imports historically did not retain the closing date. Ask for it rather than assume same-day.
  field('exitTime').value=t.exitDate&&t.stime?t.exitDate+'T'+t.stime:'';
  if(t.dir==='long'||t.dir==='short')field('direction').value=t.dir;
  const prices=()=>{const dir=field('direction').value;field('entry').value=dir?(dir==='long'?t.buy:t.sell):'';field('exit').value=dir?(dir==='long'?t.sell:t.buy):'';};prices();
  field('direction').addEventListener('change',prices);
  form.addEventListener('input',()=>{result.hidden=true;status.textContent='';});
  form.addEventListener('submit',e=>{e.preventDefault();try{const o=Object.fromEntries(new FormData(form));d.querySelector('textarea').value=build(o);d.querySelector('#marker-link').href='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(o.symbol);result.hidden=false;status.textContent='הסימונים מוכנים להעתקה.';}catch(err){status.textContent=err.message;result.hidden=true;}});
  d.querySelector('#marker-copy').onclick=async()=>{const area=d.querySelector('textarea');try{await navigator.clipboard.writeText(area.value);status.textContent='הקוד הועתק. פתח את הגרף והדבק ב־Pine Editor.';}catch{area.focus();area.select();status.textContent='בחר העתקה ידנית של הקוד המסומן.';}};
  d.querySelector('#marker-close').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());
  document.body.appendChild(d);d.showModal();
}
if(typeof window!=='undefined')window.FaynaTradeMarkers={open,build};
if(typeof module!=='undefined')module.exports={build,dateParts};
})();
