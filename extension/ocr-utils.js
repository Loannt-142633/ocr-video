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
  const api = {cleanText, cropRectangle};
  if (typeof module !== 'undefined') module.exports = api;
  else root.OCRUtils = api;
})(globalThis);
