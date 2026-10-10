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
  if (!tab || tab.id !== activeTabId) throw new Error('Hãy bấm biểu tượng extension trên tab này.');
  const [visible] = await browser.tabs.query({active: true, windowId: tab.windowId});
  if (!visible || visible.id !== tab.id) throw new Error('Tab phim phải đang hiển thị.');
  if (busy) return {busy: true};
  busy = true;
  try {
    // The panel stays visible; content.js rejects regions overlapping it.
    const screenshot = await browser.tabs.captureVisibleTab(tab.windowId, {format: 'png'});
    const [stillVisible] = await browser.tabs.query({active: true, windowId: tab.windowId});
    if (!stillVisible || stillVisible.id !== tab.id) throw new Error('Tab đã thay đổi trong lúc chụp. Đã bỏ ảnh này.');
    const img = new Image(); img.src = screenshot; await img.decode();
    const crop = OCRUtils.cropRectangle(message.region, message.viewport, {width: img.width, height: img.height});
    const canvas = document.createElement('canvas');
    const scale = Math.min(2, 2400 / crop.width);
    canvas.width = Math.round(crop.width * scale); canvas.height = Math.round(crop.height * scale);
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
    if (typeof data.translation !== 'string') throw new Error('Backend trả kết quả sai định dạng.');
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
  if (!sender.tab || sender.tab.id !== activeTabId) return undefined;
  if (message.type === 'OCR') return recognize(message, sender).catch(error => ({error: error.message}));
  if (message.type === 'TRANSLATE') return translate(message.text, message.target).catch(error => ({error: error.message}));
});
