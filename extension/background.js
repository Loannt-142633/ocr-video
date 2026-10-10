/* OCR is deliberately kept in a privileged extension page, never in the website. */
const LANGUAGES = new Set(['chi_sim', 'chi_tra', 'eng', 'vie']);
let worker = null, workerLanguage = null, workerReady = null, busy = false;
let activeTabId = null;
const translationCache = new Map();

browser.browserAction.onClicked.addListener(async tab => {
  try {
    if (activeTabId !== null && activeTabId !== tab.id)
      await browser.tabs.sendMessage(activeTabId, {type: 'STOP'}).catch(() => {});
    activeTabId = tab.id;
    try { await browser.tabs.sendMessage(tab.id, {type: 'OPEN'}); }
    catch {
      await browser.tabs.executeScript(tab.id, {file: 'video-frame.js'});
      await browser.tabs.executeScript(tab.id, {file: 'content.js'});
      await browser.tabs.sendMessage(tab.id, {type: 'OPEN'});
    }
  } catch (error) {
    console.error(error);
    await browser.browserAction.setBadgeText({text: '!'});
    await browser.browserAction.setTitle({title: 'Không mở được trên trang này. Hãy dùng trang web http/https thông thường.'});
  }
});

async function getWorker(language) {
  if (!LANGUAGES.has(language)) throw new Error('Ngôn ngữ OCR chưa được hỗ trợ.');
  if (worker && workerLanguage === language) return worker;
  if (workerReady) await workerReady;
  if (worker && workerLanguage === language) return worker;
  workerReady = (async () => {
    if (worker) await worker.terminate();
    worker = null; workerLanguage = null;
    const next = await Tesseract.createWorker(language, 1, {
      workerPath: browser.runtime.getURL('vendor/worker.min.js'),
      corePath: browser.runtime.getURL('vendor/core'),
      langPath: browser.runtime.getURL('lang').replace(/\/$/, ''),
      workerBlobURL: false, gzip: true
    });
    await next.setParameters({tessedit_pageseg_mode: '6', preserve_interword_spaces: '1'});
    worker = next; workerLanguage = language;
    return worker;
  })();
  try { return await workerReady; } finally { workerReady = null; }
}

async function recognize(message, sender) {
  const tab = sender.tab;
  if (!tab || tab.id !== activeTabId || (sender.frameId != null && sender.frameId !== 0) ||
      (browser.runtime.id && sender.id !== browser.runtime.id)) throw new Error('Hãy bấm biểu tượng extension trên tab này.');
  if (!LANGUAGES.has(message.language)) throw new Error('Ngôn ngữ OCR chưa được hỗ trợ.');
  const [visible] = await browser.tabs.query({active: true, windowId: tab.windowId});
  if (!visible || visible.id !== tab.id) throw new Error('Tab phim phải đang hiển thị.');
  if (busy) return {busy: true};
  busy = true;
  try {
    const frame = message.frame;
    if (frame != null) validateFrame(frame);
    const screenshot = frame ? frame.dataURL : await browser.tabs.captureVisibleTab(tab.windowId, {format: 'png'});
    const [stillVisible] = await browser.tabs.query({active: true, windowId: tab.windowId});
    if (!stillVisible || stillVisible.id !== tab.id) throw new Error('Tab đã thay đổi trong lúc chụp. Đã bỏ ảnh này.');
    const img = new Image(); img.src = screenshot; await img.decode();
    if (frame && (img.width !== frame.width || img.height !== frame.height)) throw new Error('Kích thước ảnh video không khớp.');
    const crop = frame ? {x: 0, y: 0, width: img.width, height: img.height} :
      OCRUtils.cropRectangle(message.region, message.viewport, {width: img.width, height: img.height});
    const canvas = document.createElement('canvas');
    const scale = Math.min(2, 2400 / crop.width, 2400 / crop.height, Math.sqrt(4000000 / (crop.width * crop.height)));
    canvas.width = Math.max(1, Math.floor(crop.width * scale)); canvas.height = Math.max(1, Math.floor(crop.height * scale));
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    if (message.preprocess === 'white') {
      // Optionally isolate neutral white text near dark outlines instead of every bright highlight.
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      OCRUtils.whiteSubtitlePixels(pixels.data, canvas.width, canvas.height, Math.max(2,Math.round(3*scale)), message.noiseFilter !== false);
      context.putImageData(pixels, 0, 0);
    }
    const engine = await getWorker(message.language);
    const result = await engine.recognize(canvas, {}, {text:true,blocks:message.noiseFilter !== false});
    if (message.noiseFilter !== false) return OCRUtils.filterSubtitle(result.data, message.language);
    return {text: OCRUtils.cleanText(result.data.text), confidence: result.data.confidence};
  } finally { busy = false; }
}

function validateFrame(frame) {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 ||
      frame.width > 2400 || frame.height > 2400 || frame.width * frame.height > 4000000 ||
      typeof frame.dataURL !== 'string' || frame.dataURL.length > 8000000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(frame.dataURL)) throw new Error('Ảnh video không hợp lệ hoặc quá lớn.');
  // Check PNG dimensions before decoding, so a small payload cannot declare a huge bitmap.
  const bytes = Uint8Array.from(atob(frame.dataURL.slice(22, 66)), char => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  if (bytes.length < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
      view.getUint32(16) !== frame.width || view.getUint32(20) !== frame.height) throw new Error('Ảnh PNG video không hợp lệ.');
}

async function translate(text, target) {
  text = OCRUtils.cleanText(text);
  if (!text || text.length > 4000) throw new Error('Nội dung dịch không hợp lệ.');
  if (!['vi', 'en', 'zh', 'ja', 'ko'].includes(target)) throw new Error('Ngôn ngữ đích không hợp lệ.');
  const key = target + '\n' + text;
  if (translationCache.has(key)) return {translation: translationCache.get(key)};
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('http://127.0.0.1:8787/translate', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text, target}), signal: controller.signal
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const detail = typeof error?.detail === 'string' ? error.detail.trim() : '';
      throw new Error(detail || `Backend dịch trả lỗi ${response.status}. Kiểm tra terminal backend.`);
    }
    const data = await response.json();
    if (typeof data?.translation !== 'string' || !data.translation.trim()) throw new Error('Backend không trả bản dịch hợp lệ.');
    if (translationCache.size >= 200) translationCache.delete(translationCache.keys().next().value);
    translationCache.set(key, data.translation);
    return {translation: data.translation};
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Dịch quá 45 giây. Hãy thử model nhanh hơn.');
    if (error instanceof TypeError) throw new Error('Chưa kết nối backend dịch tại 127.0.0.1:8787. OCR vẫn dùng được.');
    throw error;
  } finally { clearTimeout(timeout); }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab || sender.tab.id !== activeTabId || (sender.frameId != null && sender.frameId !== 0) ||
      (browser.runtime.id && sender.id !== browser.runtime.id)) return undefined;
  if (message.type === 'OCR') return recognize(message, sender).catch(error => ({error: error.message}));
  if (message.type === 'TRANSLATE') return translate(message.text, message.target).catch(error => ({error: error.message}));
});
