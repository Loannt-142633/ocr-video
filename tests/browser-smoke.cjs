const {firefox}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
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

 const movie=await browser.newPage({viewport:{width:1200,height:800}});
 await movie.addInitScript(()=>{
  const orig=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return orig.call(this,{...o,mode:'open'})};
  window.messageListener=null;
  window.browser={storage:{local:{get:async()=>({}),set:async()=>{}}},runtime:{onMessage:{addListener:f=>window.messageListener=f},sendMessage:m=>window.ocrBridge(m)}};
 });
 await movie.exposeFunction('ocrBridge',async(message)=>{
  if(message.type!=='OCR')throw Error('Unexpected translation in offline test');
  const screenshot=(await movie.screenshot()).toString('base64');
  await movie.evaluate(id=>window.messageListener({type:'CAPTURE_DONE',requestId:id}),message.requestId);
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
 }finally{await browser.close();server.close()}

})().catch(e=>{console.error(e);process.exit(1)});
