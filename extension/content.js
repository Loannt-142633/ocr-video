(() => {
  if (globalThis.__comSubtitleOCR) return;
  globalThis.__comSubtitleOCR = true;
  let host, ui, region = null, running = false, generation = 0, selecting = false;
  let lastText = '', requestCounter = 0, pendingCapture = null;
  let regionViewport = null, lastNonempty = 0;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = id => ui.getElementById(id);
  const status = text => { if (ui) $('status').textContent = text; };

  function setCompact(compact) {
    if (!ui) return;
    $('panel').classList.toggle('compact', compact);
    $('panel').dataset.translation = String($('translate').checked);
    $('panel').tabIndex = compact ? 0 : -1;
    $('collapse').textContent = compact ? 'Mở cài đặt' : 'Thu gọn';
    if (compact && $('translate').checked) {
      $('translated').hidden = false;
      if (!$('translated').textContent) $('translated').textContent = 'Đang chờ bản dịch…';
    }
  }

  function stop(note = 'Đã dừng.') {
    running = false; generation++;
    if (host) host.style.visibility = 'visible';
    if (ui) { setCompact(false); $('start').textContent = 'Bắt đầu'; status(note); }
  }
  function mount() {
    if (host) { host.style.display = ''; setCompact(false); return; }
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:16px;right:16px;width:340px;max-width:calc(100vw - 24px);z-index:2147483647;';
    document.documentElement.appendChild(host);
    ui = host.attachShadow({mode: 'closed'});
    ui.innerHTML = `
      <style>
        :host{color-scheme:dark;font:14px/1.45 system-ui,sans-serif;color:#f5f7ff}
        *{box-sizing:border-box} .panel{background:#172031f5;border:1px solid #526078;border-radius:14px;box-shadow:0 8px 32px #0008;padding:14px}
        header{display:flex;justify-content:space-between;align-items:center;cursor:move;touch-action:none;font-weight:700;color:#a9ead6;margin-bottom:10px}
        button,select{font:inherit;color:#fff;background:#293850;border:1px solid #53637c;border-radius:7px;padding:7px;cursor:pointer}
        button:hover{background:#3a4f70} #close{padding:1px 8px} label{display:block;margin:9px 0} select{max-width:100%}
        .row{display:flex;gap:6px;flex-wrap:wrap} .row button{flex:1} #start{background:#1c6657}
        #status{font-size:12px;color:#bdd0df;margin:10px 0;min-height:18px}
        .text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:140px;overflow:auto;padding:9px;background:#0e1625;border-radius:7px;user-select:text}
        #translated{color:#b3f3de;margin-top:8px} .small{font-size:12px;color:#aabacd} input[type=number]{width:72px;padding:5px;background:#293850;color:#fff;border:1px solid #53637c;border-radius:5px}
        .compact-tools{display:none}
        .panel.compact{position:relative;padding:8px;cursor:move;touch-action:none}
        .compact header,.compact #settings,.compact #status,.compact #footer{display:none}
        .compact[data-translation="true"] #original{display:none}
        .compact[data-translation="false"] #translated{display:none}
        .compact .text{background:transparent;padding:4px;margin:0!important;font-size:18px;line-height:1.5;max-height:220px;user-select:none}
        .compact-tools{position:absolute;right:4px;top:4px;gap:4px;background:#172031;border-radius:7px;padding:3px}
        .compact:hover .compact-tools,.compact:focus-within .compact-tools{display:flex}
        .compact-tools button{font-size:12px;padding:3px 7px;white-space:nowrap}
      </style>
      <section id="panel" class="panel" tabindex="-1">
        <header id="drag"><span>Cơm · OCR phụ đề</span><button id="close" title="Đóng">×</button></header>
        <div id="settings">
        <div class="small">Kéo chọn vùng chữ. Bản này đọc chữ trong hình; chưa nghe âm thanh.</div>
        <label>Ngôn ngữ chữ <select id="language"><option value="chi_sim">Trung giản thể</option><option value="chi_tra">Trung phồn thể</option><option value="eng">English</option><option value="vie">Tiếng Việt</option></select></label>
        <label>Xử lý ảnh <select id="preprocess"><option value="white">Chữ trắng trên video</option><option value="original">Ảnh gốc (chữ màu / nền sáng)</option></select></label>
        <label>Khoảng quét <input id="interval" type="number" min="800" max="10000" step="100" value="1200"> ms</label>
        <label><input id="translate" type="checkbox"> Dịch AI qua backend local</label>
        <label>Ngôn ngữ đích <select id="target"><option value="vi">Tiếng Việt</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option><option value="ko">한국어</option></select></label>
        <div class="row"><button id="select">Chọn vùng</button><button id="once">Đọc một lần</button><button id="start">Bắt đầu</button></div>
        <button id="collapse" style="margin-top:8px" title="Chỉ hiện nội dung phụ đề">Thu gọn</button>
        </div>
        <div id="status" role="status">Chọn vùng phụ đề để bắt đầu.</div>
        <div id="original" class="text">Chữ OCR sẽ hiện ở đây.</div>
        <div id="translated" class="text" hidden></div>
        <div id="footer" class="small" style="margin-top:8px">Chỉ quét tab đang xem. Esc hủy chọn vùng.</div>
        <div class="compact-tools"><button id="expand" title="Mở lại cài đặt">⚙ Cài đặt</button><button id="pause" title="Dừng OCR và mở cài đặt">Dừng</button><button id="compact-close" title="Đóng">×</button></div>
      </section>`;
    $('select').onclick = selectRegion;
    $('start').onclick = () => running ? stop() : start();
    $('once').onclick = async () => { if (running) stop(); await scan(generation); };
    $('close').onclick = () => { stop(); host.style.display = 'none'; };
    $('compact-close').onclick = $('close').onclick;
    $('collapse').onclick = () => setCompact(true);
    $('expand').onclick = () => setCompact(false);
    $('pause').onclick = () => stop();
    for (const name of ['language', 'preprocess', 'target', 'translate']) {
      $(name).onchange = () => { stop('Đã đổi cấu hình. Bấm Bắt đầu để tiếp tục.'); lastText = ''; $('translated').textContent = ''; save(); };
    }
    $('interval').onchange = save;
    browser.storage.local.get('settings').then(({settings}) => {
      if (!settings) return;
      for (const key of ['language', 'preprocess', 'target', 'interval']) if (settings[key] != null) $(key).value = settings[key];
      // Translation always requires an explicit opt-in on each page.
    }).catch(() => {});
    let drag;
    $('panel').onpointerdown = event => {
      if (event.target.closest('button,select,input')) return;
      if (!$('panel').classList.contains('compact') && !event.target.closest('header')) return;
      const box = host.getBoundingClientRect();
      drag = {x: event.clientX - box.left, y: event.clientY - box.top};
      $('panel').setPointerCapture(event.pointerId);
    };
    $('panel').onpointermove = event => {
      if (!drag) return;
      host.style.right = 'auto';
      host.style.left = `${Math.max(0, Math.min(innerWidth - host.offsetWidth, event.clientX - drag.x))}px`;
      host.style.top = `${Math.max(0, Math.min(innerHeight - 50, event.clientY - drag.y))}px`;
    };
    $('panel').onpointerup = $('panel').onpointercancel = () => { drag = null; };
  }
  function save() {
    const settings = {};
    for (const key of ['language', 'preprocess', 'target', 'interval']) settings[key] = $(key).value;
    browser.storage.local.set({settings}).catch(() => {});
  }
  function selectRegion() {
    if (selecting) return;
    stop(); selecting = true; host.style.visibility = 'hidden';
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0003;cursor:crosshair;touch-action:none;';
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;border:2px solid #79ffdb;background:#79ffdb22;pointer-events:none;';
    const hint = document.createElement('div'); hint.textContent = 'Kéo một hình chữ nhật bao quanh phụ đề · Esc để hủy';
    hint.style.cssText = 'position:absolute;top:12px;left:12px;padding:10px;background:#172031;color:white;font:16px system-ui;pointer-events:none;';
    cover.append(box, hint); document.documentElement.appendChild(cover);
    let anchor;
    function cleanup() { cover.remove(); document.removeEventListener('keydown', escape, true); host.style.visibility = 'visible'; selecting = false; }
    function escape(event) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cleanup(); } }
    document.addEventListener('keydown', escape, true);
    cover.onpointerdown = event => { event.preventDefault(); anchor = {x: event.clientX, y: event.clientY}; cover.setPointerCapture(event.pointerId); };
    cover.onpointermove = event => {
      if (!anchor) return;
      Object.assign(box.style, {left: `${Math.min(anchor.x, event.clientX)}px`, top: `${Math.min(anchor.y, event.clientY)}px`, width: `${Math.abs(event.clientX-anchor.x)}px`, height: `${Math.abs(event.clientY-anchor.y)}px`});
    };
    cover.onpointercancel = cleanup;
    cover.onpointerup = event => {
      if (!anchor) return;
      const chosen = {x: Math.min(anchor.x,event.clientX), y: Math.min(anchor.y,event.clientY), width: Math.abs(anchor.x-event.clientX), height: Math.abs(anchor.y-event.clientY)};
      cleanup();
      if (chosen.width < 20 || chosen.height < 10) { status('Vùng quá nhỏ. Hãy chọn lại.'); return; }
      region = chosen; regionViewport = {width: innerWidth, height: innerHeight}; lastText = '';
      status(`Đã chọn vùng ${Math.round(region.width)} × ${Math.round(region.height)}. Bấm Đọc một lần hoặc Bắt đầu.`);
    };
  }
  async function scan(token) {
    if (!region) { status('Cơm chọn vùng phụ đề trước nhé.'); return; }
    if (document.hidden) { stop('Đã dừng vì tab không còn hiển thị.'); return; }
    if (innerWidth !== regionViewport.width || innerHeight !== regionViewport.height) { region = null; stop('Kích thước trang thay đổi. Hãy chọn lại vùng.'); return; }
    const requestId = ++requestCounter;
    pendingCapture = requestId;
    status('Đang đọc chữ… Lần đầu cần nạp mô hình OCR.');
    host.style.visibility = 'hidden';
    let result;
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (token !== generation) return;
      result = await browser.runtime.sendMessage({type: 'OCR', requestId, region, viewport: regionViewport, language: $('language').value, preprocess: $('preprocess').value});
    } catch (error) { result = {error: error.message}; }
    finally { if (pendingCapture === requestId) { pendingCapture = null; host.style.visibility = 'visible'; } }
    if (token !== generation) return;
    if (!result || result.error) { stop(result?.error || 'Không kết nối được extension. Hãy tải lại trang.'); return; }
    if (result.busy) { status('OCR đang xử lý. Chờ lần quét tiếp theo.'); return; }
    const text = result.text;
    if (!text || result.confidence < 25) {
      status('Chưa thấy chữ rõ. Thử đổi xử lý ảnh hoặc chọn vùng sát hơn.');
      if (Date.now() - lastNonempty > 3500) { lastText = ''; $('original').textContent = ''; $('translated').textContent = ''; }
      return;
    }
    lastNonempty = Date.now();
    status(`Đã đọc · độ tin cậy OCR ${Math.round(result.confidence)}% (ước lượng).`);
    if (text === lastText) return;
    lastText = text; $('original').textContent = text; $('translated').hidden = !$('translate').checked;
    $('translated').textContent = $('translate').checked ? 'Đang dịch…' : '';
    if ($('translate').checked) {
      status('Đang dịch…');
      const translated = await browser.runtime.sendMessage({type: 'TRANSLATE', text, target: $('target').value}).catch(error => ({error: error.message}));
      if (token !== generation) return;
      if (translated?.error || !translated) {
        setCompact(false); $('translated').textContent = '';
        status(translated?.error || 'Không nhận được kết quả dịch.'); lastText = ''; return;
      }
      $('translated').textContent = translated.translation; status('Đã dịch.');
    }
  }
  async function start() {
    if (!region) { status('Cơm chọn vùng trước nhé.'); return; }
    if (running) return;
    running = true; const token = ++generation; $('start').textContent = 'Dừng';
    setCompact(true);
    while (running && generation === token) {
      const started = Date.now();
      await scan(token);
      if (!running || generation !== token) break;
      const interval = Math.max(800, Math.min(10000, Number($('interval').value) || 1200));
      await wait(Math.max(100, interval - (Date.now() - started)));
    }
  }
  browser.runtime.onMessage.addListener(message => {
    if (message.type === 'OPEN') { mount(); return Promise.resolve({ok: true}); }
    if (message.type === 'STOP') { stop('Đã dừng vì Cơm mở OCR ở tab khác.'); return Promise.resolve({ok: true}); }
    if (message.type === 'CAPTURE_DONE' && message.requestId === pendingCapture) {
      pendingCapture = null; host.style.visibility = 'visible'; return Promise.resolve({ok: true});
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) stop('Đã dừng khi đổi tab.'); });
  window.addEventListener('scroll', () => { if (region) { region = null; stop('Trang đã cuộn. Hãy chọn lại vùng phụ đề.'); } }, {passive: true});
  window.addEventListener('resize', () => { if (region) { region = null; stop('Kích thước trang thay đổi. Hãy chọn lại vùng.'); } });
  document.addEventListener('fullscreenchange', () => { region = null; stop('Chế độ toàn màn hình thay đổi. Bản đầu dùng ở chế độ thường hoặc rạp phim.'); });
})();
