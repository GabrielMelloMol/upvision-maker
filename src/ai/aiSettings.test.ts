// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { setupTauri } from "../test/harness";
import { loadAiSettings, looksLikeKey, saveAiSettings } from "./aiSettings";
import { DEFAULT_AI_MODEL } from "./cost";

const t = setupTauri();

test("sem nada salvo: sem chave e modelo padrão", async () => {
  await expect(loadAiSettings()).resolves.toEqual({ apiKey: null, model: DEFAULT_AI_MODEL });
});

test("salva chave e modelo; salvar sem chave apaga só a chave", async () => {
  await saveAiSettings("sk-ant-abc", "claude-haiku-4-5");
  await expect(loadAiSettings()).resolves.toEqual({ apiKey: "sk-ant-abc", model: "claude-haiku-4-5" });
  await saveAiSettings(null, "claude-opus-5");
  await expect(loadAiSettings()).resolves.toEqual({ apiKey: null, model: "claude-opus-5" });
  expect(await t.db.select("SELECT key FROM secrets ORDER BY key")).toEqual([{ key: "ai_model" }]);
});

test("looksLikeKey: formato sk-ant-… com 20+ caracteres, ignora espaços nas pontas", () => {
  expect(looksLikeKey("  sk-ant-api03-abcdefghijklmnopqrstu  ")).toBe(true);
  expect(looksLikeKey("sk-ant-curta")).toBe(false);
  expect(looksLikeKey("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe(false);
});
