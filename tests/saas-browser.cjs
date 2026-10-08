const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const s=html.indexOf('function '+name+'(');assert(s>=0,name);const first=html.slice(s,html.indexOf('\n',s));if(first.trimEnd().endsWith('}'))return first;const e=html.indexOf('\n}',s);assert(e>s);return html.slice(s,e+2);}
const home=html.slice(html.indexOf('var _homePeriod ='),html.indexOf('\n}',html.indexOf('function renderHome('))+2);
const output=path.resolve('artifacts/saas-ui');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(5000);await page.route('**/*',r=>r.request().url()==='https://ui-fixture.invalid/fayna-logo-gold.png'?r.fulfill({path:path.resolve('fayna-logo-gold.png'),contentType:'image/png'}):r.abort());const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('<head>','<head><base href="https://ui-fixture.invalid/">'));
  assert.equal(await page.locator('.topnav img[src="fayna-logo-gold.png"]').evaluate(img=>img.complete&&img.naturalWidth>0),true,'real logo loaded');
  await page.addStyleTag({content:fs.readFileSync('saas-design.css','utf8')+'\n#auth-screen,#welcome-back-screen{display:none!important}'});
  let axeAvailable=false;try{await page.addScriptTag({content:fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8')});axeAvailable=true;}catch(e){if(process.env.CI)throw e;}
  await page.addScriptTag({content:`var currentUser={isAdmin:false};var permit=true;var upgradeCalls=0;var selectedAccounts=new Set(['__all__']);var accounts=[{id:'a',name:'חשבון בדיקה סינתטי'},{id:'b',name:'חשבון סינתטי נוסף'}];var tradesList=[];var showAdd={};var _sidePanelTabs=[];function escHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}function tradeComm(t){return t.fee||0}function tradeNet(t){return t.pnl-tradeComm(t)}function canUse(){return permit}function showUpgradeModal(){upgradeCalls++}function renderAcctMenu(){}function applyAcctFilter(){renderHome()}function openAddTrade(){}function openAcctGrid(){}function _simpleGroup(n){return n}function _simpleSync(){}function _syncBottomNav(){}function _hydrateTab(){}function closeNavMenu(){}function mobNavClose(){document.body.classList.remove('drawer-open')}function closeSidePanel(){}function financeNavigate(){document.querySelectorAll('.tp').forEach(p=>p.classList.remove('active'));document.getElementById('tp-biz').classList.add('active');_simpleSync('biz')}function renderOV(){renderHome()}function renderFocusPanel(){}function renderStats(){}function renderTJ(){}function renderBiz(){}function renderCal(){}function _coachRenderHome(){}function renderPricing(){}function workspacePlan(){}function renderAiAssistant(){}function renderPNL(){}function renderCX(){}function renderAdminPanel(){}function _resizeEcal(){}\n`+fn('sw')+'\n'+fn('swNav')+'\n'+home});
  await page.addScriptTag({content:'function observeCards(){}'});
  await page.addScriptTag({content:fs.readFileSync('saas-dashboard.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('saas-navigation.js','utf8')});await page.evaluate(()=>SaasNavigation.install());
  await page.evaluate(()=>{const d=new Date(),m=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),p=new Date(d.getFullYear(),d.getMonth()-1,1),prev=p.getFullYear()+'-'+String(p.getMonth()+1).padStart(2,'0');tradesList=[{date:m+'-01',sym:'SYNTHETIC-NQ',pnl:520,fee:8,acct:'a'},{date:m+'-02',sym:'SYNTHETIC-ES',pnl:-125,fee:5,acct:'a'},{date:prev+'-01',sym:'SYNTHETIC-MES',pnl:100,acct:'a'},{date:prev+'-01',sym:'OTHER-ACCOUNT',pnl:999,acct:'b'}];swNav('overview');renderHome();const badge=document.createElement('div');badge.textContent='בדיקת ממשק — נתונים סינתטיים בלבד';badge.style.cssText='position:fixed;bottom:64px;left:4px;background:#fff;color:#111;z-index:99999;padding:8px';document.body.append(badge);});
  await page.locator('#home-account-select').selectOption('a');
  assert.equal(await page.locator('.saas-kpis section').count(),5);
  assert.match(await page.locator('#saas-month-summary').innerText(),/2 רשומות · 2 ימי מסחר/);
  const equitySlider=page.getByRole('slider',{name:'יום בגרף הביצועים',exact:true});await equitySlider.focus();await equitySlider.press('Home');assert.match(await equitySlider.getAttribute('aria-valuetext'),/512/);await page.locator('.saas-daily-bars button').last().click();assert.match(await equitySlider.getAttribute('aria-valuetext'),/382/);
  await page.getByRole('button',{name:'החודש הקודם',exact:true}).click();await page.locator('.saas-calendar button').first().click();assert.match(await page.locator('.saas-day-detail').innerText(),/SYNTHETIC-MES/);assert.doesNotMatch(await page.locator('.saas-day-detail').innerText(),/OTHER-ACCOUNT/);
  await page.getByRole('button',{name:'החודש הבא',exact:true}).click();await page.getByRole('button',{name:'חזרה לחודש הנוכחי',exact:true}).click();
  const report=[];
  for(const width of [1440,390,320])for(const light of [false,true]){
   await page.setViewportSize({width,height:1000});await page.evaluate(light=>{document.body.classList.toggle('light-mode',light);document.documentElement.dataset.faynaTheme=light?'light':'dark';},light);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).direction),'rtl');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`horizontal overflow ${width}`);
   const nav=page.locator(width>600?'#sidenav .saas-primary-nav':'#mob-bottom-nav .saas-primary-nav');assert.equal(await nav.locator('button').count(),6);
   for(const route of ['overview','trades','stats','lab','biz','personal']){await nav.locator('[data-saas-route="'+route+'"]').click();await page.waitForTimeout(100);assert.equal(await nav.locator('[data-saas-route="'+route+'"]').getAttribute('aria-current'),'page');assert.equal(await page.locator('#tp-'+route).isVisible(),true);}
   await nav.locator('[data-saas-route="overview"]').click();await page.waitForTimeout(100);
   const previous=page.getByRole('button',{name:'החודש הקודם',exact:true});await previous.focus();await page.keyboard.press('Enter');assert.equal(await previous.evaluate(b=>b===document.activeElement),true);assert.notEqual(await previous.evaluate(b=>getComputedStyle(b).outlineStyle),'none');
   await page.getByRole('button',{name:'חזרה לחודש הנוכחי',exact:true}).click();
   const contrast=await page.evaluate(()=>{
    const rgb=s=>s.match(/[\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const failures=[];let count=0;
    for(const el of document.querySelectorAll('#home-dashboard h1,#home-dashboard h2,#home-dashboard .home-muted,#home-dashboard .saas-kpis span,#home-dashboard .saas-calendar button,#home-dashboard .home-period button,.saas-primary-nav button')){
     if(!el.getClientRects().length||!el.textContent.trim())continue;
     let parent=el,bg=[0,0,0,0];while(parent&&bg[3]===0){bg=rgb(getComputedStyle(parent).backgroundColor);parent=parent.parentElement;}
     const css=getComputedStyle(el),fg=rgb(css.color),l1=lum(fg),l2=lum(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),large=parseFloat(css.fontSize)>=24||(parseFloat(css.fontSize)>=18.66&&parseFloat(css.fontWeight)>=700);count++;
     if(ratio<(large?3:4.5))failures.push({text:el.textContent.trim().slice(0,40),ratio:+ratio.toFixed(2),fg:css.color,bg});
    }return {count,failures};
   });assert.deepEqual(contrast.failures,[],`AA contrast ${width} ${light}`);
   if(axeAvailable){const violations=await page.evaluate(async()=>{const r=await axe.run({include:[['#home-dashboard'],['.saas-primary-nav']]},{runOnly:{type:'rule',values:['color-contrast','button-name','aria-valid-attr','aria-valid-attr-value','aria-allowed-attr']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});assert.deepEqual(violations,[],`axe accessibility ${width} ${light}`);}
   await page.screenshot({path:path.join(output,`dashboard-${width}-${light?'light':'dark'}.png`),fullPage:true});report.push({width,theme:light?'light':'dark',rtl:true,overflow:false,navigation:6,keyboard:true,contrast});
  }
  await page.evaluate(()=>{permit=false;swNav('overview')});await page.locator('#mob-bottom-nav [data-saas-route="stats"]').click();assert.equal(await page.evaluate(()=>upgradeCalls),1);assert.equal(await page.locator('#tp-overview').isVisible(),true);
  await page.addScriptTag({content:`var financeCurrency='USD',financeRange='all',financeView='summary',financeDate=new Date(),financeType='all',financeQuery='',businessNotes={},records=[{id:'legacy',date:'2026-10-01',type:'הוצאה',amount:20,rate:4}],customExpenses=[],businessEvents=[{id:'usd',date:'2026-10-01',type:'expense',amount:100,currency:'USD',rate:3.5},{id:'ils',date:'2026-10-02',type:'income',amount:600,currency:'ILS',rate:3}];accounts=[];function histRate(){return 3}function financeNoteKey(){return 'synthetic'}\n`+['financeMoney','financeRows','financePeriodRows','financeTotals','financeInPeriod','financeConvert','financeLegacyRows','financeSuspects','financeCombinedRows','financeBreakdown','financeTable','financeRender'].map(fn).join('\n')});
  await page.addScriptTag({content:fn('financeNavigate')});
  await page.evaluate(()=>{document.getElementById('tp-biz').innerHTML='<div id="finance-workspace"></div>';});
  await page.addScriptTag({content:fs.readFileSync('saas-finance-currency.js','utf8')});
  const originalFinance=await page.evaluate(()=>JSON.stringify({businessEvents,records}));await page.evaluate(()=>{swNav('biz');financeRender()});
  const ledgerCount=await page.locator('#finance-content tbody tr').count();assert.equal(ledgerCount,3);
  const usdNet=await page.locator('.ws-kpis section').last().locator('strong').innerText();assert.equal(usdNet,await page.evaluate(()=>financeMoney(80)));
  await page.getByRole('combobox',{name:'מטבע כספי',exact:true}).selectOption('ILS');assert.equal(await page.locator('#finance-content tbody tr').count(),ledgerCount);assert.equal(await page.locator('.ws-kpis section').last().locator('strong').innerText(),await page.evaluate(()=>financeMoney(170)));
  await page.locator('#simple-section-nav').getByRole('button',{name:'דוחות',exact:true}).click();assert.equal(await page.locator('#finance-content tbody tr').first().locator('td').last().innerText(),await page.evaluate(()=>financeMoney(170)));await page.locator('#simple-section-nav').getByRole('button',{name:'סיכום',exact:true}).click();
  await page.getByRole('combobox',{name:'מטבע כספי',exact:true}).selectOption('USD');assert.equal(await page.locator('.ws-kpis section').last().locator('strong').innerText(),usdNet);assert.equal(await page.evaluate(()=>JSON.stringify({businessEvents,records})),originalFinance);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({scope:'isolated presentation harness; Firebase and expensive legacy renderers stubbed, not auth regression',browser:browser.version(),checks:report},null,2));console.log('Browser RTL, six routes, keyboard, calendar/account scoping and plan gate checks passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
