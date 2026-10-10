const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {mapRegion, position} = require('../extension/video-frame.js');
const box = {x: 0, y: 0, width: 500, height: 500};
const intrinsic = {width: 1000, height: 500};
const region = {x: 100, y: 200, width: 100, height: 100};

test('contain maps letterboxed display into intrinsic video coordinates', () => {
  assert.deepEqual(mapRegion(region, box, intrinsic, 'contain'), {x: 200, y: 150, width: 200, height: 200});
  assert.equal(mapRegion({x: 0, y: 0, width: 100, height: 100}, box, intrinsic, 'contain'), null);
});
test('cover accounts for clipped video and object-position percentages', () => {
  assert.deepEqual(mapRegion(region, box, intrinsic, 'cover'), {x: 350, y: 200, width: 100, height: 100});
  assert.deepEqual(mapRegion(region, box, intrinsic, 'cover', '100% 50%'), {x: 600, y: 200, width: 100, height: 100});
});
test('object-position handles keywords, pixels, edge offsets, and calc', () => {
  assert.deepEqual(position('bottom right', -500, 250), {x: -500, y: 250});
  assert.deepEqual(position('right 10px bottom 20px', -500, 250), {x: -510, y: 230});
  assert.deepEqual(position('calc(50% + 10px) 20px', -500, 250), {x: -240, y: 20});
  assert.deepEqual(position('top', 500, 250), {x: 250, y: 0});
});
test('fill, none, scale-down and CSS display scaling preserve crop coordinates', () => {
  assert.deepEqual(mapRegion(region, box, intrinsic, 'fill'), {x: 200, y: 200, width: 200, height: 100});
  assert.deepEqual(mapRegion(region, box, intrinsic, 'none'), {x: 350, y: 200, width: 100, height: 100});
  assert.deepEqual(mapRegion(region, box, intrinsic, 'scale-down'), mapRegion(region, box, intrinsic, 'contain'));
  assert.deepEqual(mapRegion(region, box, intrinsic, 'contain', '50% 50%', {width: 250, height: 250}),
    mapRegion(region, box, intrinsic, 'contain'));
});

function captureFixture({blocked = false, ready = true} = {}) {
  const videos = [
    {readyState: 2, videoWidth: 1000, videoHeight: 500, getBoundingClientRect: () => ({left: 800, top: 0, width: 500, height: 500})},
    {readyState: ready ? 2 : 0, videoWidth: 1000, videoHeight: 500, src: 'unchanged', crossOrigin: null,
      getBoundingClientRect: () => ({left: 0, top: 0, width: 500, height: 500})}
  ];
  const draws = [];
  const canvas = {getContext: () => ({drawImage: (...args) => draws.push(args)}), toDataURL: () => {
    if (blocked) { const error = new Error('tainted'); error.name = 'SecurityError'; throw error; }
    return 'data:image/png;base64,test';
  }};
  const context = {document: {querySelectorAll: name => name === 'video' ? videos : [], createElement: () => canvas},
    getComputedStyle: () => ({width: '500px', height: '500px', objectFit: 'contain', objectPosition: '50% 50%',
      visibility: 'visible', opacity: '1', transform: 'none'})};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../extension/video-frame.js'), 'utf8'), context);
  return {capture: () => context.VideoFrameCapture.capture(region), videos, draws, canvas};
}
test('capture chooses video corresponding to region, sends only cropped pixels', () => {
  const f = captureFixture();
  const result = f.capture();
  assert.equal(f.draws[0][0], f.videos[1]);
  assert.deepEqual(f.draws[0].slice(1), [200, 150, 200, 200, 0, 0, 200, 200]);
  assert.equal(result.frame.width, 200);
  assert.equal(result.frame.height, 200);
});
test('tainted canvas and unready matching video use tab fallback without altering playback', () => {
  const blocked = captureFixture({blocked: true});
  assert.equal(blocked.capture().frame, null);
  assert.match(blocked.capture().reason, /CORS/);
  assert.equal(blocked.videos[1].src, 'unchanged');
  assert.equal(blocked.videos[1].crossOrigin, null);
  assert.equal(captureFixture({ready: false}).capture().frame, null);
});

test('large native video is cropped then reduced to bounded pixel and side limits', () => {
  const f = captureFixture();
  f.videos[1].videoWidth = 20000;f.videos[1].videoHeight = 20000;
  const {frame} = f.capture();
  assert.ok(frame.width <= 2400 && frame.height <= 2400);
  assert.ok(frame.width * frame.height <= 4000000);
});
