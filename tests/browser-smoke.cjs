const {firefox}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../extension');
(async()=>{
 const server=http.createServer((req,res)=>{const filename=req.url==='/demo.html'?path.resolve(root,'../demo.html'):path.join(root,decodeURIComponent(req.url.split('?')[0]));try{const bytes=fs.readFileSync(filename);res.setHeader('Content-Type',filename.endsWith('.js')?'application/javascript':filename.endsWith('.wasm')?'application/wasm':filename.endsWith('.html')?'text/html':'application/octet-stream');if(req.url!=='/demo.html')res.setHeader('Content-Security-Policy',"script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'");res.end(bytes)}catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await firefox.launch({headless:true,timeout:15000,env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'},firefoxUserPrefs:{'security.sandbox.content.level':0}});
 try{
 const page=await browser.newPage();page.on('pageerror',e=>console.log('pageerror:',e.message));
 await page.addInitScript(({base})=>{window.browser={browserAction:{onClicked:{addListener(){}},setBadgeText:async()=>{},setTitle:async()=>{}},runtime:{getURL:p=>base+p,onMessage:{addListener(){}}},tabs:{sendMessage:async()=>{},query:async()=>[{id:11}],captureVisibleTab:async()=>window.fixture}}},{base});
 await page.goto(base+'background.html');
 const data=fs.readFileSync(path.resolve(__dirname,'ocr-fixture.png')).toString('base64');
 console.log(await page.evaluate(async(data)=>{activeTabId=11;window.fixture='data:image/png;base64,'+data;return await recognize({region:{x:0,y:0,width:900,height:120},viewport:{width:900,height:120},language:'eng',preprocess:'original',requestId:1},{tab:{id:11,windowId:1}})},data));
 console.log(await page.evaluate(async()=>{const result=[];for(const lang of ['chi_sim','chi_tra','vie']){await getWorker(lang);result.push(lang+' loaded')}return result}));

 // Leave room beside the 1000px demo screen for the expanded 340px panel.
 const movie=await browser.newPage({viewport:{width:1800,height:800}});
 await movie.addInitScript(()=>{
  const orig=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return orig.call(this,{...o,mode:'open'})};
  window.messageListener=null;
  window.browser={storage:{local:{get:async()=>({}),set:async()=>{}}},runtime:{onMessage:{addListener:f=>window.messageListener=f},sendMessage:m=>window.ocrBridge(m)}};
 });
 let failTranslation = false, captures = 0, translations = 0;
 await movie.exposeFunction('ocrBridge',async(message)=>{
  if(message.type==='TRANSLATE') {
   await movie.evaluate(count=>window.testTranslations=count,++translations);
   return failTranslation ? {error:'Test: backend translation unavailable.'} : {translation:'Chào Cơm, OCR phụ đề hoạt động!'};
  }
  if(message.type!=='OCR')throw Error('Unexpected message in browser test');
  captures++;
  assert.equal(await movie.locator('#panel').isVisible(),true, 'Panel remains visible at capture');
  const screenshot=(await movie.screenshot()).toString('base64');
  return await page.evaluate(async({message,screenshot})=>{window.fixture='data:image/png;base64,'+screenshot;activeTabId=11;return await recognize(message,{tab:{id:11,windowId:1}})},{message,screenshot});
 });
 await movie.goto(base+'demo.html');
 await movie.addScriptTag({path:path.join(root,'content.js')});
 await movie.evaluate(()=>window.messageListener({type:'OPEN'}));
 await movie.locator('#language').selectOption('eng');
 await movie.locator('#select').click();
 const bounds=await movie.locator('.subtitle').boundingBox();
 await movie.mouse.move(bounds.x,bounds.y-6);await movie.mouse.down();await movie.mouse.move(bounds.x+bounds.width,bounds.y+bounds.height+6);await movie.mouse.up();
 await movie.locator('#once').click();
 await movie.waitForFunction(()=>[...document.querySelectorAll('div')].some(el=>el.shadowRoot?.getElementById('original')?.textContent.includes('subtitle OCR works')), {timeout:30000});
 console.log('Firefox selection → screenshot → local OCR → panel: passed (browser extension APIs mocked).');
 fs.mkdirSync(path.resolve(__dirname,'results'),{recursive:true});await movie.screenshot({path:path.resolve(__dirname,'results/panel.png')});
 await movie.locator('#translate').check();
 await movie.locator('#start').click();
 await movie.waitForFunction(()=>[...document.querySelectorAll('div')].some(el=>{
  const s=el.shadowRoot;return s?.getElementById('panel')?.classList.contains('compact') && s.getElementById('translated')?.textContent==='Chào Cơm, OCR phụ đề hoạt động!';
 }));
 assert.equal(await movie.locator('#settings').isVisible(),false);
 assert.equal(await movie.locator('#original').isVisible(),false);
 assert.equal(await movie.locator('#status').isVisible(),false);
 assert.ok((await movie.locator('#panel').boundingBox()).height < 160);
 await movie.mouse.move(30,700);
 await movie.screenshot({path:path.resolve(__dirname,'results/compact.png')});
 // Real pointer capture and movement while the original OCR loop keeps ticking.
 async function beginDrag() {
  const box=await movie.locator('#panel').boundingBox();
  const offset={x:30,y:box.height-8};
  await movie.mouse.move(box.x+offset.x,box.y+offset.y);await movie.mouse.down();
  return offset;
 }
 async function moveHost(x,y,offset) { await movie.mouse.move(x+offset.x,y+offset.y); }
 const safe={x:1444,y:16};
 let offset=await beginDrag(), before=captures, previousTranslations=translations;
 await moveHost(bounds.x,bounds.y,offset);
 await movie.waitForTimeout(1400);
 assert.equal(captures,before,'Dragging across OCR must skip new capture');
 assert.equal(await movie.locator('#settings').isVisible(),false);
 assert.equal(await movie.locator('#start').textContent(),'Dừng');
 await moveHost(safe.x,safe.y,offset);
 await movie.waitForTimeout(1400);
 assert.equal(captures,before,'Dragging outside OCR still skips capture until release');
 await movie.locator('#subtitle').evaluate(el=>el.textContent='Where are you going tonight?');
 await movie.mouse.up();
 await movie.waitForFunction(count=>window.testTranslations>count,previousTranslations);
 assert.equal(await movie.locator('#settings').isVisible(),false);
 offset=await beginDrag();before=captures;previousTranslations=translations;
 await moveHost(bounds.x,bounds.y,offset);await movie.mouse.up();
 await movie.waitForTimeout(1400);
 assert.equal(captures,before,'Dropping inside OCR must remain paused');
 assert.equal(await movie.locator('#scan-notice').isVisible(),true);
 assert.equal(await movie.locator('#scan-notice').textContent(),'Kéo khung ra ngoài vùng OCR để tiếp tục');
 assert.equal(await movie.locator('#settings').isVisible(),false);
 offset=await beginDrag();await moveHost(safe.x,safe.y,offset);
 await movie.locator('#subtitle').evaluate(el=>el.textContent='I will be back tomorrow.');
 await movie.mouse.up();
 await movie.waitForFunction(count=>window.testTranslations>count,previousTranslations);
 assert.equal(await movie.locator('#scan-notice').isVisible(),false);
 assert.equal(await movie.locator('#settings').isVisible(),false);
 assert.equal(await movie.locator('#target').inputValue(),'vi');
 console.log('Real drag across OCR / drop inside / drag out: stays compact, skips capture and resumes translation automatically.');
 await movie.locator('#panel').hover();
 await movie.locator('#expand').click();
 assert.equal(await movie.locator('#settings').isVisible(),true);
 assert.equal(await movie.locator('#language').inputValue(),'eng');
 assert.equal(await movie.locator('#start').textContent(),'Dừng');
 await movie.locator('#start').click();
 failTranslation=true;
 await movie.locator('#target').selectOption('en');
 await movie.locator('#start').click();
 await movie.waitForFunction(()=>[...document.querySelectorAll('div')].some(el=>{
  const s=el.shadowRoot;return s?.getElementById('status')?.textContent.startsWith('Test: backend translation unavailable.') && !s.getElementById('panel').classList.contains('compact');
 }));
 assert.equal(await movie.locator('#settings').isVisible(),true);
 assert.equal(await movie.locator('#start').textContent(),'Bắt đầu');
 console.log('Compact translation display / expand preserves settings and scan / translation error reopens panel: passed (translation mocked).');
 const previousCaptures = captures;
 await movie.evaluate(bounds=>{
  const host=[...document.querySelectorAll('div')].find(el=>el.shadowRoot);
  host.style.left=`${bounds.x}px`;host.style.top=`${bounds.y}px`;host.style.right='auto';
  host.shadowRoot.getElementById('start').onclick();
 },bounds);
 assert.equal(captures,previousCaptures,'Overlapping panel must block capture');
 assert.equal(await movie.locator('#scan-notice').textContent(),'Kéo khung ra ngoài vùng OCR để tiếp tục');
 assert.equal(await movie.locator('#settings').isVisible(),false);
 const statusBox = await movie.locator('#scan-notice').boundingBox();
 assert.ok(statusBox.y >= 0 && statusBox.y + statusBox.height <= 800, 'Overlap error must be visible inside the viewport');
 await movie.locator('#panel').hover();await movie.locator('#pause').click();
 assert.equal(await movie.locator('#start').textContent(),'Bắt đầu');
 console.log('Panel overlapping OCR region pauses screenshot with compact visible notice; Stop ends session: passed.');
 }finally{await browser.close();server.close()}

})().catch(e=>{console.error(e);process.exit(1)});
