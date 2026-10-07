import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../db";
import { deleteSecret, getSecret, setSecret } from "../db/repo";
import type { Db } from "../db/types";
import { logError } from "../diagnostics/log";
import { DEFAULT_AI_MODEL } from "./cost";

// O modelo e o workspace ficam numa tabela local fora do backup. A chave da API fica no cofre de senhas do sistema
// (Keychain no Mac, Gerenciador de Credenciais no Windows): no banco ela era texto puro, legível por qualquer programa
// do mesmo usuário (B26).
const KEY = "anthropic_api_key";
const MODEL = "ai_model";
const WORKSPACE = "ai_workspace_id";

export type AiSettings = { apiKey: string | null; model: string; workspaceId: string | null };

const vault = {
  get: () => invoke<string | null>("secret_get", { name: KEY }),
  set: (value: string) => invoke<void>("secret_set", { name: KEY, value }),
  remove: () => invoke<void>("secret_delete", { name: KEY }),
};

/**
 * A chave guardada. Versões anteriores a deixavam em texto no banco: na primeira leitura ela vai para o cofre e some do
 * banco. Se o sistema não tem cofre disponível, a chave segue no banco como antes (o recurso não quebra).
 */
async function readApiKey(db: Db): Promise<string | null> {
  const legacy = await getSecret(db, KEY);
  let stored: string | null = null;
  let vaultWorks = true;
  try {
    stored = await vault.get();
  } catch (e) {
    vaultWorks = false;
    logError("chave da IA", new Error(`Sem cofre de senhas, a chave fica no banco: ${e instanceof Error ? e.message : String(e)}`), "warn");
  }
  if (stored) {
    if (legacy) await deleteSecret(db, KEY); // sobrou uma cópia em texto
    return stored;
  }
  if (legacy && vaultWorks) {
    try {
      await vault.set(legacy);
      await deleteSecret(db, KEY);
    } catch (e) {
      logError("chave da IA", e, "warn"); // não conseguiu mover: segue no banco
    }
  }
  return legacy;
}

async function writeApiKey(db: Db, apiKey: string | null): Promise<void> {
  if (!apiKey) {
    await vault.remove().catch((e) => logError("chave da IA", e, "warn"));
    await deleteSecret(db, KEY);
    return;
  }
  try {
    await vault.set(apiKey);
    await deleteSecret(db, KEY);
  } catch (e) {
    logError("chave da IA", new Error(`Sem cofre de senhas, a chave fica no banco: ${e instanceof Error ? e.message : String(e)}`), "warn");
    await setSecret(db, KEY, apiKey);
  }
}

export async function loadAiSettings(): Promise<AiSettings> {
  const db = await getDb();
  return { apiKey: await readApiKey(db), model: (await getSecret(db, MODEL)) ?? DEFAULT_AI_MODEL, workspaceId: await getSecret(db, WORKSPACE) };
}

export async function saveAiSettings(apiKey: string | null, model: string, workspaceId: string | null): Promise<void> {
  const db = await getDb();
  await writeApiKey(db, apiKey);
  await setSecret(db, MODEL, model);
  if (workspaceId) await setSecret(db, WORKSPACE, workspaceId);
  else await deleteSecret(db, WORKSPACE);
}

/** Formato das chaves da Anthropic (validação local antes de testar na API). */
export const looksLikeKey = (k: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim());

/** ID de workspace da Anthropic (wrkspc_ + letras e números). */
export const looksLikeWorkspace = (w: string) => /^wrkspc_[A-Za-z0-9]{8,}$/.test(w.trim());
