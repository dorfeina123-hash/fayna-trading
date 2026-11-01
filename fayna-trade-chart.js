/* Candles with the trade marked on them. Lightweight Charts draws; the market-data branch
   supplies the bars (scripts/fetch_candles.py). No account, no key, and nothing is saved. */
(function(root){
'use strict';
const DATA='https://raw.githubusercontent.com/dorfeina123-hash/fayna-trading/market-data/';
const LIB='https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';
// label, saved file it is built from, seconds per bar
const VIEWS=[['1m','1m',60],['5m','5m',300],['15m','5m',900],['30m','5m',1800],['1h','1h',3600],['4h','1h',14400]];
const BASE={'1m':60,'5m':300,'1h':3600};
const rootOf=sym=>/^(MNQ|NQ|MES|ES)(?:[FGHJKMNQUVXZ]\d{1,4}|1!)?(?:@\w+)?$/.exec(String(sym||'').trim().toUpperCase())?.[1]||null;
// ATAS journals carry a fixed UTC+2 clock. Other reports are read as the viewer's local time.
function epoch(date,time,offsetMin){
  if(!date||!time) return null;
  const [y,m,d]=date.split('-').map(Number),[H,M,S]=time.split(':').map(Number);
  if(offsetMin==null) return Math.floor(new Date(y,m-1,d,H,M,S||0).getTime()/1000);
  return Date.UTC(y,m-1,d,H,M,S||0)/1000-offsetMin*60;
}
function tradeTimes(t){
  const offset=t.src==='ATAS Journal'?120:null,entry=epoch(t.date,t.btime,offset);
  let exit=t.stime?epoch(t.exitDate||t.date,t.stime,offset):null;
  if(exit!=null&&entry!=null&&exit<entry) exit+=86400; // no saved exit date and the clock wrapped past midnight
  return {entry,exit};
}
function monthsFor(from,to){
  const start=new Date(from*1000),end=new Date(to*1000),out=[];
  const d=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));
  while(d<=end){out.push(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()+1);}
  return out;
}
const barAt=(bars,ts,step)=>bars.find(b=>b[0]<=ts&&ts<b[0]+step)||null;
// Larger bars are built from the saved ones: first open, highest high, lowest low, last close.
function aggregate(bars,step){
  const out=new Map();
  bars.forEach(b=>{
    const t=b[0]-b[0]%step,bar=out.get(t);
    if(!bar){out.set(t,[t,b[1],b[2],b[3],b[4],b[5]]);return;}
    bar[2]=Math.max(bar[2],b[2]);bar[3]=Math.min(bar[3],b[3]);bar[4]=b[4];bar[5]+=b[5];
  });
  return [...out.values()];
}
async function loadBars(sym,interval,from,to){
  const parts=await Promise.all(monthsFor(from,to).map(async m=>{
    const r=await fetch(DATA+sym+'/'+interval+'/'+m+'.json');
    return r.ok?r.json():[];
  }));
  return parts.flat();
}
function loadLibrary(){
  if(root.LightweightCharts) return Promise.resolve();
  return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=LIB;s.onload=resolve;s.onerror=()=>reject(new Error('chart library failed'));document.head.appendChild(s);});
}
async function render(el,t,dir){
  const sym=rootOf(t.sym),{entry,exit}=tradeTimes(t);
  if(!sym||entry==null) return null;
  const last=exit||entry,saved={};
  await Promise.all(Object.keys(BASE).map(async name=>{saved[name]=await loadBars(sym,name,entry-14*86400,last+14*86400);}));
  const views=VIEWS.filter(([,base])=>barAt(saved[base],entry,BASE[base]));
  if(!views.length) return null;
  await loadLibrary();
  el.innerHTML=`<div style="display:flex;flex-direction:column;height:100%"><div data-bar style="display:flex;align-items:center;gap:4px;padding:6px 10px;flex-shrink:0"></div><div data-plot style="flex:1;min-height:0"></div></div>`;
  const toolbar=el.querySelector('[data-bar]'),css=getComputedStyle(document.documentElement);
  // Lightweight Charts draws UTC, so bars move to the viewer's clock.
  const view=ts=>ts-new Date(ts*1000).getTimezoneOffset()*60;
  const chart=root.LightweightCharts.createChart(el.querySelector('[data-plot]'),{autoSize:true,
    layout:{background:{color:'transparent'},textColor:css.getPropertyValue('--t2').trim()||'#9aa3af',attributionLogo:true},
    grid:{vertLines:{color:'rgba(128,128,128,.08)'},horzLines:{color:'rgba(128,128,128,.08)'}},
    timeScale:{timeVisible:true,secondsVisible:false},rightPriceScale:{borderVisible:false}});
  const series=chart.addCandlestickSeries({upColor:'#27a065',downColor:'#e04545',wickUpColor:'#27a065',wickDownColor:'#e04545',borderVisible:false});
  const side=dir==='short'?'SHORT':dir==='long'?'LONG':'';
  const entryPrice=dir==='short'?t.sell:dir==='long'?t.buy:null,exitPrice=dir==='short'?t.buy:dir==='long'?t.sell:null;
  const line=(price,title,lineColor)=>{if(price)series.createPriceLine({price,color:lineColor,lineWidth:1,lineStyle:2,axisLabelVisible:true,title});};
  line(entryPrice,side||'Entry','#2f9bff');line(exitPrice,'Exit','#f5a524');line(Number(t.stopLoss)||null,'Stop','#e04545');
  const sideColor=dir==='short'?'#e04545':dir==='long'?'#27a065':'#8b95a3';
  function show(name){
    const [,base,step]=VIEWS.find(v=>v[0]===name),bars=step===BASE[base]?saved[base]:aggregate(saved[base],step);
    series.setData(bars.map(b=>({time:view(b[0]),open:b[1],high:b[2],low:b[3],close:b[4]})));
    const point=(ts,text,above,color)=>({time:view(barAt(bars,ts,step)[0]),position:above?'aboveBar':'belowBar',shape:above?'arrowDown':'arrowUp',color,text});
    const marks=[point(entry,(side||'Entry')+(entryPrice?' '+entryPrice:''),dir==='short',sideColor)];
    if(exit&&barAt(bars,exit,step)) marks.push(point(exit,'Exit'+(exitPrice?' '+exitPrice:''),dir==='long','#f5a524'));
    series.setMarkers(marks.sort((a,b)=>a.time-b.time));
    chart.timeScale().setVisibleRange({from:view(entry-40*step),to:view(last+40*step)});
    toolbar.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===name;b.setAttribute('aria-pressed',on);b.style.background=on?'var(--ac)':'transparent';b.style.color=on?'#fff':'var(--t2)';});
  }
  toolbar.innerHTML=`<span style="padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;color:#fff;background:${sideColor};margin-inline-end:8px">${side||'כיוון לא ידוע'}</span>`+
    VIEWS.map(([name])=>`<button type="button" data-view="${name}" ${views.some(v=>v[0]===name)?'':'disabled title="אין נרות כאלה לתאריך הזה"'} style="padding:3px 9px;border:1px solid var(--border2);border-radius:6px;background:transparent;color:var(--t2);font:inherit;font-size:12px;cursor:pointer">${name}</button>`).join('');
  toolbar.querySelectorAll('[data-view]:not([disabled])').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
  toolbar.querySelectorAll('[data-view][disabled]').forEach(b=>{b.style.opacity='.35';b.style.cursor='default';});
  const start=views.find(v=>v[0]==='5m')||views[0];
  show(start[0]);
  const bar=barAt(saved[start[1]],entry,BASE[start[1]]),miss=entryPrice?Math.max(bar[3]-entryPrice,entryPrice-bar[2],0):0;
  return {miss,symbol:sym,destroy:()=>{chart.remove();el.innerHTML='';}};
}
root.FaynaTradeChart={supports:t=>!!rootOf(t&&t.sym)&&!t.isManual,render};
if(typeof module!=='undefined')module.exports={rootOf,epoch,tradeTimes,monthsFor,barAt,aggregate};
})(typeof window!=='undefined'?window:globalThis);
