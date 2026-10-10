const {test} = require('node:test');
const assert = require('node:assert/strict');
const {cropRectangle, cleanText} = require('../extension/ocr-utils.js');
test('screenshot crop accounts for device pixel ratio and browser zoom', () => {
  assert.deepEqual(cropRectangle({x:100,y:300,width:400,height:60}, {width:1000,height:600}, {width:2000,height:1200}),
    {x:200,y:600,width:800,height:120});
});
test('crop clamps a region at the screenshot boundary', () => {
  assert.deepEqual(cropRectangle({x:950,y:550,width:100,height:80}, {width:1000,height:600}, {width:1000,height:600}),
    {x:950,y:550,width:50,height:50});
});
test('invalid viewport and tiny regions are rejected', () => {
  assert.throws(() => cropRectangle({x:0,y:0,width:100,height:20}, {width:0,height:600}, {width:1000,height:600}));
  assert.throws(() => cropRectangle({x:0,y:0,width:2,height:2}, {width:1000,height:600}, {width:1000,height:600}));
});
test('OCR cleanup keeps subtitle line boundaries', () => {
  assert.equal(cleanText(' Hello  \r\n\n world \n'), 'Hello\nworld');
});
