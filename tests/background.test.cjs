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
