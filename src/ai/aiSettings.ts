import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../db";
import { deleteSecret, getSecret, setSecret } from "../db/repo";
import type { Db } from "../db/types";
import { logError } from "../diagnostics/log";
import { DEFAULT_AI_MODEL } from "./cost";

// O modelo e o workspace ficam numa tabela local fora do backup e da sincronização (assim como a chave, quando não há
// cofre). A chave da API vai para o cofre de senhas do sistema só onde ele não incomoda a pessoa: no Windows
// (Gerenciador de Credenciais, protegido pela conta, sem pedir nada). No Mac o app não tem assinatura paga: a cada
// versão nova a assinatura muda e o Keychain pediria a senha da pessoa para liberar o item de novo, o que seria pior
// que guardar no banco. Lá a chave fica no banco, que só o usuário lê (permissão 600) e que não entra no backup (B26).
const KEY = "anthropic_api_key";
const MODEL = "ai_model";
const WORKSPACE = "ai_workspace_id";

export type AiSettings = { apiKey: string | null; model: string; workspaceId: string | null };

const vault = {
  available: () => invoke<boolean>("secret_vault_available").catch(() => false),
  get: () => invoke<string | null>("secret_get", { name: KEY }),
  set: (value: string) => invoke<void>("secret_set", { name: KEY, value }),
  remove: () => invoke<void>("secret_delete", { name: KEY }),
};

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Grava no cofre e só dá por gravado se ele devolver a mesma chave (aceitar sem guardar de fato é pior que falhar). */
async function putInVault(apiKey: string): Promise<boolean> {
  try {
    await vault.set(apiKey);
    return (await vault.get()) === apiKey;
  } catch (e) {
    logError("chave da IA", new Error(`O cofre de senhas não guardou a chave, ela fica no banco: ${why(e)}`), "warn");
    return false;
  }
}

/**
 * A chave guardada. O que está no banco é sempre a gravação mais recente que não chegou ao cofre (ou onde não há
 * cofre): ele vence e tenta ir para o cofre; só sai do banco depois de o cofre confirmar. Cofre que nega ou falha nunca
 * derruba nada: sem chave, a IA pede de novo.
 */
async function readApiKey(db: Db): Promise<string | null> {
  const inDb = await getSecret(db, KEY);
  if (!(await vault.available())) return inDb;
  if (inDb) {
    if (await putInVault(inDb)) await deleteSecret(db, KEY);
    return inDb;
  }
  try {
    return await vault.get();
  } catch (e) {
    logError("chave da IA", new Error(`Não consegui ler a chave no cofre de senhas: ${why(e)}`), "warn");
    return null;
  }
}

async function writeApiKey(db: Db, apiKey: string | null): Promise<void> {
  const useVault = await vault.available();
  if (!apiKey) {
    await deleteSecret(db, KEY);
    if (useVault) {
      // se o cofre não apagar, avisa: senão a chave "removida" reapareceria na próxima leitura
      await vault.remove().catch((e) => {
        throw new Error(`Não consegui remover a chave do cofre de senhas do computador: ${why(e)}`, { cause: e });
      });
    }
    return;
  }
  if (useVault && (await putInVault(apiKey))) {
    await deleteSecret(db, KEY);
    return;
  }
  await setSecret(db, KEY, apiKey);
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
