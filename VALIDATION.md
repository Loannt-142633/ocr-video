# Validation — 0.1.0

- JavaScript syntax checks: passed.
- Region conversion / screenshot scaling / boundary clipping / text cleanup: 4 tests passed.
- Firefox browser runtime: actual Tesseract WASM OCR recognized `Hello Com, subtitle OCR works!`; confidence about 95% on a synthetic English fixture. chi_sim, chi_tra, and vie models also initialized from local packaged files.
- Firefox UI integration: drag-selection → screenshot of synthetic subtitle page → preprocessing → actual local OCR → floating result panel: passed. Browser extension APIs were mocked in this browser-level test. It does not prove the add-on is installed or has capture permissions in a normal Firefox profile.
- Firefox extension validator (`web-ext lint`): zero errors; three eval warnings originate in upstream bundled Tesseract/worker JavaScript. No unsafe-eval permission was enabled. WASM/browser OCR works under the same script/worker CSP in the browser test.
- Optional backend: invalid input, missing model configuration, and chat-completions provider contract passed (3 tests, fake provider).
- A real LLM API was not called. Translation quality, credentials, cost, and provider compatibility need to be checked with the chosen provider/model.
- Actual video sites, DRM, fullscreen, Firefox toolbar click/activeTab capture permission, and Mozilla signing have not been verified here. Automated access to Firefox's internal add-on loading page was blocked by the test browser, so normal Firefox installation must be tested by the user.

Re-run core checks:

```console
npm test
npm run lint
python tests/backend.test.py
```

Optional browser integration test (requires Playwright + Firefox installed separately):

```console
npm install --no-save playwright
npx playwright install firefox
node tests/browser-smoke.cjs
```

The browser test runs a local static server, mocks the browser extension API boundary, and uses the actual bundled OCR JS/WASM/model assets. Browser screenshots are written to `tests/results/`.
