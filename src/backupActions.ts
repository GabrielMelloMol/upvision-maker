import { appDataDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { loadAutoBackupConfig, markBackupDone } from "./backup/auto";
import { exportBackup, parseBackup, restoreBackup } from "./db/backup";
import { getDb } from "./db";
import { exclusive } from "./db/dataLock";

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const FILTERS = [{ name: "Backup UpVision", extensions: ["json"] }];

/** Retorna o caminho salvo, ou null se a usuária cancelou. Conta como backup feito (zera o lembrete). */
export async function saveBackup(): Promise<string | null> {
  const path = await save({ defaultPath: `upvision-backup-${stamp()}.json`, filters: FILTERS });
  if (!path) return null;
  const db = await getDb();
  const { photos } = await loadAutoBackupConfig(db); // "Incluir fotos" vale também para o backup do menu (#162)
  await writeTextFile(path, JSON.stringify(await exportBackup(db, { photos }), null, 2));
  await markBackupDone(db);
  return path;
}

/**
 * Valida o texto, guarda uma cópia dos dados atuais na pasta do app e só então restaura (numa transação: se falhar,
 * nada muda). Sem trava: só para quem já está dentro de `exclusive` (a sincronização).
 */
export async function replaceData(text: string): Promise<{ safetyCopy: string }> {
  const backup = parseBackup(text);
  const db = await getDb();
  const dir = await join(await appDataDir(), "backups");
  await mkdir(dir, { recursive: true });
  const safetyCopy = await join(dir, `antes-de-restaurar-${stamp()}.json`);
  await writeTextFile(safetyCopy, JSON.stringify(await exportBackup(db)));
  try {
    await restoreBackup(db, backup);
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}. Nada foi alterado: os dados continuam como estavam.`, { cause: e });
  }
  return { safetyCopy };
}

/** Restaurar a partir do texto de um backup, esperando a sincronização em andamento (C1). */
export const restoreFromText = (text: string) => exclusive(() => replaceData(text));

/** Escolhe um arquivo de backup e restaura (ver restoreFromText). Null se a usuária cancelou. */
export async function loadBackup(): Promise<{ safetyCopy: string } | null> {
  const path = await open({ multiple: false, directory: false, filters: FILTERS });
  if (!path) return null;
  return restoreFromText(await readTextFile(path));
}
