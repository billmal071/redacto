import "./style.css";
import { InferenceMode, InferenceSource } from "firebase/ai";
import { configured, makeModel } from "./firebase";
import { applyRedaction, type Entity } from "./redact";
import { rehydrate } from "./rehydrate";
import { draftResponse, unresolvedTokens } from "./draft";
import { withRetry } from "./retry";
import { highlight } from "./highlight";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle("hidden", !on);
let map: Record<string, string> = {};
let draftText = "";

type LM = { availability(o?: unknown): Promise<string> };
const lm = () => (globalThis as unknown as { LanguageModel?: LM }).LanguageModel;
const nanoOpts = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

function setStep(n: 1 | 2 | 3) {
  (["s1", "s2", "s3"] as const).forEach((id, i) => {
    $(id).className = i + 1 < n ? "done" : i + 1 === n ? "active" : "";
  });
}
function say(msg: string, err = false) {
  const s = $("status");
  s.textContent = msg;
  s.classList.toggle("err", err);
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Stagger the stamp animation across the redaction bars. */
function stamp() {
  document.querySelectorAll<HTMLElement>("mark.bar").forEach((el, i) => el.style.setProperty("--i", String(i)));
}

/** Plain-language messages for the errors users can actually act on. */
function friendly(e: unknown): string {
  const s = errText(e);
  if (/\[401|\[403|App Check/i.test(s)) return "The cloud rejected this request (App Check). Reload the page. If it keeps happening, clear this site's data and try again.";
  if (/\[429|\[500|\[503|high demand/i.test(s)) return "Google's model is busy right now. Wait a few seconds and try again.";
  return s;
}

async function nanoStatus(): Promise<string> {
  const api = lm();
  return api ? await api.availability(nanoOpts) : "absent";
}

async function checkAvailability() {
  const s = await nanoStatus();
  $("avail").textContent = s === "absent" ? "On-device AI not available in this browser; cloud will be used." : `On-device AI: ${s}`;
}

const svg = (d: string) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_CHIP = svg('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>');
const ICON_CLOUD = svg('<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.7 1.5A4 4 0 0 0 6.5 19z"/>');

/** Chips like "2 person name" from the token map (distinct values per type). */
function renderFound() {
  const counts = new Map<string, number>();
  for (const tok of Object.keys(map)) {
    const type = tok.slice(1).replace(/_\d+\]$/, "").replace(/_/g, " ").toLowerCase();
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const box = $("found");
  box.replaceChildren(
    ...[...counts].map(([type, n]) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      const b = document.createElement("b");
      b.textContent = String(n);
      chip.append(b, type);
      return chip;
    }),
  );
}

function routeBanner(source: "on-device" | "cloud", ms: number, why: string) {
  const r = $("route");
  if (source === "on-device") {
    r.className = "route";
    r.innerHTML = `${ICON_CHIP}<b>Analysed on this device</b> with Gemini Nano in ${ms} ms. Your original text was not sent anywhere.`;
  } else {
    r.className = "route cloud";
    r.innerHTML = `${ICON_CLOUD}<b>Cloud fallback</b> (${why}). Gemini found the personal data in ${ms} ms, so your <b>original text was sent to the cloud</b> for this step. Only the redacted text is sent for drafting.`;
  }
}

void checkAvailability().catch(() => undefined);

$("redact").addEventListener("click", async () => {
  if (!configured()) return say("Fill the VITE_* values in .env.local first.", true);
  const text = $<HTMLTextAreaElement>("in").value;
  if (!text.trim()) return say("Paste some text first.", true);
  const forceCloud = $<HTMLInputElement>("forcecloud").checked;
  const btn = $<HTMLButtonElement>("redact");
  btn.disabled = true;
  say("Finding personal data...");
  try {
    const status = forceCloud ? "forced" : await nanoStatus();
    const why = forceCloud
      ? "you forced cloud"
      : status === "absent"
        ? "on-device AI is not available in this browser"
        : status === "unavailable"
          ? "this device cannot run Gemini Nano"
          : "on-device run failed or was unavailable";
    const model = makeModel(forceCloud ? InferenceMode.ONLY_IN_CLOUD : InferenceMode.PREFER_ON_DEVICE);
    if (!forceCloud) {
      // Needs a user gesture; reports download progress 0..1. Failures fall back to cloud.
      await model.initializeDeviceModel?.((p: number) => say(`Downloading on-device model ${Math.round(p * 100)}%`))?.catch?.(() => undefined);
    }
    const t0 = performance.now();
    const res = await withRetry(
      () =>
        model.generateContent(
          `List every personal identifier (person names, emails, phone numbers, account/card numbers, street addresses) in the text. Return each with a type and the exact substring.\n\nTEXT:\n${text}`,
        ),
      { onRetry: (n) => say(`Google is busy, retrying (${n})...`) },
    );
    const ms = Math.round(performance.now() - t0);
    const entities: Entity[] = JSON.parse(res.response.text()).entities ?? [];
    const r = applyRedaction(text, entities);
    map = r.map;
    const tokOf = new Map(Object.entries(map).map(([tok, v]) => [v, tok]));
    $("orig").innerHTML = highlight(text, Object.values(map), (v) => ({ cls: "hl", title: tokOf.get(v) }));
    $("redacted").innerHTML = highlight(r.redacted, Object.keys(map), () => ({ cls: "bar" }));
    stamp();
    renderFound();
    $("legend").textContent = `${Object.keys(map).length} item(s) replaced with tokens. The token-to-value map stays in this tab's memory only.`;
    routeBanner(res.response.inferenceSource === InferenceSource.ON_DEVICE ? "on-device" : "cloud", ms, why);
    show("card2");
    show("card3", false);
    show("finalwrap", false);
    $<HTMLInputElement>("approve").checked = false;
    $<HTMLButtonElement>("final").disabled = true;
    draftText = "";
    setStep(2);
    say("");
  } catch (e) {
    say(friendly(e), true);
  } finally {
    btn.disabled = false;
  }
});

$("draft").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("draft");
  btn.disabled = true;
  show("card3");
  show("finalwrap", false);
  $("draftout").textContent = "Drafting in the cloud...";
  try {
    const redacted = $("redacted").textContent ?? "";
    draftText = await draftResponse(redacted, Object.keys(map), (n) => ($("draftout").textContent = `Google is busy, retrying (${n})...`));
    $("draftout").innerHTML = highlight(draftText, Object.keys(map), () => ({ cls: "bar" }));
    stamp();
    $<HTMLButtonElement>("final").disabled = !$<HTMLInputElement>("approve").checked;
    setStep(3);
  } catch (e) {
    $("draftout").textContent = friendly(e);
  } finally {
    btn.disabled = false;
  }
});

$("approve").addEventListener("change", () => {
  $<HTMLButtonElement>("final").disabled = !$<HTMLInputElement>("approve").checked || !draftText;
});

$("final").addEventListener("click", () => {
  const finalText = rehydrate(draftText, map);
  $("finalout").innerHTML = highlight(finalText, Object.values(map), () => ({ cls: "hl" }));
  const left = unresolvedTokens(finalText);
  $("unresolved").textContent = left.length ? `Check before sending: the draft contains placeholders we could not fill in: ${left.join(", ")}. Edit or remove them.` : "";
  show("unresolved", left.length > 0);
  show("finalwrap");
});

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("finalout").textContent ?? "");
  $("copied").textContent = "Copied";
});

function applyTheme(t: "light" | "dark") {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("redacto-theme", t); } catch { /* storage blocked */ }
  $("themeicon").textContent = t === "dark" ? "☀" : "☾";
  $("themelabel").textContent = t === "dark" ? "Light" : "Dark";
  $("theme").setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
}
applyTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
$("theme").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
