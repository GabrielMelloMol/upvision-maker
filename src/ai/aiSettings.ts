import { getDb } from "../db";
import { deleteSecret, getSecret, setSecret } from "../db/repo";
import { DEFAULT_AI_MODEL } from "./cost";

// Guardados só neste computador (tabela local fora do backup).
const KEY = "anthropic_api_key";
const MODEL = "ai_model";
const WORKSPACE = "ai_workspace_id";

export type AiSettings = { apiKey: string | null; model: string; workspaceId: string | null };

export async function loadAiSettings(): Promise<AiSettings> {
  const db = await getDb();
  return { apiKey: await getSecret(db, KEY), model: (await getSecret(db, MODEL)) ?? DEFAULT_AI_MODEL, workspaceId: await getSecret(db, WORKSPACE) };
}

export async function saveAiSettings(apiKey: string | null, model: string, workspaceId: string | null): Promise<void> {
  const db = await getDb();
  if (apiKey) await setSecret(db, KEY, apiKey);
  else await deleteSecret(db, KEY);
  await setSecret(db, MODEL, model);
  if (workspaceId) await setSecret(db, WORKSPACE, workspaceId);
  else await deleteSecret(db, WORKSPACE);
}

/** Formato das chaves da Anthropic (validação local antes de testar na API). */
export const looksLikeKey = (k: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim());

/** ID de workspace da Anthropic (wrkspc_ + letras e números). */
export const looksLikeWorkspace = (w: string) => /^wrkspc_[A-Za-z0-9]{8,}$/.test(w.trim());
