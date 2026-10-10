const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(response) {
  const context = {AbortController, setTimeout, clearTimeout,
    OCRUtils: {cleanText: text => text.trim()}, fetch: async () => response,
    browser: {browserAction: {onClicked: {addListener() {}}}, runtime: {onMessage: {addListener() {}}}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8'), context);
  return () => vm.runInContext("translate('Hello', 'vi')", context);
}

test('backend detail is displayed instead of only HTTP code', async () => {
  const translate = fixture({ok: false, status: 502, json: async () => ({detail: 'Model vẫn trả ký tự Trung/Nhật/Hàn.'})});
  await assert.rejects(translate(), /Model vẫn trả ký tự/);
});

test('non-JSON and structured validation errors retain useful HTTP fallback', async () => {
  for (const json of [async () => { throw new Error('HTML error'); }, async () => ({detail: [{msg: 'invalid'}]})]) {
    await assert.rejects(fixture({ok: false, status: 502, json})(), /Backend dịch trả lỗi 502/);
  }
});

test('invalid or empty translation is rejected and never cached, allowing retry', async () => {
  for (const invalid of [null, {}, {translation: 123}, {translation: ''}, {translation: '   '}]) {
    let calls = 0;
    const translate = fixture({ok: true, json: async () => ++calls === 1 ? invalid : {translation: 'Xin chào'}});
    await assert.rejects(translate(), /không trả bản dịch hợp lệ/);
    assert.equal((await translate()).translation, 'Xin chào');
    assert.equal(calls, 2);
  }
});

function ocrFixture() {
  let screenshots = 0, decodes = 0, listener;
  const bytes = fs.readFileSync(path.resolve(__dirname, 'ocr-fixture.png'));
  const frame = {dataURL: 'data:image/png;base64,' + bytes.toString('base64'), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
  const draws = [];
  const context = {atob, Uint8Array, DataView,
    Image: class {constructor() {this.width = frame.width; this.height = frame.height;} async decode() {decodes++;}},
    document: {createElement: () => ({getContext: () => ({drawImage: (...args) => draws.push(args)})})},
    OCRUtils: {cleanText: text => text.trim(), cropRectangle: () => ({x: 0, y: 0, width: frame.width, height: frame.height})},
    browser: {browserAction: {onClicked: {addListener() {}}},
      runtime: {id: 'test-extension', onMessage: {addListener(f) {listener = f;}}},
      tabs: {query: async () => [{id: 11}], captureVisibleTab: async () => {screenshots++; return frame.dataURL;}}}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8'), context);
  vm.runInContext("activeTabId = 11; getWorker = async () => ({recognize: async () => ({data: {text: 'Hello', confidence: 95}})});", context);
  const sender = {id: 'test-extension', frameId: 0, tab: {id: 11, windowId: 1}};
  const message = {type: 'OCR', frame, language: 'eng', preprocess: 'original', noiseFilter: false};
  return {context, frame, message, sender, draws, invoke: (m = message, s = sender) => listener(m, s),
    screenshots: () => screenshots, decodes: () => decodes};
}

test('background OCR accepts bounded video crop without taking a screenshot', async () => {
  const f = ocrFixture();
  assert.equal((await f.invoke()).text, 'Hello');
  assert.equal(f.screenshots(), 0);
  assert.equal(f.decodes(), 1);
  assert.deepEqual(f.draws[0].slice(1, 5), [0, 0, f.frame.width, f.frame.height]);
  assert.equal((await f.invoke({...f.message, frame: null})).text, 'Hello');
  assert.equal(f.screenshots(), 1);
});
test('background rejects oversized images, mismatched PNG headers and unauthorized senders', async () => {
  const f = ocrFixture();
  for (const frame of [{...f.frame, width: 2500}, {...f.frame, width: f.frame.width + 1},
    {...f.frame, dataURL: 'https://example.org/image.png'}, {...f.frame, dataURL: 'data:image/png;base64,' + 'A'.repeat(8000000)},
    {...f.frame, width: 2200, height: 2200}]) {
    assert.match((await f.invoke({...f.message, frame})).error, /không hợp lệ|quá lớn/);
  }
  for (const sender of [{...f.sender, id: 'other'}, {...f.sender, frameId: 1}, {...f.sender, tab: {id: 12}}])
    assert.equal(f.invoke(f.message, sender), undefined);
  assert.equal(f.decodes(), 0, 'Reject malformed dimensions before image decode');
  assert.equal(f.screenshots(), 0);
});
