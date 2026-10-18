const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('fayna-experience.css','utf8');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
function fn(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\n}',a);assert(a>=0,name);return html.slice(a,b+2);}
const home=html.slice(html.indexOf('/* v54 — compact home.'),html.indexOf('function renderOV() {'));
const output=process.env.FAYNA_REVIEW_OUTPUT;
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
 await page.addStyleTag({content:css});await page.evaluate(()=>{document.documentElement.dataset.faynaTheme='dark';document.getElementById('welcome-back-screen').style.display='none';});
 await page.addScriptTag({content:fn('authShowTab')+`;var accountCalls=0,navCalls=[];function addAccount(){accountCalls++}function swNav(n){navCalls.push(n)};`});
 await page.addScriptTag({path:'functions/plan-model.js'});await page.addScriptTag({path:'fayna-experience.js'});
 const screenshot=async name=>{if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,name+'.png'),fullPage:false});}};
 const baseline=JSON.parse(JSON.stringify(require('../functions/plan-model.js')));
 for(const mode of ['dark','light'])for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(mode=>{document.documentElement.dataset.faynaTheme=mode;FaynaExperience.openLanding()},mode);
  assert(await page.locator('.fy-public').isVisible());assert.equal(await page.locator('.auth-box').isVisible(),false);
  assert.equal(await page.locator('#fy-price-single').innerText(),'$14.90');assert.equal(await page.locator('#fy-price-unlimited').innerText(),'$24.90');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+mode+width);
  const overflow=await page.locator('#auth-screen').evaluate(el=>el.scrollWidth>el.clientWidth);assert.equal(overflow,false,'auth overflow '+mode+width);
  const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return ['--bg0','--ac'].map(k=>s.getPropertyValue(k).trim())});
  assert.equal(tokens[0],mode==='dark'?'#111315':'#f3f1ed');assert.equal(tokens[1],mode==='dark'?'#70dfbc':'#6b52b1');
  await screenshot('fayna-welcome-'+mode+'-'+width);
  await page.locator('#fy-public-login').click();assert(await page.locator('#auth-login-form').isVisible());assert.equal(await page.locator('.fy-public').isVisible(),false);
  assert.equal(await page.locator('#login-email').evaluate(el=>el===document.activeElement),true);
  await screenshot('fayna-login-'+mode+'-'+width);
  await page.locator('[data-fy-back]').click();assert(await page.locator('.fy-public').isVisible());
  await page.locator('[data-fy-auth="register"]').first().click();assert(await page.locator('#auth-register-form').isVisible());assert.equal(await page.locator('#auth-login-form').isVisible(),false);
 }
 assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(FaynaPlanModel))),baseline);
 await page.addScriptTag({content:`var currentUser={uid:'owner',status:'active'},auth={currentUser:{uid:'owner'}},appEntries=0;function showApp(){appEntries++}`});
 await page.evaluate(()=>FaynaExperience.openLanding());await page.locator('#fy-public-login').click();assert.equal(await page.evaluate(()=>appEntries),1);
 await page.evaluate(()=>{currentUser=null;auth.currentUser=null;FaynaExperience.openLanding()});await page.locator('#fy-public-login').click();assert(await page.locator('#auth-login-form').isVisible());assert.equal(await page.evaluate(()=>appEntries),1);
 await page.addScriptTag({content:`function loadPlanVisibility(){}function loadContactSettings(){}function showMsg(el,type,text){el.textContent=text}\n`+fn('_showAuthScreen')});
 await page.evaluate(()=>{FaynaExperience.openLanding();_showAuthScreen('לא הצלחנו להתחבר — נסה שוב')});
 assert(await page.locator('#auth-login-form').isVisible());assert.equal(await page.locator('#login-msg').textContent(),'לא הצלחנו להתחבר — נסה שוב');
 await page.addScriptTag({content:`var currentUser=null,selectedAccounts=new Set(['__all__']),accounts=[],tradesList=[];function escHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}function tradeComm(t){return t.fee||0}function tradeNet(t){return t.pnl-tradeComm(t)}function openAddTrade(){}function openAcctGrid(){}function renderAcctMenu(){}function applyAcctFilter(){renderHome()}\n`+home});
 await page.evaluate(()=>{document.getElementById('auth-screen').style.display='none';document.querySelectorAll('.tp').forEach(el=>el.classList.remove('active'));document.getElementById('tp-overview').classList.add('active');renderHome()});
 await page.locator('[data-fy-setup="account"]').click();assert.equal(await page.evaluate(()=>accountCalls),1);
 await page.evaluate(()=>{accounts=[{id:'a',name:'ראשי'}];renderHome()});await page.locator('[data-fy-setup="import"]').click();assert.deepEqual(await page.evaluate(()=>navCalls),['import']);
 await page.evaluate(()=>{const d=new Date(),month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');tradesList=[{date:month+'-01',sym:'ES',pnl:520,fee:8,acct:'a'},{date:month+'-02',sym:'NQ',pnl:-125,fee:5,acct:'a'}];renderHome()});
 assert.equal(await page.locator('.fy-onboarding').count(),0);assert.equal(await page.locator('.home-total').innerText(),'+$382.00');
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});for(const mode of ['dark','light']){await page.evaluate(mode=>document.documentElement.dataset.faynaTheme=mode,mode);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('fayna-dashboard-'+mode+'-'+width);}}
 assert.deepEqual(errors,[]);console.log('Experience passed: preserved theme colors; landing/login/registration; account onboarding; real home calculation; desktop/mobile; no provider or data writes.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
