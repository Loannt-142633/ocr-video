# Validation — 0.1.0

- JavaScript syntax checks: passed.
- JavaScript unit checks: 31 tests passed, covering crop/scaling, subtitle cleanup/noise filtering, visible panel during capture, overlap suspension, keeping the previous translation, generation cancellation after stop/configuration changes, serialized requests, and backend error details/fallbacks. Drag regressions cover crossing the OCR region, release inside/outside, pointercancel/lostpointercapture, one original scan loop, and Stop/Close/configuration changes during suspension with stale translations discarded. Translation regressions verify retries after cancelled/invalid translations, successful text + target deduplication, translation opt-in after OCR, and changed targets. Both actual scripts are connected through the background runtime listener with OCR and fetch mocked; tests assert POST /translate URL/body and pausing on provider failure. Empty/invalid responses are never cached.
- Firefox browser runtime: actual Tesseract WASM OCR recognized `Hello Com, subtitle OCR works!`; confidence about 95% on a synthetic English fixture. chi_sim, chi_tra, and vie models also initialized from local packaged files.
- Firefox UI integration: drag-selection → screenshot of synthetic subtitle page → preprocessing → actual local OCR → floating result panel: passed. Actual mouse drags across the OCR region skipped new captures and preserved the compact session. Dropping inside showed the compact move instruction and suspended capture; dragging outside automatically resumed OCR and translation for a changed subtitle. Stop during overlap suspension ended the session. Compact/expanded display and translation error display also passed. Browser extension APIs and translation were mocked in this browser-level test. It does not prove the add-on is installed or has capture permissions in a normal Firefox profile.
- Firefox extension validator (`web-ext lint`): zero errors; three eval warnings originate in upstream bundled Tesseract/worker JavaScript. No unsafe-eval permission was enabled. WASM/browser OCR works under the same script/worker CSP in the browser test.
- Optional backend: 6 tests passed on Python 3.12.10 with a fake provider: validation, missing model, temperature/provider contract, successful retry for Vietnamese/English, failed retry for Chinese/Japanese/Korean characters, and cancellation during retry under a shared deadline. The timeout test shortens the 40-second deadline to avoid a slow test.
- A real LLM API or Ollama model was not called. Translation quality, Vietnamese diacritics, real-model retry behavior, speed, and provider compatibility remain unverified. The character check cannot detect every wrong-language response.
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
