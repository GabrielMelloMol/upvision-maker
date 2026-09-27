import { appDataDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { exportBackup, parseBackup, restoreBackup } from "./db/backup";
import { getDb } from "./db";

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const FILTERS = [{ name: "Backup UpVision", extensions: ["json"] }];

/** Retorna o caminho salvo, ou null se a usuária cancelou. */
export async function saveBackup(): Promise<string | null> {
  const path = await save({ defaultPath: `upvision-backup-${stamp()}.json`, filters: FILTERS });
  if (!path) return null;
  await writeTextFile(path, JSON.stringify(await exportBackup(await getDb()), null, 2));
  return path;
}

/** Valida o arquivo, guarda uma cópia dos dados atuais na pasta do app e só então restaura. */
export async function loadBackup(): Promise<{ safetyCopy: string } | null> {
  const path = await open({ multiple: false, directory: false, filters: FILTERS });
  if (!path) return null;
  const backup = parseBackup(await readTextFile(path));
  const db = await getDb();
  const dir = await join(await appDataDir(), "backups");
  await mkdir(dir, { recursive: true });
  const safetyCopy = await join(dir, `antes-de-restaurar-${stamp()}.json`);
  await writeTextFile(safetyCopy, JSON.stringify(await exportBackup(db)));
  await restoreBackup(db, backup);
  return { safetyCopy };
}
