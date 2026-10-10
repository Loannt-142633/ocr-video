const {test} = require('node:test');
const assert = require('node:assert/strict');
const {cropRectangle, cleanText, filterSubtitle, whiteSubtitlePixels} = require('../extension/ocr-utils.js');
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
function line(text, confidence=90, y=100, height=20) {
  return {text,confidence,bbox:{x0:10,x1:300,y0:y,y1:y+height},words:text.split(' ').map((text,i)=>({text,confidence,bbox:{x0:10+i*40,x1:40+i*40,y0:y,y1:y+height}}))};
}
const data = lines => ({blocks:[{paragraphs:[{lines}]}]});
test('drops low-confidence background clutter and keeps both subtitle lines', () => {
  const r=filterSubtitle(data([line('LJ',32,70),line("so you're dangling",90,100),line('marriage in front of me.',95,130),line('v',25,160),line('Fo) 4',20,190)]));
  assert.equal(r.text,"so you're dangling\nmarriage in front of me.");
});
test('keeps genuine short replies, one letter, a number, and Chinese punctuation', () => {
  for (const text of ['No!', 'I', '2']) assert.equal(filterSubtitle(data([line(text)])).text,text);
  assert.equal(filterSubtitle(data([line('你 好 ！')]),'chi_sim').text,'你好！');
});
test('ignores smaller lettering and distant background text in a broad crop', () => {
  assert.equal(filterSubtitle(data([line('channel',90,50,7),line('Main subtitle here.',90,100,24),line('unrelated',95,450,24)])).text,'Main subtitle here.');
});
test('empty and punctuation-only frames never produce subtitle text', () => {
  assert.equal(filterSubtitle(data([])).text,'');
  assert.equal(filterSubtitle(data([line('\\ | @',95)])).text,'');
});
test('outlined-white preprocessing suppresses bright backgrounds and keeps text near dark outlines', () => {
  const pixels=new Uint8ClampedArray(7*4);
  for(let i=0;i<7;i++)pixels.set([230,230,230,255],i*4);
  pixels.set([0,0,0,255],3*4);
  whiteSubtitlePixels(pixels,7,1,1,true);
  assert.equal(pixels[0],255); // large bright background is not ink
  assert.equal(pixels[2*4],0); // white text adjacent to dark stroke remains ink
  assert.equal(pixels[3*4],255); // dark outline itself becomes background
});
