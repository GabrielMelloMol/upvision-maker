import { getDb } from "../db";
import { deleteSecret, getSecret, setSecret } from "../db/repo";
import { DEFAULT_AI_MODEL } from "./cost";

// Guardados só neste computador (tabela local fora do backup).
const KEY = "anthropic_api_key";
const MODEL = "ai_model";

export async function loadAiSettings(): Promise<{ apiKey: string | null; model: string }> {
  const db = await getDb();
  return { apiKey: await getSecret(db, KEY), model: (await getSecret(db, MODEL)) ?? DEFAULT_AI_MODEL };
}

export async function saveAiSettings(apiKey: string | null, model: string): Promise<void> {
  const db = await getDb();
  if (apiKey) await setSecret(db, KEY, apiKey);
  else await deleteSecret(db, KEY);
  await setSecret(db, MODEL, model);
}

/** Formato das chaves da Anthropic (validação local antes de testar na API). */
export const looksLikeKey = (k: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim());
