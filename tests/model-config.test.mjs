import assert from "node:assert/strict";
import test from "node:test";
import {
  loadModelConfig,
  persistModelConfig,
} from "../src/lib/modelConfig.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    values,
  };
}

test("模型地址与名称可持久化，但 API Key 只保存在当前会话", () => {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  const config = {
    mode: "custom",
    baseUrl: "https://example.com/v1/",
    model: "fitness-model",
    apiKey: "secret-key",
  };

  persistModelConfig(localStorage, sessionStorage, config);
  const restored = loadModelConfig(localStorage, sessionStorage);

  assert.deepEqual(restored, { ...config, baseUrl: "https://example.com/v1" });
  assert.equal([...localStorage.values.values()].some((value) => value.includes("secret-key")), false);
  assert.equal([...sessionStorage.values.values()].some((value) => value.includes("secret-key")), true);
});
