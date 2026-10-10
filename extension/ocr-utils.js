/* Shared pure helpers: used in the background and regression checks. */
(function (root) {
  const cleanText = text => String(text || '').replace(/\r/g, '').split('\n')
    .map(line => line.trim()).filter(Boolean).join('\n');
  function cropRectangle(region, viewport, image) {
    if (![region.x, region.y, region.width, region.height, viewport.width, viewport.height,
      image.width, image.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0)
      throw new Error('Vùng chọn không hợp lệ.');
    const sx = image.width / viewport.width, sy = image.height / viewport.height;
    const x = Math.max(0, Math.min(image.width - 1, Math.round(region.x * sx)));
    const y = Math.max(0, Math.min(image.height - 1, Math.round(region.y * sy)));
    const width = Math.min(image.width - x, Math.round(region.width * sx));
    const height = Math.min(image.height - y, Math.round(region.height * sy));
    if (width < 5 || height < 5) throw new Error('Vùng chọn quá nhỏ.');
    return {x, y, width, height};
  }
  function whiteSubtitlePixels(pixels, width, height, radius = 6, outlined = true) {
    // An integral image finds dark outlines in O(1) per bright pixel.
    // This suppresses bright skin/clothing instead of turning all highlights into text.
    const stride = width + 1;
    const dark = outlined ? new Uint32Array(stride * (height + 1)) : null;
    if (dark) for (let y = 0; y < height; y++) {
      let count = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        count += pixels[i] * .299 + pixels[i+1] * .587 + pixels[i+2] * .114 < 100 ? 1 : 0;
        dark[(y+1)*stride+x+1] = dark[y*stride+x+1] + count;
      }
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const low = Math.min(pixels[i], pixels[i+1], pixels[i+2]);
      const high = Math.max(pixels[i], pixels[i+1], pixels[i+2]);
      let ink = low > (outlined ? 185 : 175);
      if (ink && dark) {
        const x0=Math.max(0,x-radius), x1=Math.min(width,x+radius+1);
        const y0=Math.max(0,y-radius), y1=Math.min(height,y+radius+1);
        ink = high-low < 65 && dark[y1*stride+x1]-dark[y0*stride+x1]-dark[y1*stride+x0]+dark[y0*stride+x0] > 0;
      }
      pixels[i] = pixels[i+1] = pixels[i+2] = ink ? 0 : 255;
    }
    return pixels;
  }

  function filterSubtitle(data, language = 'eng') {
    if (!Array.isArray(data.blocks)) return {text:cleanText(data.text), confidence:data.confidence};
    const candidates = [];
    for (const block of data.blocks) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
      if (line.confidence < 40) continue;
      const meaningful = text => /[\p{L}\p{N}]/u.test(text);
      const words = (line.words || []).filter(word => (word.confidence >= 35 && meaningful(word.text)) ||
        (word.confidence >= 65 && /^[,.!?，。！？、:：;；…“”‘’"'—–-]+$/u.test(word.text)));
      if (!words.some(w=>meaningful(w.text))) continue;
      const count = words.reduce((sum,w)=>sum+Array.from(w.text).length,0);
      const confidence = words.reduce((sum,w)=>sum+w.confidence*Array.from(w.text).length,0)/count;
      if (confidence < 55 || (count <= 2 && confidence < 70)) continue;
      const heights = words.map(w=>w.bbox.y1-w.bbox.y0).filter(h=>h>0).sort((a,b)=>a-b);
      if (!heights.length) continue;
      candidates.push({words, confidence, count, bbox:line.bbox, height:heights[Math.floor(heights.length/2)]});
    }
    if (!candidates.length) return {text:'',confidence:0};
    // Keep the main subtitle band; small text elsewhere in a broad crop is usually background noise.
    const anchor = candidates.reduce((a,b)=>a.count*a.confidence >= b.count*b.confidence ? a : b);
    const selected = candidates.filter(line => line.height >= anchor.height*.55 && line.height <= anchor.height*1.8 &&
      Math.abs((line.bbox.y0+line.bbox.y1-anchor.bbox.y0-anchor.bbox.y1)/2) <= anchor.height*3)
      .sort((a,b)=>a.bbox.y0-b.bbox.y0);
    const cjk = language.startsWith('chi_');
    const text = selected.map(line => line.words.map(w=>cleanText(w.text)).join(cjk ? '' : ' ')).join('\n');
    const count = selected.reduce((sum,l)=>sum+l.count,0);
    return {text,confidence:selected.reduce((sum,l)=>sum+l.confidence*l.count,0)/count};
  }
  const api = {cleanText, cropRectangle, whiteSubtitlePixels, filterSubtitle};
  if (typeof module !== 'undefined') module.exports = api;
  else root.OCRUtils = api;
})(globalThis);
