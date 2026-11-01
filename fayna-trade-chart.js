/* Candles with the trade marked on them. Lightweight Charts draws; the market-data branch
   supplies the bars (scripts/fetch_candles.py). No account, no key, and nothing is saved. */
(function(root){
'use strict';
const DATA='https://raw.githubusercontent.com/dorfeina123-hash/fayna-trading/market-data/';
const LIB='https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';
const INTERVALS=[['1m',60],['5m',300],['1h',3600]];
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
  const last=exit||entry;
  let bars=null,interval=null,step=0;
  for(const [name,seconds] of INTERVALS){
    const list=await loadBars(sym,name,entry-86400,last+86400);
    if(barAt(list,entry,seconds)){bars=list;interval=name;step=seconds;break;}
  }
  if(!bars) return null;
  await loadLibrary();
  const css=getComputedStyle(document.documentElement);
  // Lightweight Charts draws UTC, so bars move to the viewer's clock.
  const view=ts=>ts-new Date(ts*1000).getTimezoneOffset()*60;
  const chart=root.LightweightCharts.createChart(el,{autoSize:true,
    layout:{background:{color:'transparent'},textColor:css.getPropertyValue('--t2').trim()||'#9aa3af',attributionLogo:true},
    grid:{vertLines:{color:'rgba(128,128,128,.08)'},horzLines:{color:'rgba(128,128,128,.08)'}},
    timeScale:{timeVisible:true,secondsVisible:false},rightPriceScale:{borderVisible:false}});
  const series=chart.addCandlestickSeries({upColor:'#27a065',downColor:'#e04545',wickUpColor:'#27a065',wickDownColor:'#e04545',borderVisible:false});
  series.setData(bars.map(b=>({time:view(b[0]),open:b[1],high:b[2],low:b[3],close:b[4]})));
  const entryPrice=dir==='short'?t.sell:dir==='long'?t.buy:null,exitPrice=dir==='short'?t.buy:dir==='long'?t.sell:null;
  const line=(price,title,lineColor)=>{if(price)series.createPriceLine({price,color:lineColor,lineWidth:1,lineStyle:2,axisLabelVisible:true,title});};
  line(entryPrice,'Entry','#2f9bff');line(exitPrice,'Exit','#f5a524');line(Number(t.stopLoss)||null,'Stop','#e04545');
  const point=(ts,name,sell,price)=>({time:view(barAt(bars,ts,step)[0]),position:sell?'aboveBar':'belowBar',shape:sell?'arrowDown':'arrowUp',color:sell?'#e04545':'#27a065',text:name+(price?' '+price:'')});
  const marks=[point(entry,dir?(dir==='short'?'Sell':'Buy'):'Entry',dir==='short',entryPrice)];
  if(exit&&barAt(bars,exit,step)) marks.push(point(exit,dir?(dir==='short'?'Cover':'Sell'):'Exit',dir==='long',exitPrice));
  series.setMarkers(marks.sort((a,b)=>a.time-b.time));
  chart.timeScale().setVisibleRange({from:view(entry-40*step),to:view(last+40*step)});
  const bar=barAt(bars,entry,step),miss=entryPrice?Math.max(bar[3]-entryPrice,entryPrice-bar[2],0):0;
  return {interval,miss,symbol:sym,destroy:()=>chart.remove()};
}
root.FaynaTradeChart={supports:t=>!!rootOf(t&&t.sym)&&!t.isManual,render};
if(typeof module!=='undefined')module.exports={rootOf,epoch,tradeTimes,monthsFor,barAt};
})(typeof window!=='undefined'?window:globalThis);
