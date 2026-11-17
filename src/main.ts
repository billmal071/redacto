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

/** Token type -> highlight colour class. */
function kind(tokOrType: string): string {
  const t = tokOrType.toUpperCase();
  if (t.includes("PERSON") || t.includes("NAME")) return "k-person";
  if (t.includes("EMAIL")) return "k-email";
  if (t.includes("PHONE")) return "k-phone";
  if (t.includes("ACCOUNT") || t.includes("CARD")) return "k-account";
  if (t.includes("ADDRESS")) return "k-address";
  return "k-other";
}

async function nanoStatus(): Promise<string> {
  const api = lm();
  return api ? await api.availability(nanoOpts) : "absent";
}

async function checkAvailability() {
  const s = await nanoStatus();
  $("avail").textContent = s === "absent" ? "On-device AI not available in this browser; cloud will be used." : `On-device AI: ${s}`;
}

function routeBanner(source: "on-device" | "cloud", ms: number, why: string) {
  const r = $("route");
  if (source === "on-device") {
    r.className = "route";
    r.innerHTML = `<b>Analysed on this device</b> with Gemini Nano in ${ms} ms. Your original text was not sent anywhere.`;
  } else {
    r.className = "route cloud";
    r.innerHTML = `<b>Cloud fallback</b> (${why}). Gemini found the personal data in ${ms} ms, so your <b>original text was sent to the cloud</b> for this step. Only the redacted text is sent for drafting.`;
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
  say("Working...");
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
    $("orig").innerHTML = highlight(text, Object.values(map), (v) => ({ cls: kind(tokOf.get(v) ?? ""), title: tokOf.get(v) }));
    $("redacted").innerHTML = highlight(r.redacted, Object.keys(map), (t) => ({ cls: kind(t) }));
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
    say("Error: " + errText(e), true);
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
    $("draftout").innerHTML = highlight(draftText, Object.keys(map), (t) => ({ cls: kind(t) }));
    $<HTMLButtonElement>("final").disabled = !$<HTMLInputElement>("approve").checked;
    setStep(3);
  } catch (e) {
    $("draftout").textContent = "Error: " + errText(e);
  } finally {
    btn.disabled = false;
  }
});

$("approve").addEventListener("change", () => {
  $<HTMLButtonElement>("final").disabled = !$<HTMLInputElement>("approve").checked || !draftText;
});

$("final").addEventListener("click", () => {
  const finalText = rehydrate(draftText, map);
  $("finalout").textContent = finalText;
  const left = unresolvedTokens(finalText);
  $("unresolved").textContent = left.length ? `Check before sending: the draft contains placeholders we could not fill in: ${left.join(", ")}. Edit or remove them.` : "";
  show("unresolved", left.length > 0);
  show("finalwrap");
});

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("finalout").textContent ?? "");
  $("copied").textContent = "Copied";
});
