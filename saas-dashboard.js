(function(){
'use strict';
function summary(rows,netOf,includeMetrics=true){
 let gains=0,losses=0,winSum=0,lossSum=0,wins=0,losers=0;const days={},detailed=[];
 for(const t of rows){const n=Number(netOf(t));if(!Number.isFinite(n))continue;gains+=Math.max(n,0);losses+=Math.max(-n,0);(days[t.date]??=[]).push({symbol:t.sym||'עסקה',time:t.btime||'',net:n,strategy:t.strategy||'',notes:t.notes||t.note||''});if(includeMetrics&&!t.isManual){detailed.push({key:String(t.date||'')+String(t.btime||''),net:n});if(n>0){wins++;winSum+=n;}if(n<0){losers++;lossSum-=n;}}}
 let ws=0,ls=0,maxWins=0,maxLosses=0;
 if(detailed.some((t,i)=>i&&t.key<detailed[i-1].key))detailed.sort((a,b)=>a.key.localeCompare(b.key));
 for(const t of detailed){ws=t.net>0?ws+1:0;ls=t.net<0?ls+1:0;maxWins=Math.max(maxWins,ws);maxLosses=Math.max(maxLosses,ls);}
 const averageWin=wins?winSum/wins:null,averageLoss=losers?lossSum/losers:null;
 return {factor:losses?gains/losses:null,days,averageWin,averageLoss,averageRatio:averageWin!==null&&averageLoss!==null?averageWin/averageLoss:null,maxWins,maxLosses};
}
function decorate(root,model,rows,now,netOf){
 const data=summary(model.rows,netOf),money=n=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'USD'}).format(n);
 const kpis=document.createElement('div');kpis.className='saas-kpis';
 for(const [label,value] of [['תוצאה נטו',money(model.net)],['אחוז הצלחה',model.winRate===null?'—':model.winRate.toFixed(0)+'%'],['יחס סך רווחים להפסדים',data.factor===null?'—':data.factor.toFixed(2)],['יחס רווח/הפסד ממוצע',data.averageRatio===null?'—':data.averageRatio.toFixed(2)],['רשומות בתקופה',model.count]]){
  const card=document.createElement('section'),small=document.createElement('span'),strong=document.createElement('strong');card.className='home-card';small.textContent=label;strong.textContent=value;card.append(small,strong);kpis.append(card);
 }
 root.querySelector('.home-filter').after(kpis);
 const strip=document.createElement('details');strip.className='saas-summary-strip';const caption=document.createElement('summary');caption.textContent='ממוצעים ורצפים';const explanation=document.createElement('p');explanation.className='home-muted';explanation.textContent='מעסקאות מפורטות בלבד: רווח ממוצע '+(data.averageWin===null?'—':money(data.averageWin))+' · הפסד ממוצע '+(data.averageLoss===null?'—':money(-data.averageLoss))+' · רצף ניצחונות מרבי '+data.maxWins+' · רצף הפסדים מרבי '+data.maxLosses;strip.append(caption,explanation);kpis.after(strip);
 const performance=root.querySelector('.home-performance'),daily=Object.entries(data.days).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,list])=>({date,net:list.reduce((s,t)=>s+t.net,0)}));
 if(daily.length){
  let run=0;const equity=daily.map(t=>({...t,equity:run+=t.net}));
  const label=document.createElement('label');label.className='saas-chart-control';label.textContent='יום בגרף הביצועים';const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max=String(equity.length-1);slider.value=slider.max;slider.setAttribute('aria-label','יום בגרף הביצועים');const status=document.createElement('p');status.className='home-muted';status.setAttribute('aria-live','polite');
  const select=()=>{const t=equity[Number(slider.value)];slider.setAttribute('aria-valuetext',t.date+' · מצטבר '+money(t.equity));status.textContent=t.date+' · יומי '+money(t.net)+' · מצטבר '+money(t.equity);};slider.oninput=select;select();label.append(slider);performance.append(label,status);
  const bars=document.createElement('div');bars.className='saas-daily-bars';const title=document.createElement('h2');title.textContent='תוצאה יומית';performance.append(title);const shown=daily.slice(-31),max=Math.max(...shown.map(t=>Math.abs(t.net)),1);
  for(const t of shown){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',t.date+' · תוצאה יומית '+money(t.net));b.title=t.date+' · '+money(t.net);const bar=document.createElement('span');bar.className=t.net<0?'loss':'gain';bar.style.height=Math.max(2,Math.abs(t.net)/max*70)+'px';bar.setAttribute('aria-hidden','true');b.append(bar);b.onclick=()=>{slider.value=String(equity.findIndex(x=>x.date===t.date));select();};bars.append(b);}performance.append(bars);const scope=document.createElement('p');scope.className='home-muted';scope.textContent='עד 31 ימי מסחר אחרונים בטווח שנבחר. לחיצה מציגה את ערכי היום.';performance.append(scope);
 }
 const target=root.querySelector('.home-summary');target.replaceChildren();
 const toolbar=document.createElement('div');toolbar.className='saas-month-toolbar';
 const title=document.createElement('h2');title.id='saas-month-title';title.setAttribute('aria-live','polite');
 const previous=document.createElement('button'),next=document.createElement('button'),today=document.createElement('button');
 for(const [b,label,text] of [[previous,'החודש הקודם','‹'],[next,'החודש הבא','›'],[today,'חזרה לחודש הנוכחי','החודש']]){b.type='button';b.setAttribute('aria-label',label);b.textContent=text;}
 toolbar.append(previous,title,next,today);target.append(toolbar);
 const hint=document.createElement('p');hint.className='home-muted';hint.textContent='הלוח מציג את החודש הנבחר בחשבונות שנבחרו, ללא תלות בטווח הסיכום למעלה.';target.append(hint);
 const grid=document.createElement('div');grid.className='saas-calendar';
 const detail=document.createElement('div');detail.className='saas-day-detail';detail.setAttribute('aria-live','polite');
 const calendarData=model.start===''?data:summary(rows.filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.date||'')&&t.date<=localDate(now)),netOf,false);
 let cursor=new Date(now.getFullYear(),now.getMonth(),1);
 function draw(){
 grid.replaceChildren();detail.replaceChildren();
 title.textContent='לוח מסחר · '+cursor.toLocaleDateString('he-IL',{month:'long',year:'numeric'});
 for(const day of ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳']){const s=document.createElement('span');s.textContent=day;grid.append(s);}
 const year=cursor.getFullYear(),month=cursor.getMonth();
 for(let i=0;i<new Date(year,month,1).getDay();i++){const s=document.createElement('span');s.setAttribute('aria-hidden','true');grid.append(s);}
 for(let day=1;day<=new Date(year,month+1,0).getDate();day++){
  const date=year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),trades=calendarData.days[date]||[],total=trades.reduce((s,t)=>s+t.net,0);
  const b=document.createElement('button');b.type='button';const number=document.createElement('span');number.className='saas-day-number';number.textContent=day;b.append(number);if(trades.length){const amount=document.createElement('strong');amount.textContent=money(total);const count=document.createElement('small');count.textContent=trades.length+' רשומות';b.append(amount,count);}b.className=trades.length?(total>0?'up':total<0?'down':'flat'):'';b.setAttribute('aria-label',date+' · '+trades.length+' עסקאות'+(trades.length?' · '+money(total):''));b.setAttribute('aria-pressed','false');
  b.onclick=()=>{grid.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));detail.replaceChildren();const heading=document.createElement('strong');heading.textContent=date+' · '+trades.length+' רשומות · '+(trades.length?money(total):'אין עסקאות ביום זה');detail.append(heading);for(const t of trades){const p=document.createElement('p');p.textContent=[t.symbol,t.time,money(t.net),t.strategy?'אסטרטגיה: '+t.strategy:'',t.notes?'הערות: '+t.notes:''].filter(Boolean).join(' · ');detail.append(p);}};grid.append(b);
 }
 }
 previous.onclick=()=>{cursor=new Date(cursor.getFullYear(),cursor.getMonth()-1,1);draw();};
 next.onclick=()=>{cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);draw();};
 today.onclick=()=>{cursor=new Date(now.getFullYear(),now.getMonth(),1);draw();};draw();
 target.append(grid,detail);
 const stats=document.createElement('p');stats.className='home-muted';stats.textContent='ירידה מרבית מהשיא בתקופה: '+money(-model.drawdown);target.append(stats);
}
function localDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
if(typeof window!=='undefined'){window.SaasDashboard={decorate,summary};document.body.classList.add('saas-foundation');}
if(typeof module!=='undefined')module.exports={summary};
})();
