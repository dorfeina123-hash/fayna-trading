const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8'),base=fs.readFileSync('dor_trading_v74.html','utf8');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!m[1].includes('src=')&&!m[1].includes('ld+json'))new vm.Script(m[2]);
assert.equal(html,fs.readFileSync('dor_trading_v75.html','utf8'));
const declarations=s=>new Set([...s.matchAll(/^(?:async )?(?:function|let|const|var)\s+(\w+)/gm)].map(m=>m[1]));
assert.deepEqual([...declarations(base)].filter(n=>!declarations(html).has(n)),[]);
const styles=s=>[...s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];assert.equal(styles(base).length,styles(html).length);
for(const m of styles(html))assert.equal((m[1].match(/{/g)||[]).length,(m[1].match(/}/g)||[]).length);
function fn(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\n}',a);return (html.slice(a-6,a)==='async '?'async ':'')+html.slice(a,b+2);}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
 const billing=await page.locator('#tp-billing').evaluate(el=>el.outerHTML);
 await page.setContent('<html lang="he" dir="rtl" data-fayna-theme="dark"><head>'+styles(html).map(m=>m[0]).join('')+'</head><body>'+billing+'</body></html>');
 await page.evaluate(()=>{document.getElementById('tp-billing').classList.add('active');document.querySelector('#tp-billing>details')?.setAttribute('open','');});

 await page.addScriptTag({content:`var currentUser={uid:'alice',plan:'lifetime'};var auth={currentUser:{uid:'alice'}};var PLAN_ORDER=['free','basic','pro','premium'];var PLAN_META={free:{label:'חינם'},basic:{label:'בסיסי'},pro:{label:'מקצועי'},premium:{label:'פרימיום'}};var FEATURE_DEFS=[{key:'journal',label:'יומן מסחר'}],planFeatures={pro:{journal:true}};function _normPlan(p){return p==='lifetime'?'premium':p}function escHtml(s){return String(s).replace(/</g,'&lt;')}function customConfirm(){return Promise.resolve(true)}function showToast(t){window.lastToast=t}var writes=0;var db={collection(){writes++;throw Error('Unexpected write')}};`+fn('renderPricing')+'\n'+fn('renderMySub')});
 await page.addScriptTag({content:fs.readFileSync('fayna-subscriptions.js','utf8')});
 await page.evaluate(()=>renderPricing());assert.equal(await page.locator('#pricing-grid button:disabled').count(),4);
 await page.getByRole('button',{name:'בדיקת מצב בשרת'}).click();assert((await page.locator('#subscription-server-status').textContent()).includes('טרם חובר'));
 await page.getByRole('button',{name:'בקשת ביטול מנוי'}).click();assert.equal(await page.evaluate(()=>writes),0);
 await page.addScriptTag({content:fn('startPayment')+'\n'+fn('submitReg')+'\n'+fn('cancelSubscription')+'\n'+fn('resumeSubscription')});
 await page.evaluate(async()=>{startPayment('pro','monthly');await submitReg();await cancelSubscription();await resumeSubscription()});assert.equal(await page.evaluate(()=>writes),0);
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`subscription-${width}.png`});}
 const ids=s=>[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);const duplicates=s=>ids(s).filter((v,i,a)=>a.indexOf(v)!==i);assert.deepEqual(duplicates(html).filter(x=>!duplicates(base).includes(x)),[]);
 console.log('Subscription UI passed: RTL desktop/mobile, disabled purchases, no writes, syntax/styles/declarations/IDs preserved.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

