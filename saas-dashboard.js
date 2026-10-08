(function(){
'use strict';
function summary(rows,netOf){
 let gains=0,losses=0;const days={};
 for(const t of rows){const n=Number(netOf(t));if(!Number.isFinite(n))continue;gains+=Math.max(n,0);losses+=Math.max(-n,0);(days[t.date]??=[]).push({symbol:t.sym||'עסקה',time:t.btime||'',net:n});}
 return {factor:losses?gains/losses:null,days};
}
function decorate(root,model,rows,now,netOf){
 const data=summary(model.rows,netOf),money=n=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'USD'}).format(n);
 const kpis=document.createElement('div');kpis.className='saas-kpis';
 for(const [label,value] of [['תוצאה נטו',money(model.net)],['אחוז הצלחה',model.winRate===null?'—':model.winRate.toFixed(0)+'%'],['יחס סך רווחים להפסדים',data.factor===null?'—':data.factor.toFixed(2)],['רשומות בתקופה',model.count]]){
  const card=document.createElement('section'),small=document.createElement('span'),strong=document.createElement('strong');card.className='home-card';small.textContent=label;strong.textContent=value;card.append(small,strong);kpis.append(card);
 }
 root.querySelector('.home-filter').after(kpis);
 const target=root.querySelector('.home-summary');target.replaceChildren();
 const title=document.createElement('h2');title.textContent='לוח מסחר · '+now.toLocaleDateString('he-IL',{month:'long',year:'numeric'});target.append(title);
 const hint=document.createElement('p');hint.className='home-muted';hint.textContent='לפי החשבונות והתקופה שנבחרו. לחיצה מציגה את עסקאות היום.';target.append(hint);
 const grid=document.createElement('div');grid.className='saas-calendar';
 for(const day of ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳']){const s=document.createElement('span');s.textContent=day;grid.append(s);}
 const year=now.getFullYear(),month=now.getMonth();
 for(let i=0;i<new Date(year,month,1).getDay();i++){const s=document.createElement('span');s.setAttribute('aria-hidden','true');grid.append(s);}
 const detail=document.createElement('div');detail.className='saas-day-detail';detail.setAttribute('aria-live','polite');
 for(let day=1;day<=new Date(year,month+1,0).getDate();day++){
  const date=year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),trades=data.days[date]||[],total=trades.reduce((s,t)=>s+t.net,0);
  const b=document.createElement('button');b.type='button';b.textContent=day;b.className=trades.length?(total>=0?'up':'down'):'';b.setAttribute('aria-label',date+' · '+trades.length+' עסקאות'+(trades.length?' · '+money(total):''));b.setAttribute('aria-pressed','false');
  b.onclick=()=>{grid.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));detail.replaceChildren();const heading=document.createElement('strong');heading.textContent=date+' · '+(trades.length?money(total):'אין עסקאות בתקופה שנבחרה');detail.append(heading);for(const t of trades){const p=document.createElement('p');p.textContent=[t.symbol,t.time,money(t.net)].join(' · ');detail.append(p);}};grid.append(b);
 }
 target.append(grid,detail);
 const stats=document.createElement('p');stats.className='home-muted';stats.textContent='ירידה מרבית מהשיא בתקופה: '+money(-model.drawdown);target.append(stats);
}
if(typeof window!=='undefined'){window.SaasDashboard={decorate,summary};document.body.classList.add('saas-foundation');}
if(typeof module!=='undefined')module.exports={summary};
})();
