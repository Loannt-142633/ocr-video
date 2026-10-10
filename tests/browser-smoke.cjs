const {firefox}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../extension');
(async()=>{
 let videoBytes, corsServer;
 const server=http.createServer((req,res)=>{if(req.url==='/video-fixture.webm' && videoBytes){res.setHeader('Content-Type','video/webm');res.end(videoBytes);return;}const filename=req.url==='/demo.html'?path.resolve(root,'../demo.html'):path.join(root,decodeURIComponent(req.url.split('?')[0]));try{const bytes=fs.readFileSync(filename);res.setHeader('Content-Type',filename.endsWith('.js')?'application/javascript':filename.endsWith('.wasm')?'application/wasm':filename.endsWith('.html')?'text/html':'application/octet-stream');if(req.url!=='/demo.html')res.setHeader('Content-Security-Policy',"script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'");res.end(bytes)}catch{res.writeHead(404).end()}});
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
 let failTranslation = false, captures = 0, translations = 0, videoFrames = 0, tabFrames = 0;
 await movie.exposeFunction('ocrBridge',async(message)=>{
  if(message.type==='TRANSLATE') {
   await movie.evaluate(count=>window.testTranslations=count,++translations);
   return failTranslation ? {error:'Test: backend translation unavailable.'} : {translation:'Chào Cơm, OCR phụ đề hoạt động!'};
  }
  if(message.type!=='OCR')throw Error('Unexpected message in browser test');
  captures++;
  assert.equal(await movie.locator('#panel').isVisible(),true, 'Panel remains visible at capture');
  let screenshot = null;
  if(message.frame) videoFrames++; else {tabFrames++;screenshot=(await movie.screenshot()).toString('base64');}
  const result=await page.evaluate(async({message,screenshot})=>{if(screenshot)window.fixture='data:image/png;base64,'+screenshot;activeTabId=11;return await recognize(message,{tab:{id:11,windowId:1}})},{message,screenshot});
  if(!message.frame)await movie.evaluate(({count,result})=>{window.testCompletedTabFrames=count;window.testTabOCR=result;},{count:tabFrames,result});
  return result;
 });
 await movie.goto(base+'demo.html');
 await movie.addScriptTag({path:path.join(root,'video-frame.js')});
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
 assert.equal(await movie.locator('#scan-notice').textContent(),'Trang này cần đặt khung ngoài vùng OCR');
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
 assert.equal(await movie.locator('#scan-notice').textContent(),'Trang này cần đặt khung ngoài vùng OCR');
 assert.equal(await movie.locator('#settings').isVisible(),false);
 const statusBox = await movie.locator('#scan-notice').boundingBox();
 assert.ok(statusBox.y >= 0 && statusBox.y + statusBox.height <= 800, 'Overlap error must be visible inside the viewport');
 await movie.locator('#panel').hover();await movie.locator('#pause').click();
 assert.equal(await movie.locator('#start').textContent(),'Bắt đầu');
 console.log('Panel overlapping OCR region pauses screenshot with compact visible notice; Stop ends session: passed.');
 // A real video frame with baked-in subtitles; encode the same frame for a CORS test.
 const recording=await movie.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=120;
  const ctx=canvas.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,900,120);
  ctx.fillStyle='white';ctx.font='bold 44px sans-serif';ctx.fillText('Video subtitles stay visible!',30,75);
  const stream=canvas.captureStream(10);
  const video=document.createElement('video');video.id='fixture-video';video.muted=true;video.srcObject=stream;
  video.style.cssText='position:fixed;left:100px;top:200px;width:900px;height:240px;object-fit:contain;object-position:50% 50%;background:black';
  document.body.appendChild(video);await video.play();
  return canvas.toDataURL('image/jpeg').split(',')[1];
 });
 const browserCache=process.env.PLAYWRIGHT_BROWSERS_PATH || (process.platform==='win32'?path.join(process.env.LOCALAPPDATA,'ms-playwright'):
  process.platform==='darwin'?path.join(os.homedir(),'Library/Caches/ms-playwright'):path.join(os.homedir(),'.cache/ms-playwright'));
 const ffmpegDir=fs.readdirSync(browserCache).filter(name=>/^ffmpeg-\d+$/.test(name)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))[0];
 const ffmpeg=process.env.PLAYWRIGHT_FFMPEG_PATH || path.join(browserCache,ffmpegDir,
  process.platform==='win32'?'ffmpeg-win64.exe':process.platform==='darwin'?'ffmpeg-mac':'ffmpeg-linux');
 const fixtureDir=fs.mkdtempSync(path.join(os.tmpdir(),'ocr-video-fixture-'));
 const fixturePath=path.join(fixtureDir,'video.webm');
 const encoded=spawnSync(ffmpeg,['-f','image2pipe','-c:v','mjpeg','-framerate','1','-i','pipe:0','-c:v','libvpx-vp9','-pix_fmt','yuv420p','-f','webm',fixturePath],
  {input:Buffer.concat(Array(3).fill(Buffer.from(recording,'base64'))),maxBuffer:8000000,timeout:10000,windowsHide:true});
 try {assert.equal(encoded.status,0,encoded.stderr?.toString() || String(encoded.error));videoBytes=fs.readFileSync(fixturePath);}
 finally {if(fs.existsSync(fixturePath))fs.unlinkSync(fixturePath);fs.rmdirSync(fixtureDir);}
 await movie.locator('#preprocess').selectOption('original');
 await movie.locator('#target').selectOption('vi');failTranslation=false;
 await movie.locator('#select').click();
 await movie.mouse.move(100,260);await movie.mouse.down();await movie.mouse.move(1000,380);await movie.mouse.up();
 const oldTabs=tabFrames;
 await movie.evaluate(()=>{
  const host=[...document.querySelectorAll('div')].find(el=>el.shadowRoot);
  host.style.left='400px';host.style.top='270px';host.style.right='auto';
  host.shadowRoot.getElementById('start').onclick();
 });
 await movie.waitForFunction(()=>[...document.querySelectorAll('div')].some(el=>{
  const s=el.shadowRoot;return s?.getElementById('original')?.textContent.includes('Video subtitles stay visible') &&
   s.getElementById('translated').textContent==='Chào Cơm, OCR phụ đề hoạt động!';
 }));
 assert.ok(videoFrames>0);assert.equal(tabFrames,oldTabs,'Direct video OCR must never take a screenshot');
 assert.equal(await movie.locator('#scan-notice').isVisible(),false);
 const previousVideoFrames=videoFrames;
 offset=await beginDrag();await moveHost(500,280,offset);await movie.waitForTimeout(1400);
 assert.ok(videoFrames>previousVideoFrames,'Video capture continues during dragging across OCR');
 await movie.mouse.up();assert.equal(await movie.locator('#settings').isVisible(),false);
 console.log('Canvas video with popup covering subtitles: actual OCR correct, zero tab screenshots, drag keeps scanning.');
 // Same video bytes from a different origin, with no CORS permission.
 await movie.locator('#panel').hover();await movie.locator('#pause').click();
 corsServer=http.createServer((req,res)=>{
  const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  const start=range?Number(range[1]):0,end=range && range[2]?Math.min(videoBytes.length-1,Number(range[2])):videoBytes.length-1;
  res.setHeader('Content-Type','video/webm');res.setHeader('Accept-Ranges','bytes');
  res.setHeader('Content-Length',end-start+1);
  if(range){res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${videoBytes.length}`);}
  res.end(videoBytes.subarray(start,end+1));
 });
 await new Promise(resolve=>corsServer.listen(0,'127.0.0.1',resolve));
 await movie.evaluate(async url=>{
  const original=document.getElementById('fixture-video'),video=document.createElement('video');
  video.id=original.id;video.style.cssText=original.style.cssText;video.muted=true;video.src=url;video.loop=true;original.replaceWith(video);
  await Promise.race([video.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Cross-origin video fixture did not load: '+JSON.stringify({ready:video.readyState,network:video.networkState,error:video.error?.code,duration:video.duration,time:video.currentTime,paused:video.paused,buffered:Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)])}))),10000))]);
 },'http://127.0.0.1:'+corsServer.address().port+'/video-fixture.webm');
 const corsResult=await movie.evaluate(()=>VideoFrameCapture.capture({x:100,y:260,width:900,height:120}));
 assert.equal(corsResult.frame,null);assert.match(corsResult.reason,/CORS/);
 const beforeFallback=tabFrames;
 await movie.evaluate(()=>{[...document.querySelectorAll('div')].find(el=>el.shadowRoot).shadowRoot.getElementById('start').onclick();});
 await movie.waitForTimeout(1400);
 assert.equal(tabFrames,beforeFallback,'CORS fallback must pause if the popup still overlaps');
 assert.equal(await movie.locator('#scan-notice').isVisible(),true);
 offset=await beginDrag();await moveHost(safe.x,safe.y,offset);await movie.mouse.up();
 await movie.waitForFunction(count=>window.testCompletedTabFrames>count,beforeFallback);
 const fallbackOCR=await movie.evaluate(()=>window.testTabOCR);
 assert.ok(fallbackOCR.text.includes('Video subtitles stay visible'),JSON.stringify(fallbackOCR));
 assert.match(await movie.locator('#footer').textContent(),/CORS/);
 assert.equal(await movie.locator('#settings').isVisible(),false);
 await movie.locator('#panel').hover();await movie.locator('#pause').click();
 console.log('Real cross-origin video taints canvas: tab fallback pauses for overlap, resumes outside and OCR succeeds.');
 }finally{await browser.close();server.close();corsServer?.close()}

})().catch(e=>{console.error(e);process.exit(1)});
