/* Presentation only. Existing Firebase authentication, account gates and writes
   remain the source of truth. No storage, network calls or trial grants here. */
(()=>{
  'use strict';
  const authScreen=document.getElementById('auth-screen');
  function openAuth(tab='login'){
    if(!authScreen)return;
    authScreen.dataset.fyView='auth';
    if(typeof authShowTab==='function')authShowTab(tab);
    authScreen.scrollTop=0;
    document.getElementById(tab==='register'?'reg-name':'login-email')?.focus();
  }
  function requestEntry(tab='login'){
    if(typeof _siteEntryRequested!=='undefined')_siteEntryRequested=true;
    const ready=typeof currentUser!=='undefined' && currentUser?.uid && currentUser.status!=='blocked' && typeof auth!=='undefined' && auth.currentUser?.uid===currentUser.uid;
    if(ready && typeof showApp==='function'){showApp();return;}
    openAuth(tab);
  }
  function openLanding(){
    if(!authScreen)return;
    authScreen.dataset.fyView='landing';authScreen.scrollTop=0;
    document.getElementById('fy-public-login')?.focus();
  }
  function onboarding(accountList,tradeList){
    const hasAccount=accountList.some(a=>a.active!==false&&a.archived!==true);
    const hasTrades=tradeList.length>0;
    if(hasAccount&&hasTrades)return '';
    return `<section class="fy-onboarding" aria-label="תחילת העבודה"><div><h2>המסחר שלך מתחיל בחשבון מסודר.</h2><p>כל עסקה שייכת לחשבון מסחר. ההיסטוריה הקיימת נשמרת.</p><div class="fy-onboarding-steps"><span data-complete="${hasAccount}">${hasAccount?'✓':'1.'} חשבון מסחר</span><span data-complete="${hasTrades}">${hasTrades?'✓':'2.'} הוספת עסקאות</span><span>3. סקירת ביצועים</span></div></div><button type="button" class="home-primary" data-fy-setup="${hasAccount?'import':'account'}">${hasAccount?'ייבוא העסקאות הראשונות':'יצירת חשבון מסחר'}</button></section>`;
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-fy-auth],[data-fy-back],[data-fy-anchor],[data-fy-setup]');
    if(!target)return;
    if(target.hasAttribute('data-fy-auth')){event.preventDefault();requestEntry(target.dataset.fyAuth);}
    else if(target.hasAttribute('data-fy-back')){event.preventDefault();openLanding();}
    else if(target.hasAttribute('data-fy-anchor')){event.preventDefault();document.getElementById(target.dataset.fyAnchor)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
    else if(target.dataset.fySetup==='account'){if(typeof addAccount==='function')addAccount();}
    else if(target.dataset.fySetup==='import'){if(typeof swNav==='function')swNav('import');}
  });
  // Public prices share the approved server catalog; nothing here enables billing.
  const model=window.FaynaPlanModel;
  if(model?.plans)for(const id of ['single','unlimited']){
    const el=document.getElementById('fy-price-'+id),price=model.plans[id]?.monthlyMinor;
    if(el&&Number.isSafeInteger(price))el.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(price/100);
  }
  window.FaynaExperience=Object.freeze({openAuth,openLanding,requestEntry,onboarding});
})();
