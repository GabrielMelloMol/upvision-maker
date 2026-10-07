// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
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

const KEY = "sk-ant-segredo-1234567890abcdef";
const keyRows = () => t.db.select("SELECT key FROM secrets WHERE key = 'anthropic_api_key'");

describe("chave da IA (B26)", () => {
  test("com cofre de senhas (Windows): a chave fica no cofre e nunca no banco", async () => {
    await saveAiSettings(KEY, "claude-haiku-4-5", null);
    expect(t.keychain.get("anthropic_api_key")).toBe(KEY);
    expect(await keyRows()).toEqual([]);
    await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: KEY });
    await saveAiSettings(null, "claude-haiku-4-5", null);
    expect(t.keychain.has("anthropic_api_key")).toBe(false);
    expect(await keyRows()).toEqual([]);
  });

  test("no Mac (app sem assinatura paga) o cofre NUNCA é usado: ele pediria senha a cada versão nova; a chave fica no banco", async () => {
    t.vault = false;
    await saveAiSettings(KEY, "claude-haiku-4-5", null);
    await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: KEY });
    expect(await keyRows()).toHaveLength(1);
    expect(t.calls.filter((c) => c === "secret_get" || c === "secret_set" || c === "secret_delete")).toEqual([]);
    await saveAiSettings(null, "claude-haiku-4-5", null);
    expect(await keyRows()).toEqual([]);
  });

  test("chave que estava no banco vai para o cofre; só sai do banco depois de conferir que o cofre devolve a mesma", async () => {
    await t.db.execute("INSERT INTO secrets (key, value) VALUES ('anthropic_api_key', ?)", [KEY]);
    // o cofre "aceita" mas devolve outra coisa (ou nada): a cópia do banco NÃO pode ser apagada
    t.handlers["secret_set"] = () => null;
    t.handlers["secret_get"] = () => null;
    await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: KEY });
    expect(await keyRows()).toHaveLength(1);
    // agora o cofre funciona de verdade
    delete t.handlers["secret_set"];
    delete t.handlers["secret_get"];
    await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: KEY });
    expect(t.keychain.get("anthropic_api_key")).toBe(KEY);
    expect(await keyRows()).toEqual([]);
  });

  test("cofre que falha ao gravar (bloqueado, negado): a chave continua no banco e a IA funciona", async () => {
    t.handlers["secret_set"] = () => {
      throw new Error("Acesso negado pelo sistema");
    };
    await saveAiSettings(KEY, "claude-haiku-4-5", null);
    expect(await keyRows()).toHaveLength(1);
    await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: KEY });
  });

  test("cofre que nega a leitura e nada no banco: sem chave, a IA pede de novo, sem erro nem perda de dados", async () => {
    t.keychain.set("anthropic_api_key", KEY);
    t.handlers["secret_get"] = () => {
      throw new Error("Acesso negado pelo sistema");
    };
    await expect(loadAiSettings()).resolves.toEqual({ apiKey: null, model: DEFAULT_AI_MODEL, workspaceId: null });
    await saveAiSettings(KEY, "claude-haiku-4-5", "wrkspc_abc12345"); // a pessoa cola a chave de novo: salva (no banco, o cofre está negando)
    delete t.handlers["secret_get"];
    delete t.handlers["secret_set"];
    t.handlers["secret_set"] = () => {
      throw new Error("Acesso negado pelo sistema");
    };
    await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: KEY, workspaceId: "wrkspc_abc12345" });
  });

  test("a chave do banco, mais nova, vence a que ficou no cofre (o cofre estava negando quando ela foi salva)", async () => {
    t.keychain.set("anthropic_api_key", "sk-ant-velha-1234567890abcdef");
    await t.db.execute("INSERT INTO secrets (key, value) VALUES ('anthropic_api_key', ?)", [KEY]);
    await expect(loadAiSettings()).resolves.toMatchObject({ apiKey: KEY });
    expect(t.keychain.get("anthropic_api_key")).toBe(KEY);
    expect(await keyRows()).toEqual([]);
  });

  test("remover a chave: se o cofre não deixar apagar, avisa em vez de a chave reaparecer depois", async () => {
    await saveAiSettings(KEY, "claude-haiku-4-5", null);
    t.handlers["secret_delete"] = () => {
      throw new Error("Acesso negado pelo sistema");
    };
    await expect(saveAiSettings(null, "claude-haiku-4-5", null)).rejects.toThrow(/cofre de senhas/);
    expect(await keyRows()).toEqual([]);
  });
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
