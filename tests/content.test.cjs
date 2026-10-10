const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
};
const tick = () => new Promise(resolve => setImmediate(resolve));

// Minimal DOM boundary: run the actual content script and its event handlers.
function fixture(sendMessage, {manualTimers = false} = {}) {
  const timers = [];
  const elements = new Map();
  function element(id = '') {
    const classes = new Set();
    return {
      id, style: {}, dataset: {}, textContent: '', hidden: false, checked: false,
      value: '', classList: {toggle(c, on) { on ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c)},
      append() {}, remove() {}, setPointerCapture() {},
      getBoundingClientRect() { return {left: 800, right: 1140, top: 16, bottom: 500}; },
      attachShadow() {
        this.shadow = {getElementById: name => elements.get(name)};
        Object.defineProperty(this.shadow, 'innerHTML', {set(html) {
          for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element(match[1]));
          elements.get('language').value = 'eng';
          elements.get('target').value = 'vi';
          elements.get('interval').value = '1200';
        }});
        return this.shadow;
      }
    };
  }
  const created = [];
  let listener;
  const context = {
    document: {hidden: false, documentElement: {appendChild() {}}, addEventListener() {}, removeEventListener() {},
      createElement() { const el = element(); created.push(el); return el; }},
    window: {addEventListener() {}}, innerWidth: 1200, innerHeight: 800, Date,
    setTimeout: manualTimers ? fn => timers.push(fn) : setTimeout, browser: {storage: {local: {get: async () => ({}), set: async () => {}}},
      runtime: {onMessage: {addListener(f) { listener = f; }}, sendMessage}}
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../extension/content.js'), 'utf8'), context);
  listener({type: 'OPEN'});
  const host = created[0];
  const get = id => elements.get(id);
  function select() {
    get('select').onclick();
    assert.equal(host.style.visibility, 'hidden', 'Selection may hide the panel');
    const cover = created[created.length - 3];
    cover.onpointerdown({preventDefault() {}, clientX: 100, clientY: 600, pointerId: 1});
    cover.onpointerup({clientX: 700, clientY: 700});
    assert.equal(host.style.visibility, 'visible');
  }
  select();
  async function nextScan() {
    assert.ok(timers.length, 'The original scan loop must still be active');
    timers.shift()();
    await tick();
  }
  return {host, get, listener, nextScan, pendingTimers: () => timers.length};
}

test('panel remains visible throughout OCR capture', async () => {
  const pending = deferred();
  let captures = 0;
  const f = fixture(message => {
    assert.equal(message.type, 'OCR');
    assert.equal(f.host.style.visibility, 'visible');
    captures++;
    return pending.promise;
  });
  const scan = f.get('once').onclick();
  await tick();
  assert.equal(captures, 1);
  assert.equal(f.host.style.visibility, 'visible');
  pending.resolve({text: 'Hello', confidence: 95});
  await scan;
  assert.equal(f.get('original').textContent, 'Hello');
});

test('overlapping panel pauses capture without stopping or expanding and explains how to move it', async () => {
  let captures = 0;
  const f = fixture(async () => { captures++; }, {manualTimers: true});
  f.host.getBoundingClientRect = () => ({left: 200, right: 540, top: 650, bottom: 750});
  const loop = f.get('start').onclick();
  await tick();
  assert.equal(captures, 0);
  assert.equal(f.get('scan-notice').hidden, false);
  assert.equal(f.get('panel').classList.contains('compact'), true);
  assert.equal(f.get('start').textContent, 'Dừng');
  assert.equal(f.host.style.visibility, 'visible');
  f.get('pause').onclick();
  await f.nextScan();
  await loop;
});

test('old translation stays visible while a new sentence is translated', async () => {
  const pending = deferred();
  let count = 0;
  const f = fixture(async m => m.type === 'OCR' ? {text: `Line ${++count}`, confidence: 95} :
    count === 1 ? {translation: 'Bản dịch cũ'} : pending.promise);
  f.get('translate').checked = true;
  await f.get('once').onclick();
  const next = f.get('once').onclick();
  await tick();
  assert.equal(f.get('translated').textContent, 'Bản dịch cũ');
  pending.resolve({translation: 'Bản dịch mới'});
  await next;
  assert.equal(f.get('translated').textContent, 'Bản dịch mới');
});

test('configuration change cancels old translation; queued new scan remains serialized', async () => {
  const pending = deferred();
  const fresh = deferred();
  let captures = 0, translations = 0;
  const f = fixture(async m => {
    if (m.type === 'OCR') { captures++; return {text: 'Hello', confidence: 95}; }
    translations++;
    return translations === 1 ? pending.promise : fresh.promise;
  });
  f.get('translate').checked = true;
  const old = f.get('once').onclick();
  await tick();
  f.get('target').value = 'en';
  f.get('target').onchange();
  const next = f.get('once').onclick();
  await tick();
  assert.equal(captures, 1, 'Do not send a new OCR while old translation is in flight');
  pending.resolve({translation: 'STALE'});
  await old;
  await tick();
  assert.equal(f.get('translated').textContent, '', 'Stale response must not appear while new translation is pending');
  fresh.resolve({translation: 'New target'});
  await next;
  assert.equal(captures, 2);
  assert.equal(f.get('translated').textContent, 'New target');
});

test('stop discards pending OCR without translating or changing text', async () => {
  const pending = deferred();
  let translations = 0;
  const f = fixture(m => { if (m.type === 'OCR') return pending.promise; translations++; });
  f.get('translate').checked = true;
  f.get('original').textContent = 'Existing';
  const old = f.get('once').onclick();
  await tick();
  f.listener({type: 'STOP'});
  pending.resolve({text: 'STALE', confidence: 95});
  await old;
  assert.equal(translations, 0);
  assert.equal(f.get('original').textContent, 'Existing');
});

test('stop/restart must retry the same OCR sentence after a cancelled translation', async () => {
  const pending = deferred();
  let translations = 0;
  const f = fixture(async m => m.type === 'OCR' ? {text: 'Hello', confidence: 95} :
    (++translations === 1 ? pending.promise : {translation: 'Xin chào'}));
  f.get('translate').checked = true;
  const old = f.get('start').onclick();
  await tick();
  f.get('pause').onclick();
  pending.resolve({translation: 'CANCELLED'});
  await old;
  const restarted = f.get('start').onclick();
  await tick();
  f.get('pause').onclick();
  await restarted;
  assert.equal(translations, 2);
  assert.equal(f.get('translated').textContent, 'Xin chào');
});

test('invalid translation response must not suppress retry of the same text', async () => {
  let translations = 0;
  const f = fixture(async m => m.type === 'OCR' ? {text: 'Hello', confidence: 95} :
    (++translations === 1 ? {} : {translation: 'Xin chào'}));
  f.get('translate').checked = true;
  await f.get('once').onclick();
  await f.get('once').onclick();
  assert.equal(translations, 2);
  assert.equal(f.get('translated').textContent, 'Xin chào');
});

test('changing OCR language discards pending translation and permits the same sentence again', async () => {
  const pending = deferred();
  let translations = 0;
  const f = fixture(async m => m.type === 'OCR' ? {text: 'Hello', confidence: 95} :
    (++translations === 1 ? pending.promise : {translation: 'Xin chào'}));
  f.get('translate').checked = true;
  const old = f.get('once').onclick();
  await tick();
  f.get('language').value = 'chi_sim';
  f.get('language').onchange();
  pending.resolve({translation: 'CANCELLED'});
  await old;
  assert.equal(f.get('translated').textContent, '');
  await f.get('once').onclick();
  assert.equal(translations, 2);
  assert.equal(f.get('translated').textContent, 'Xin chào');
});

// Connect both actual scripts through the runtime listener; mock only OCR and HTTP.
function translationFlow(responses = [{translation: 'Xin chào'}]) {
  const messages = [], posts = [];
  let listener;
  const background = {
    AbortController, setTimeout, clearTimeout,
    OCRUtils: {cleanText: text => text.trim()},
    fetch: async (url, options) => {
      posts.push({url, method: options.method, body: JSON.parse(options.body)});
      const data = responses[Math.min(posts.length - 1, responses.length - 1)];
      return {ok: !data.detail, status: data.detail ? 502 : 200, json: async () => data};
    },
    browser: {browserAction: {onClicked: {addListener() {}}},
      runtime: {onMessage: {addListener(f) { listener = f; }}}}
  };
  vm.createContext(background);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8'), background);
  vm.runInContext("activeTabId = 11; recognize = async () => ({text: 'Hello', confidence: 95});", background);
  const f = fixture(m => {
    messages.push({...m});
    return listener(m, {tab: {id: 11, windowId: 1}});
  });
  return {...f, messages, posts};
}

test('Start reads translation opt-in and target; runtime listener issues POST /translate', async () => {
  const f = translationFlow();
  await f.get('once').onclick();
  assert.equal(f.posts.length, 0, 'OCR without opt-in never sends text to backend');
  f.get('translate').checked = true;
  f.get('translate').onchange();
  const started = f.get('start').onclick();
  await tick();
  f.get('pause').onclick();
  await started;
  assert.equal(f.messages.filter(m => m.type === 'TRANSLATE').length, 1);
  assert.deepEqual(f.posts, [{url: 'http://127.0.0.1:8787/translate', method: 'POST', body: {text: 'Hello', target: 'vi'}}]);
  assert.equal(f.get('translated').textContent, 'Xin chào');
});

test('backend failure pauses automatic scans and permits retry of the same sentence', async () => {
  const f = translationFlow([{detail: 'Provider unavailable'}, {translation: 'Xin chào'}]);
  f.get('translate').checked = true;
  const started = f.get('start').onclick();
  await tick();
  const stopped = f.get('start').textContent === 'Bắt đầu';
  const note = f.get('status').textContent;
  // Ensure a failing pre-fix test cannot leave the loop alive.
  if (!stopped) f.get('pause').onclick();
  await started;
  assert.equal(stopped, true, 'Error must stop auto-retries');
  assert.match(note, /Provider unavailable/);
  assert.match(note, /thử lại/);
  await f.get('once').onclick();
  assert.equal(f.posts.length, 2);
  assert.equal(f.get('translated').textContent, 'Xin chào');
});

test('successful text + target skips repeated TRANSLATE, including stop/start', async () => {
  const f = translationFlow();
  f.get('translate').checked = true;
  await f.get('once').onclick();
  await f.get('once').onclick();
  const started = f.get('start').onclick();
  await tick();
  f.get('pause').onclick();
  await started;
  assert.equal(f.messages.filter(m => m.type === 'TRANSLATE').length, 1);
  assert.equal(f.posts.length, 1);
});

test('same sentence with a new target reaches background and makes a new POST', async () => {
  const f = translationFlow([{translation: 'Xin chào'}, {translation: 'Hello'}]);
  f.get('translate').checked = true;
  await f.get('once').onclick();
  f.get('target').value = 'en';
  f.get('target').onchange();
  await f.get('once').onclick();
  assert.deepEqual(f.posts.map(p => p.body.target), ['vi', 'en']);
  assert.equal(f.get('translated').textContent, 'Hello');
});

test('dragging a compact panel across OCR pauses new captures and resumes after release outside', async () => {
  let captures = 0;
  const f = fixture(async m => m.type === 'OCR' ? {text: `Line ${++captures}`, confidence: 95} :
    {translation: `Bản dịch ${captures}`}, {manualTimers: true});
  const panel = f.get('panel');
  const point = {target: {closest: () => null}, clientX: 810, clientY: 26, pointerId: 1};
  f.get('translate').checked = true;
  const loop = f.get('start').onclick();
  await tick();
  try {
    panel.onpointerdown(point);
    f.host.offsetWidth = 340;
    panel.onpointermove({...point, clientX: 210, clientY: 660});
    f.host.getBoundingClientRect = () => ({left: 200, right: 540, top: 650, bottom: 750});
    await f.nextScan();
    assert.equal(panel.classList.contains('compact'), true, 'Dragging must not call stop/expand');
    assert.equal(f.get('start').textContent, 'Dừng');
    assert.equal(captures, 1, 'Do not capture during drag through OCR');
    f.host.getBoundingClientRect = () => ({left: 800, right: 1140, top: 16, bottom: 100});
    await f.nextScan();
    assert.equal(captures, 1, 'Even a drag outside the region temporarily pauses capture');
    panel.onpointerup(point);
    await f.nextScan();
    assert.equal(captures, 2);
    assert.equal(f.get('translated').textContent, 'Bản dịch 2');
    assert.equal(panel.classList.contains('compact'), true);
    assert.equal(f.get('target').value, 'vi');
  } finally {
    f.get('pause').onclick();
    // Pre-fix loop may already have stopped, so this helper may reject.
    await f.nextScan().catch(() => {});
    await loop;
  }
});

const outside = () => ({left: 800, right: 1140, top: 16, bottom: 100});
const inside = () => ({left: 200, right: 540, top: 650, bottom: 750});
const dragPoint = {target: {closest: () => null}, clientX: 810, clientY: 26, pointerId: 1};

async function draggingSession() {
  let captures = 0;
  const f = fixture(async m => m.type === 'OCR' ? {text: `Line ${++captures}`, confidence: 95} :
    {translation: `Bản dịch ${captures}`}, {manualTimers: true});
  f.get('translate').checked = true;
  const loop = f.get('start').onclick();
  await tick();
  return {...f, loop, captures: () => captures};
}

test('drop inside OCR keeps compact notice and resumes the same loop when dragged out', async () => {
  const f = await draggingSession();
  const panel = f.get('panel');
  try {
    panel.onpointerdown(dragPoint);
    f.host.getBoundingClientRect = inside;
    panel.onpointerup(dragPoint);
    assert.equal(f.get('scan-notice').hidden, false);
    await f.nextScan();
    await f.nextScan();
    assert.equal(f.captures(), 1);
    assert.equal(panel.classList.contains('compact'), true);
    assert.equal(f.get('start').textContent, 'Dừng');
    panel.onpointerdown(dragPoint);
    f.host.getBoundingClientRect = outside;
    panel.onpointerup(dragPoint);
    assert.equal(f.get('scan-notice').hidden, true);
    await f.nextScan();
    assert.equal(f.captures(), 2);
    assert.equal(f.get('translated').textContent, 'Bản dịch 2');
    assert.equal(panel.classList.contains('compact'), true);
    assert.equal(f.pendingTimers(), 1, 'Only the original scan loop remains');
  } finally {
    f.get('pause').onclick(); await f.nextScan(); await f.loop;
  }
});

for (const endEvent of ['onpointercancel', 'onlostpointercapture']) {
  test(`${endEvent} clears drag and resumes outside or stays paused inside`, async () => {
    const f = await draggingSession();
    const panel = f.get('panel');
    try {
      panel.onpointerdown(dragPoint);
      await f.nextScan();
      assert.equal(f.captures(), 1);
      panel[endEvent](dragPoint);
      panel.onpointerup(dragPoint); // Duplicate end notification must not start another loop.
      await f.nextScan();
      assert.equal(f.captures(), 2);
      panel.onpointerdown(dragPoint);
      f.host.getBoundingClientRect = inside;
      panel[endEvent](dragPoint);
      await f.nextScan();
      assert.equal(f.captures(), 2);
      assert.equal(f.get('scan-notice').hidden, false);
      panel.onpointerdown(dragPoint);
      f.host.getBoundingClientRect = outside;
      panel.onpointerup(dragPoint);
      await f.nextScan();
      assert.equal(f.captures(), 3);
      assert.equal(panel.classList.contains('compact'), true);
      assert.equal(f.pendingTimers(), 1);
    } finally {
      f.get('pause').onclick(); await f.nextScan(); await f.loop;
    }
  });
}

for (const action of ['pause', 'compact-close', 'target']) {
  test(`${action} while overlap-paused stops the session and discards in-flight translation`, async () => {
    const pending = deferred();
    let captures = 0;
    const f = fixture(async m => m.type === 'OCR' ? {text: `Line ${++captures}`, confidence: 95} : pending.promise,
      {manualTimers: true});
    f.get('translate').checked = true;
    const loop = f.get('start').onclick();
    await tick();
    f.get('translated').textContent = 'Existing';
    f.get('panel').onpointerdown(dragPoint);
    f.host.getBoundingClientRect = inside;
    f.get('panel').onpointerup(dragPoint);
    assert.equal(f.get('scan-notice').hidden, false);
    if (action === 'target') { f.get('target').value = 'en'; f.get('target').onchange(); }
    else f.get(action).onclick();
    pending.resolve({translation: 'STALE'});
    await loop;
    f.host.getBoundingClientRect = outside;
    f.get('panel').onpointerup(dragPoint);
    assert.equal(captures, 1);
    assert.equal(f.pendingTimers(), 0);
    assert.equal(f.get('start').textContent, 'Bắt đầu');
    assert.equal(f.get('scan-notice').hidden, true);
    assert.notEqual(f.get('translated').textContent, 'STALE');
    if (action === 'compact-close') assert.equal(f.host.style.display, 'none');
  });
}
