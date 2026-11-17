# Redacto

Privacy-first dispute assistant built on **Firebase AI Logic hybrid inference**. Sensitive documents never leave your device unredacted.

Paste the text of a payment dispute. Redacto finds the personal data **on your device**, swaps it for tokens, lets you review exactly what would leave the browser, drafts the response letter **in the cloud from the redacted text only**, and fills your real details back in **locally** after you approve.

## How it works

```
 Browser (your device)                                   Cloud (Gemini via Firebase AI Logic)
 ─────────────────────                                   ────────────────────────────────────
 1. Paste dispute text
 2. Gemini Nano finds PII  ──(fallback: cloud Gemini)──► only if Nano is unavailable (banner says so)
 3. Tokenise locally:  "Alex Example" -> [PERSON_NAME_1]
    token map stays in tab memory
 4. Diff panel: original vs redacted payload
 5. You click "send"  ─────── redacted text only ──────► 6. Draft letter + evidence checklist
 7. You approve the draft  ◄─────── tokens only ─────────
 8. Re-hydrate tokens locally -> final letter
```

Hybrid routing uses `InferenceMode.PREFER_ON_DEVICE`: Chrome's built-in Gemini Nano when available, cloud Gemini otherwise. The UI always states which path ran and why. When the cloud handled the PII-detection step, the banner says the original text was sent to the cloud.

Design choices that make this safe:
- The model returns only an entity list (`{type, value}`); tokens are built and substituted locally in `src/redact.ts`, so a small model cannot corrupt the text and never sees the token map.
- Redaction is a single pass over the original text, so tokens are never re-matched.
- The cloud may only use the tokens we supply; any invented placeholder is flagged before you copy the letter.
- Human approval gate before the final letter is produced.
- Firebase App Check protects the AI Logic API.

## Run it

Requirements: Node 20+, Chrome desktop with Gemini Nano enabled for the on-device path (see below). Without Nano the app still works through the cloud fallback.

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config
npm run dev
```

1. Firebase console: create a project, **AI Logic > Get started > Gemini Developer API**, add a Web app, copy its config into `.env.local`.
2. App Check: register the web app, run the dev server, copy the debug token the SDK stores for your browser and add it under **Manage debug tokens**. For a deployed build set `VITE_RECAPTCHA_SITE_KEY`.
3. On-device (optional): Chrome desktop, `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` = Enabled, relaunch. See Chrome's Prompt API docs for hardware requirements and model download size.

Never commit `.env.local` or debug tokens. All sample data in this repo is synthetic.

```bash
npm test         # redaction, re-hydration, retry, draft tidy-up
npm run build
```

## Status

Spike results and measurements are in `SPIKE.md`.

## Licence

Apache-2.0, see `LICENSE`.
