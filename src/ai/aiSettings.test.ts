// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { setupTauri } from "../test/harness";
import { loadAiSettings, looksLikeKey, looksLikeWorkspace, saveAiSettings } from "./aiSettings";
import { DEFAULT_AI_MODEL } from "./cost";

const t = setupTauri();

test("sem nada salvo: sem chave e modelo padrão", async () => {
  await expect(loadAiSettings()).resolves.toEqual({ apiKey: null, model: DEFAULT_AI_MODEL, workspaceId: null });
});

test("salva chave, modelo e workspace; salvar sem chave/workspace apaga só eles", async () => {
  await saveAiSettings("sk-ant-abc", "claude-haiku-4-5", "wrkspc_abc12345");
  await expect(loadAiSettings()).resolves.toEqual({ apiKey: "sk-ant-abc", model: "claude-haiku-4-5", workspaceId: "wrkspc_abc12345" });
  await saveAiSettings(null, "claude-opus-5", null);
  await expect(loadAiSettings()).resolves.toEqual({ apiKey: null, model: "claude-opus-5", workspaceId: null });
  expect(await t.db.select("SELECT key FROM secrets ORDER BY key")).toEqual([{ key: "ai_model" }]);
});

test("looksLikeKey: formato sk-ant-… com 20+ caracteres, ignora espaços nas pontas", () => {
  expect(looksLikeKey("  sk-ant-api03-abcdefghijklmnopqrstu  ")).toBe(true);
  expect(looksLikeKey("sk-ant-curta")).toBe(false);
  expect(looksLikeKey("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe(false);
});

test("looksLikeWorkspace: wrkspc_ + letras e números (#157)", () => {
  expect(looksLikeWorkspace(" wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ ")).toBe(true);
  expect(looksLikeWorkspace("wrkspc_")).toBe(false);
  expect(looksLikeWorkspace("01JwQvzr7rXLA5AGx3HKfFUJ")).toBe(false);
  expect(looksLikeWorkspace("wrkspc_01Jw Qvzr7r")).toBe(false);
});
