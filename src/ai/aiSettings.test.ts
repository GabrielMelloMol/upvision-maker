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

test("a chave fica no cofre de senhas do sistema e nunca no banco (B26)", async () => {
  await saveAiSettings("sk-ant-segredo-1234567890abcdef", "claude-haiku-4-5", null);
  expect(t.keychain.get("anthropic_api_key")).toBe("sk-ant-segredo-1234567890abcdef");
  const rows = await t.db.select<{ key: string; value: string }>("SELECT key, value FROM secrets");
  expect(rows.map((r) => r.key)).not.toContain("anthropic_api_key");
  expect(JSON.stringify(rows)).not.toContain("segredo");
  await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: "sk-ant-segredo-1234567890abcdef" });
  await saveAiSettings(null, "claude-haiku-4-5", null);
  expect(t.keychain.has("anthropic_api_key")).toBe(false);
});

test("chave de versões anteriores (texto no banco) vai para o cofre na primeira leitura e some do banco (B26)", async () => {
  await t.db.execute("INSERT INTO secrets (key, value) VALUES ('anthropic_api_key', 'sk-ant-antiga-1234567890abcdef')");
  await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: "sk-ant-antiga-1234567890abcdef" });
  expect(t.keychain.get("anthropic_api_key")).toBe("sk-ant-antiga-1234567890abcdef");
  expect(await t.db.select("SELECT key FROM secrets WHERE key = 'anthropic_api_key'")).toEqual([]);
});

test("cópia esquecida no banco é apagada quando o cofre já tem a chave (B26)", async () => {
  t.keychain.set("anthropic_api_key", "sk-ant-cofre-1234567890abcdef");
  await t.db.execute("INSERT INTO secrets (key, value) VALUES ('anthropic_api_key', 'sk-ant-velha-1234567890abcdef')");
  await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: "sk-ant-cofre-1234567890abcdef" });
  expect(await t.db.select("SELECT key FROM secrets WHERE key = 'anthropic_api_key'")).toEqual([]);
});

test("sem cofre de senhas no sistema (erro): o recurso continua funcionando guardando no banco, como antes (B26)", async () => {
  t.handlers["secret_get"] = () => {
    throw new Error("Nenhum serviço de chaves disponível");
  };
  t.handlers["secret_set"] = () => {
    throw new Error("Nenhum serviço de chaves disponível");
  };
  await saveAiSettings("sk-ant-sem-cofre-1234567890abcdef", "claude-haiku-4-5", null);
  await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: "sk-ant-sem-cofre-1234567890abcdef" });
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
