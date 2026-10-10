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
function fixture(sendMessage) {
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
    setTimeout, browser: {storage: {local: {get: async () => ({}), set: async () => {}}},
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
  return {host, get, listener};
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

test('overlapping panel stops before sending OCR and explains how to move it', async () => {
  let captures = 0;
  const f = fixture(async () => { captures++; });
  f.host.getBoundingClientRect = () => ({left: 200, right: 540, top: 650, bottom: 750});
  await f.get('start').onclick();
  assert.equal(captures, 0);
  assert.match(f.get('status').textContent, /kéo khung ra ngoài/);
  assert.equal(f.get('panel').classList.contains('compact'), false);
  assert.equal(f.host.style.visibility, 'visible');
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
