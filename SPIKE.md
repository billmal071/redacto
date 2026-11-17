# Redacto Nano spike

Question: can Chrome's on-device Gemini Nano, via Firebase AI Logic hybrid inference, detect PII in pasted text, with cloud fallback?

## Docs used (read 2026-11-13)
- https://firebase.google.com/docs/ai-logic/hybrid/web/get-started (SDK >= 12.5.0, flag, App Check debug token, `initializeDeviceModel`, `LanguageModel.availability()`)
- https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options (`InferenceMode`, `inCloudParams`, `onDeviceParams.createOptions`, `response.inferenceSource`)
- https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output (`responseSchema` in cloud, `onDeviceParams.promptOptions.responseConstraint` on device)
- https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference
- https://developer.chrome.com/docs/ai/prompt-api (hardware, `LanguageModel.availability(opts)`)

## API names used
`getAI(app, { backend: new GoogleAIBackend() })`, `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, inCloudParams, onDeviceParams })`, `model.initializeDeviceModel(cb)`, `result.response.inferenceSource` compared with the `InferenceSource.ON_DEVICE` constant. Checked against installed firebase@13.3.0 types: the value is lowercase `"on_device"` (the docs say `ON_DEVICE`), so compare via the constant. `inCloudParams.model` is required by the types; set to `gemini-3.5-flash-lite` (documented default from SDK v13). The docs name no SDK availability method, so the app calls Chrome's `LanguageModel.availability()` directly.

## Design choice
The model returns only an entity list (`{type, value}`) as JSON. Tokens (`[PERSON_1]`) are built and substituted locally (`src/redact.ts`), and re-hydrated locally (`src/rehydrate.ts`). The model never sees or produces the map, and a flaky small model cannot corrupt the text.

## Verified here
`npx tsc --noEmit` clean, `vitest` 5/5 (rehydrate), `npm run build` ok.

## Untested (cannot run from here)
- Everything against a real Firebase project: cloud path, App Check, structured output.
- On-device Nano: availability, download, PII detection quality, `inferenceSource` value at runtime, behavior of `initializeDeviceModel` when the API is absent.
- `applyRedaction` has no tests yet (ambiguous or overlapping entities, hallucinated values are skipped but unverified).

## What you must do
1. Firebase console: create a project; AI Logic > Get started > choose Gemini Developer API (free tier).
2. Project settings > add a Web app; copy the config.
3. `cp .env.example .env.local` (already created with placeholders) and fill `VITE_FIREBASE_*`. Never commit it.
4. App Check: Security > App Check > Apps, register the web app (reCAPTCHA v3 or debug). Run `npm run dev`, open DevTools, copy the debug token logged by the SDK, add it under Manage debug tokens. Then enforce App Check for the AI Logic API. Do not commit tokens or add localhost to reCAPTCHA domains. Set `VITE_RECAPTCHA_SITE_KEY` if using reCAPTCHA.
5. Chrome desktop 139+ (docs; Prompt API doc lists 148): `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` = Enabled, relaunch. Docs name only this flag. Hardware per Chrome docs: Win 10/11, macOS 13+, Linux; 22 GB free disk, >4 GB VRAM, 16 GB RAM, 4+ cores, unmetered network. Not Android/iOS.
6. In DevTools console run `await LanguageModel.availability()`, expect `available`/`downloadable`/`downloading`. Check `chrome://on-device-internals` for model status.
7. `npm run dev`, click Check availability, then Redact (a click is needed to start the model download). Read the status line: on-device vs cloud. Record result and latency here.

## Result (2026-11-15, user's Chrome)
`LanguageModel.availability()` = available. Redact on the synthetic sample answered ON-DEVICE (Gemini Nano) in 16980 ms (first call, includes model init), 5 entities, round trip re-hydrated exactly. Not yet tested: cloud fallback path, App Check, second-call latency.

## Result 2 (2026-11-17, driven from Claude in Chrome)
App Check debug token registered (app is registered under Fraud Defense = reCAPTCHA Enterprise; before deploy switch code to ReCaptchaEnterpriseProvider). Force-cloud redact: CLOUD, 8478 ms, 6 entities (one transient 500 "high demand" first). Cloud draft from redacted text works, tokens preserved, local re-hydration after approval works end to end.
