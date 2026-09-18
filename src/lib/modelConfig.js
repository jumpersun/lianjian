const MODEL_CONFIG_KEY = "fitness-coach-model-config-v1";
const MODEL_SECRET_KEY = "fitness-coach-model-secret-v1";

export const DEFAULT_MODEL_CONFIG = {
  mode: "system",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  apiKey: "",
};

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_MODEL_CONFIG.baseUrl).trim().replace(/\/+$/, "");
}

export function loadModelConfig(localStorage, sessionStorage) {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(MODEL_CONFIG_KEY) || "{}") || {};
  } catch {
    stored = {};
  }
  return {
    ...DEFAULT_MODEL_CONFIG,
    ...stored,
    mode: stored.mode === "custom" ? "custom" : "system",
    baseUrl: normalizeBaseUrl(stored.baseUrl),
    apiKey: sessionStorage.getItem(MODEL_SECRET_KEY) || "",
  };
}

export function persistModelConfig(localStorage, sessionStorage, config) {
  const normalized = {
    mode: config.mode === "custom" ? "custom" : "system",
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: String(config.model || "").trim(),
  };
  localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(normalized));
  sessionStorage.setItem(MODEL_SECRET_KEY, String(config.apiKey || ""));
}

export function isCustomModelReady(config) {
  return Boolean(
    config?.mode === "custom" &&
      normalizeBaseUrl(config.baseUrl) &&
      String(config.model || "").trim() &&
      String(config.apiKey || "").trim(),
  );
}

export function chatCompletionsUrl(config) {
  return `${normalizeBaseUrl(config?.baseUrl)}/chat/completions`;
}
