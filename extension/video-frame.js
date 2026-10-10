/* Capture only pixels from the selected video; OCR remains in the background. */
(function (root) {
  if (root.VideoFrameCapture) return;
  const MAX_SIDE = 2400, MAX_PIXELS = 4000000, MAX_DATA_URL = 8000000;

  function length(value, available) {
    if (/^[+-]?[\d.]+%$/.test(value)) return parseFloat(value) * available / 100;
    if (/^[+-]?[\d.]+px$/.test(value) || value === '0') return parseFloat(value);
    const calc = /^calc\(([+-]?[\d.]+)%\s*([+-])\s*([\d.]+)px\)$/.exec(value);
    if (calc) return Number(calc[1]) * available / 100 + (calc[2] === '+' ? 1 : -1) * Number(calc[3]);
    throw new Error('Unsupported object-position');
  }
  function position(value, width, height) {
    const tokens = value.match(/calc\([^)]*\)|[^\s]+/g) || [];
    const keywords = {left: 0, top: 0, center: .5, right: 1, bottom: 1};
    const offset = (token, space) => token in keywords ? keywords[token] * space : length(token, space);
    if (tokens.length <= 2) {
      let [x = '50%', y = '50%'] = tokens;
      if (x === 'top' || x === 'bottom' || y === 'left' || y === 'right') [x, y] = [y, x];
      return {x: offset(x, width), y: offset(y, height)};
    }
    // Edge-offset syntax: right 10px bottom 20px, left 5% top, etc.
    const result = {};
    for (let i = 0; i < tokens.length; i++) {
      const edge = tokens[i];
      const axis = ['left', 'right'].includes(edge) ? 'x' : ['top', 'bottom'].includes(edge) ? 'y' : null;
      if (!axis || result[axis] != null) throw new Error('Unsupported object-position');
      const space = axis === 'x' ? width : height;
      let distance = 0;
      if (i + 1 < tokens.length && !(tokens[i + 1] in keywords)) distance = length(tokens[++i], space);
      result[axis] = edge === 'right' || edge === 'bottom' ? space - distance : distance;
    }
    if (result.x == null || result.y == null) throw new Error('Unsupported object-position');
    return result;
  }

  function mapRegion(region, box, intrinsic, fit = 'contain', objectPosition = '50% 50%', cssBox = box) {
    if (![region.x, region.y, region.width, region.height, box.x, box.y, box.width, box.height,
      intrinsic.width, intrinsic.height, cssBox.width, cssBox.height].every(Number.isFinite) ||
      [region.width, region.height, box.width, box.height, intrinsic.width, intrinsic.height, cssBox.width, cssBox.height].some(n => n <= 0))
      return null;
    let width = cssBox.width, height = cssBox.height;
    if (fit !== 'fill') {
      const contain = Math.min(width / intrinsic.width, height / intrinsic.height);
      const scale = fit === 'cover' ? Math.max(width / intrinsic.width, height / intrinsic.height) :
        fit === 'contain' ? contain : fit === 'none' ? 1 : fit === 'scale-down' ? Math.min(1, contain) : NaN;
      width = intrinsic.width * scale; height = intrinsic.height * scale;
    }
    const offset = position(objectPosition, cssBox.width - width, cssBox.height - height);
    const sx = box.width / cssBox.width, sy = box.height / cssBox.height;
    const painted = {x: box.x + offset.x * sx, y: box.y + offset.y * sy, width: width * sx, height: height * sy};
    if (![painted.x, painted.y, painted.width, painted.height].every(Number.isFinite)) return null;
    const left = Math.max(box.x, painted.x), top = Math.max(box.y, painted.y);
    const right = Math.min(box.x + box.width, painted.x + painted.width);
    const bottom = Math.min(box.y + box.height, painted.y + painted.height);
    // Do not silently OCR another area when the selection includes letterboxing.
    if (region.x < left - .01 || region.y < top - .01 || region.x + region.width > right + .01 || region.y + region.height > bottom + .01) return null;
    return {x: Math.max(0, (region.x - painted.x) / painted.width * intrinsic.width),
      y: Math.max(0, (region.y - painted.y) / painted.height * intrinsic.height),
      width: region.width / painted.width * intrinsic.width, height: region.height / painted.height * intrinsic.height};
  }

  function geometry(video) {
    for (let node = video; node; node = node.parentElement || node.getRootNode?.().host) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || Number(style.opacity) === 0) return null;
      if (style.transform && style.transform !== 'none') {
        const matrix = new DOMMatrixReadOnly(style.transform);
        if (!matrix.is2D || matrix.b || matrix.c || matrix.a <= 0 || matrix.d <= 0) throw new Error('Rotated video');
      }
      if (style.rotate && !['none', '0deg'].includes(style.rotate)) throw new Error('Rotated video');
      if (style.perspective && style.perspective !== 'none') throw new Error('Perspective video');
      if (style.scale && style.scale !== 'none' && style.scale.split(/\s+/).some(n => Number(n) <= 0)) throw new Error('Mirrored video');
    }
    const style = getComputedStyle(video), rect = video.getBoundingClientRect();
    if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) return null;
    const number = name => parseFloat(style[name]) || 0;
    const px = number('paddingLeft') + number('paddingRight'), py = number('paddingTop') + number('paddingBottom');
    const bx = number('borderLeftWidth') + number('borderRightWidth'), by = number('borderTopWidth') + number('borderBottomWidth');
    const width = parseFloat(style.width) - (style.boxSizing === 'border-box' ? px + bx : 0);
    const height = parseFloat(style.height) - (style.boxSizing === 'border-box' ? py + by : 0);
    const sx = rect.width / (width + px + bx), sy = rect.height / (height + py + by);
    return {style, cssBox: {width, height}, box: {
      x: rect.left + (number('borderLeftWidth') + number('paddingLeft')) * sx,
      y: rect.top + (number('borderTopWidth') + number('paddingTop')) * sy, width: width * sx, height: height * sy}};
  }

  function capture(region) {
    const videos = [];
    function collect(scope) {
      videos.push(...scope.querySelectorAll('video'));
      for (const node of scope.querySelectorAll('*')) if (node.shadowRoot) collect(node.shadowRoot);
    }
    collect(document); // Deliberately does not enter iframes.
    const candidates = [];
    for (const video of videos) {
      try {
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) continue;
        const info = geometry(video);
        if (!info) continue;
        const crop = mapRegion(region, info.box, {width: video.videoWidth, height: video.videoHeight},
          info.style.objectFit, info.style.objectPosition, info.cssBox);
        if (crop) candidates.push({video, crop});
      } catch { /* Unsupported layout uses tab capture, never a guessed crop. */ }
    }
    let candidate = candidates[0];
    if (candidates.length > 1) {
      const hit = document.elementsFromPoint(region.x + region.width / 2, region.y + region.height / 2)
        .find(node => candidates.some(item => item.video === node));
      candidate = candidates.find(item => item.video === hit);
    }
    if (!candidate) return {frame: null, reason: 'Không xác định được video sẵn sàng ở vùng chọn; video trong iframe chưa được đọc trực tiếp.'};
    try {
      const {video, crop} = candidate;
      if (video.mediaKeys) return {frame: null, reason: 'Video có bảo vệ nội dung; dùng chụp tab.'};
      const scale = Math.min(1, MAX_SIDE / crop.width, MAX_SIDE / crop.height, Math.sqrt(MAX_PIXELS / (crop.width * crop.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(crop.width * scale)); canvas.height = Math.max(1, Math.floor(crop.height * scale));
      canvas.getContext('2d').drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL('image/png'); // SecurityError -> normal tab fallback.
      if (dataURL.length > MAX_DATA_URL) throw new Error('Frame too large');
      return {frame: {dataURL, width: canvas.width, height: canvas.height}, reason: ''};
    } catch (error) {
      return {frame: null, reason: error.name === 'SecurityError' ? 'Canvas bị CORS chặn; dùng chụp tab.' : 'Không đọc được ảnh video; dùng chụp tab.'};
    }
  }
  root.VideoFrameCapture = {mapRegion, position, capture};
  if (typeof module !== 'undefined') module.exports = root.VideoFrameCapture;
})(globalThis);
