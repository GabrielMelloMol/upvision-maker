import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

/** Null se não há atualização ou se não deu para checar (offline, sem release publicada). */
export async function findUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch (e) {
    console.warn("Verificação de atualização falhou:", e);
    return null;
  }
}

export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
