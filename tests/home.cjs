const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
const old=fs.readFileSync('dor_trading_v53.html','utf8');
const code=html.slice(html.indexOf('/* v54 — compact home.'),html.indexOf('function renderOV() {'));
const ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);
const now=new Date(2026,9,4,12);
const sample=[{date:'2026-10-01',pnl:-100},{date:'2026-10-02',pnl:250},{date:'2026-10-03',pnl:0},{date:'2026-10-04',pnl:50,isManual:true},{date:'2026-09-28',pnl:999},{date:'2026-10-05',pnl:999},{date:'2026-10-01',pnl:NaN}];
const m=ctx._homeModel(sample,'month',now,t=>t.pnl);
assert.equal(m.net,200);assert.equal(m.drawdown,100);assert.equal(m.count,4);assert(Math.abs(m.winRate-100/3)<1e-10);assert.equal(m.excluded,1);
assert.equal(ctx._homeModel(sample,'today',now,t=>t.pnl).net,50);
assert.equal(ctx._homeModel(sample,'today',now,t=>t.pnl).winRate,null);
assert.equal(ctx._homeModel([],'all',now,t=>t.pnl).winRate,null);
assert.equal(ctx._homeModel([{date:'2026-10-01',pnl:2,fee:5}],'month',now,t=>t.pnl-t.fee).net,-3);
assert(ctx._homeMoney(-10).startsWith('−$'));
let n=0;for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!script[1].includes('src=')&&!script[1].includes('ld+json')&&script[2].trim()){new vm.Script(script[2]);n++;}}
assert.equal([...old.matchAll(/<style\b/g)].length+1,[...html.matchAll(/<style\b/g)].length);
for(const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))assert.equal((style[1].match(/{/g)||[]).length,(style[1].match(/}/g)||[]).length);
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(5000);await page.route('**/*',r=>r.abort());
 await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
 await page.addStyleTag({content:'#auth-screen,#welcome-back-screen{display:none!important}'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addScriptTag({content:`var currentUser=null;var navCalls=[];var tradeCalls=0;var accountCalls=0;var selectedAccounts=new Set(['__all__']);var accounts=[{id:'a',name:'חשבון ראשי',goals:{pass:{target:2000}}},{id:'b',name:'חשבון תרגול'}];var tradesList=[];function escHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}function tradeComm(t){return t.fee||0}function tradeNet(t){return t.pnl-tradeComm(t)}function swNav(n){navCalls.push(n)}function openAddTrade(){tradeCalls++}function openAcctGrid(){accountCalls++}function renderAcctMenu(){}function applyAcctFilter(){renderHome()}\n`+code});
 await page.evaluate(()=>{const d=new Date(),month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');tradesList=[{date:month+'-01',sym:'NQ',pnl:520,fee:8,acct:'a',btime:'09:30'},{date:month+'-02',sym:'ES',pnl:-125,fee:5,acct:'a',btime:'10:00'},{date:month+'-03',sym:'MES',pnl:310,fee:2,acct:'b',btime:'11:00'}];renderHome();});
 assert.equal(await page.locator('#home-dashboard h1').innerText(),'כל המסחר שלך. במבט אחד.');
 assert.equal(await page.locator('.home-total').innerText(),'+$690.00');
 await page.locator('#home-account-select').selectOption('a');assert.equal(await page.locator('.home-total').innerText(),'+$382.00');
 await page.locator('#home-account-select').selectOption('__all__');
 await page.getByRole('button',{name:'＋ עסקה חדשה',exact:true}).click();assert.equal(await page.evaluate(()=>tradeCalls),1);
 await page.locator('[data-home-action="accounts"]').click();assert.equal(await page.evaluate(()=>accountCalls),1);
 await page.locator('.home-shortcuts [data-home-nav="import"]').click();assert.deepEqual(await page.evaluate(()=>navCalls),['import']);
 assert.equal(await page.locator('#overview-top-widgets').isVisible(),false);
 await page.screenshot({path:'home-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await page.screenshot({path:'home-mobile.png',fullPage:true});
 await page.evaluate(()=>{tradesList=[];accounts=[];renderHome()});assert.equal(await page.locator('.home-empty').count(),2);
 await page.evaluate(()=>{accounts=[{id:'x',name:'<img src=x onerror=alert(1)>'}];tradesList=[{date:_homeDate(new Date()),pnl:-10,sym:'<img src=x onerror=alert(1)>',acct:'x'}];renderHome()});assert.equal(await page.locator('#home-dashboard img').count(),0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({scripts:n,styles:6,model:'date/fees/loss/drawdown/manual summaries/empty passed',ui:'desktop/mobile/account filter/actions/empty/XSS passed'}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});


