import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema } from "firebase/ai";

const env = import.meta.env;

export function configured(): boolean {
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_APP_ID && !String(env.VITE_FIREBASE_API_KEY).startsWith("YOUR_"));
}

export const entitySchema = Schema.object({
  properties: {
    entities: Schema.array({
      items: Schema.object({
        properties: {
          type: Schema.string(), // PERSON | EMAIL | PHONE | ACCOUNT | ADDRESS
          value: Schema.string(), // exact substring from the input
        },
      }),
    }),
  },
});

function getApp() {
  return initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
}

function setupAppCheck(app: ReturnType<typeof getApp>) {
  if (env.DEV) (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  if (env.VITE_RECAPTCHA_SITE_KEY || env.DEV) {
    // in dev the debug token replaces the provider, so the key may be a placeholder
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY || "dev-placeholder"),
      isTokenAutoRefreshEnabled: true,
    });
  }
}

export function makeDraftModel() {
  const app = getApp();
  setupAppCheck(app);
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: "gemini-3.5-flash-lite" },
  });
}

export function makeModel(mode: InferenceMode) {
  const app = getApp();
  setupAppCheck(app);
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    mode,
    inCloudParams: { model: "gemini-3.5-flash-lite", generationConfig: { responseMimeType: "application/json", responseSchema: entitySchema } },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
      promptOptions: { responseConstraint: entitySchema },
    },
  });
}
