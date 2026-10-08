/* Presentation-only navigation. Existing routes and feature gates stay authoritative. */
(function(){
'use strict';
const destinations=[['overview','ראשי','⌂'],['trades','יומן','▤'],['stats','ניתוח','▥'],['lab','מעבדה','◇'],['biz','חשבונות וכספים','▣'],['personal','הגדרות','⚙']];
const sections={
 overview:[],
 trades:[['trades','עסקאות'],['calendar','לוח שנה'],['import','ייבוא'],['calc','מחשבונים'],['ecal','יומן כלכלי']],
 stats:[['stats','ביצועים ואסטרטגיות'],['merge','השוואת אסטרטגיות'],['coach','משמעת']],
 lab:[['lab','מעבדה']],
 biz:[['biz','חשבונות וכספים']],
 personal:[['personal','פרופיל והעדפות'],['datamgr','נתונים וגיבוי'],['billing','מנוי'],['ai','עוזר AI קיים'],['help','עזרה'],['course','קורס'],['software','תוכנות'],['firms','חברות מימון'],['news','חדשות']]
};
function group(name){for(const [key,list] of Object.entries(sections))if(list.some(x=>x[0]===name))return key;return ['expenses','custom','withdrawals','pnl'].includes(name)?'biz':['goals'].includes(name)?'overview':name;}
function sync(name){
 const active=group(name);
 document.querySelectorAll('[data-saas-route]').forEach(b=>{const current=b.dataset.saasRoute===active;b.classList.toggle('active',current);if(current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const label=document.getElementById('nav-active-name');if(label)label.textContent=destinations.find(x=>x[0]===active)?.[1]||name;
 const nav=document.getElementById('simple-section-nav');if(!nav)return;
 nav.replaceChildren();for(const [route,title] of sections[active]||[]){const b=document.createElement('button');b.type='button';b.textContent=title;if(route===name)b.setAttribute('aria-current','page');b.onclick=()=>window.swNav(route);nav.append(b);}nav.hidden=!nav.childElementCount;
 if(name==='calc'&&window._simpleTradeDraft){const back=document.createElement('button');back.type='button';back.textContent='חזרה לעסקה';back.onclick=()=>{window.swNav('trades');document.getElementById('add-trade-modal')?.classList.add('open');window._simpleTradeDraft=false;};nav.append(back);}
}
function install(){
 const main=document.querySelector('main.main');if(!main||typeof window.swNav!=='function')return;
 const lab=document.createElement('section');lab.id='tp-lab';lab.className='tp';
 const title=document.createElement('h1');title.textContent='מעבדה';
 const card=document.createElement('div');card.className='home-card';
 const heading=document.createElement('h2');heading.textContent='Backtest וספריית אסטרטגיות';
 const status=document.createElement('p');status.textContent='עדיין לא זמין. Backtest, ספריית אסטרטגיות ומחברת יתווספו בהמשך. בדיקה היסטורית דורשת מקור נתוני שוק מאומת.';
 card.append(heading,status);lab.append(title,card);main.append(lab);
 for(const [id,cls] of [['sidenav','sn-item'],['nav-menu-grid','nav-menu-item'],['mob-nav-drawer','mob-nt'],['mob-bottom-nav','mob-bnav-btn']]){
  const parent=document.getElementById(id);if(!parent)continue;
  // Retain legacy IDs and admin control; only replace the presentation of primary navigation.
  parent.querySelectorAll('button.'+cls).forEach(b=>{if(b.id)b.hidden=true;});
  const holder=document.createElement('div');holder.className='saas-primary-nav';holder.setAttribute('role','group');holder.setAttribute('aria-label','ששת אזורי המערכת');
  for(const [route,label,icon] of destinations){const b=document.createElement('button');b.type='button';b.className=cls;b.dataset.saasRoute=route;b.setAttribute('aria-label',label);const s=document.createElement('span');s.className=cls==='mob-bnav-btn'?'mbn-icon':'sn-icon';s.textContent=icon;s.setAttribute('aria-hidden','true');const t=document.createElement('span');t.className='sn-lbl';t.textContent=label;b.append(s,t);b.onclick=()=>window.swNav(route);holder.append(b);}
  parent.append(holder);
 }
 const originalNav=window.swNav,originalSync=window._simpleSync,originalBottom=window._syncBottomNav;
 window._simpleSync=function(name){originalSync(name);sync(name);};
 window._syncBottomNav=function(name){originalBottom(name);sync(name);};
 window.swNav=function(name){
  if(name!=='lab'){originalNav(name);return;}
  // Lab has no server or simulated results. All real routes retain the original gate.
  document.querySelectorAll('.tp').forEach(p=>p.classList.remove('active'));lab.classList.add('active');
  window.mobNavClose?.();window.closeNavMenu?.();window.closeSidePanel?.();document.body.classList.remove('drawer-open');sync('lab');
  main.focus({preventScroll:true});
 };
 // Match actual active panel so rejected plan-gated navigation never appears successful.
 sync(document.querySelector('.tp.active')?.id.replace('tp-','')||'overview');
}
if(typeof window!=='undefined'){window.SaasNavigation={install,group};document.addEventListener('DOMContentLoaded',install);}
if(typeof module!=='undefined')module.exports={group,destinations};
})();
