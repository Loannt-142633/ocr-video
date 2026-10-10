import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const vendor = path.join(root, 'extension/vendor');
fs.mkdirSync(path.join(vendor, 'core'), {recursive: true});
for (const file of ['tesseract.min.js', 'worker.min.js', 'tesseract.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt'])
  fs.copyFileSync(path.join(root, 'node_modules/tesseract.js/dist', file), path.join(vendor, file));
for (const file of fs.readdirSync(path.join(root, 'node_modules/tesseract.js-core')))
  if (file.endsWith('.wasm') || file.endsWith('.wasm.js'))
    fs.copyFileSync(path.join(root, 'node_modules/tesseract.js-core', file), path.join(vendor, 'core', file));
for (const lang of ['eng', 'chi_sim', 'chi_tra', 'vie'])
  fs.copyFileSync(path.join(root, `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`), path.join(root, `extension/lang/${lang}.traineddata.gz`));
fs.mkdirSync(path.join(root, 'licenses'), {recursive: true});
for (const pkg of ['tesseract.js', 'tesseract.js-core'])
  fs.copyFileSync(path.join(root, `node_modules/${pkg}/${pkg === 'tesseract.js' ? 'LICENSE.md' : 'LICENSE'}`), path.join(root, `licenses/${pkg}.txt`));
fs.mkdirSync(path.join(vendor, 'licenses'), {recursive: true});
for (const file of fs.readdirSync(path.join(root, 'licenses')))
  fs.copyFileSync(path.join(root, 'licenses', file), path.join(vendor, 'licenses', file));
fs.copyFileSync(path.join(root, 'THIRD_PARTY.md'), path.join(vendor, 'THIRD_PARTY.md'));
console.log('Built offline OCR assets for four languages.');
