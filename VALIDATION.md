# Validation — 0.1.0

- JavaScript syntax checks: passed.
- JavaScript unit checks: 44 tests passed, covering crop/scaling, subtitle cleanup/noise filtering, visible panel during capture, tab overlap suspension, keeping the previous translation, generation cancellation after stop/configuration changes, serialized requests, and backend error details/fallbacks. Video checks cover contain/cover/fill/none/scale-down, object-position, CSS scaling, selecting the matching video, unready/CORS fallback, bounded crops, PNG header validation before decode, and unauthorized sender rejection. Direct-video OCR continues through popup overlap/drag; stop/configuration changes discard stale translations. Prior drag and translation retry/cache regressions remain passing. Runtime listener/fetch boundary tests use mocks, not a real LLM.
- Firefox browser runtime: actual Tesseract WASM OCR recognized `Hello Com, subtitle OCR works!`; confidence about 95% on a synthetic English fixture. chi_sim, chi_tra, and vie models also initialized from local packaged files.
- Firefox UI integration: tab capture, drag suspension/resume, compact settings, and translation errors passed. A real canvas-stream video with baked-in subtitles was correctly OCRed while the popup covered the selection, with zero screenshots; video OCR continued during an actual mouse drag. A real WebM video served from a different origin produced canvas SecurityError; tab fallback suspended while overlapped and resumed outside with correct OCR. The cross-origin fixture uses FFmpeg bundled with Playwright. This full check required execution outside the restricted Windows sandbox: inside it, the file loaded but Firefox stayed at metadata without decoding frames. Browser extension APIs and translation were mocked; actual bundled OCR and browser canvas/media APIs were used. This does not prove installed add-on/activeTab behavior in a normal Firefox profile.
- Firefox extension validator (`web-ext lint`): zero errors; three eval warnings originate in upstream bundled Tesseract/worker JavaScript. No unsafe-eval permission was enabled. WASM/browser OCR works under the same script/worker CSP in the browser test.
- Optional backend: 6 tests passed on Python 3.12.10 with a fake provider: validation, missing model, temperature/provider contract, successful retry for Vietnamese/English, failed retry for Chinese/Japanese/Korean characters, and cancellation during retry under a shared deadline. The timeout test shortens the 40-second deadline to avoid a slow test.
- A real LLM API or Ollama model was not called. Translation quality, Vietnamese diacritics, real-model retry behavior, speed, and provider compatibility remain unverified. The character check cannot detect every wrong-language response.
- Actual video sites, DRM, fullscreen, Firefox toolbar click/activeTab capture permission, and Mozilla signing have not been verified here. Automated access to Firefox's internal add-on loading page was blocked by the test browser, so normal Firefox installation must be tested by the user.
- Direct video capture does not enter iframes (including same-origin) or closed shadow roots. Unsupported/ambiguous CSS layouts, partial letterbox selections, unready or protected video use tab fallback. Only pixels baked into the video are captured directly; separate HTML/track subtitles are not included. No CORS or DRM bypass was implemented.

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
