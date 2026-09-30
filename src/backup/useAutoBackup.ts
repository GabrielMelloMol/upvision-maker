import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { getDb } from "../db";
import { session, syncOnClose, whoAmI } from "../sync/sync";
import { autoBackupIfDue, daysSince, loadAutoBackupConfig, needsReminder, runAutoBackup } from "./auto";
import { BACKUP_DONE_EVENT, notifyBackupDone } from "./BackupSettingsCard";

/** Tempo máximo que o backup pode segurar o fechamento da janela. */
const CLOSE_TIMEOUT_MS = 4000;

/**
 * Backup automático do app (#5): na abertura, se venceu (24 h); ao fechar, se ligado (substitui o do dia).
 * Devolve quantos dias faz sem backup quando passou do limite do lembrete (senão null) e um "fazer agora".
 */
export function useAutoBackup(): { reminderDays: number | null; neverBackedUp: boolean; backupNow: () => Promise<void> } {
  const [lastAt, setLastAt] = useState<string | null | undefined>(undefined);

  const reload = useCallback(async () => setLastAt((await loadAutoBackupConfig(await getDb())).lastAt), []);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      if (await autoBackupIfDue(db)) notifyBackupDone();
      await reload();
    })().catch((e) => console.warn("Backup automático na abertura falhou:", e));
    const onDone = () => void reload().catch(() => {});
    window.addEventListener(BACKUP_DONE_EVENT, onDone);
    return () => window.removeEventListener(BACKUP_DONE_EVENT, onDone);
  }, [reload]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let win: ReturnType<typeof getCurrentWindow>;
    try {
      win = getCurrentWindow();
    } catch {
      return; // fora do app (navegador/teste): sem janela nativa
    }
    win
      .onCloseRequested(async () => {
        const job = (async () => {
          const db = await getDb();
          const c = await loadAutoBackupConfig(db);
          if (c.enabled) await runAutoBackup(db, c);
          if (session.active) await syncOnClose(db, await whoAmI(db), session.since); // envia o daqui e solta a trava (#16)
        })();
        // nunca prende o fechamento: se demorar, fecha mesmo assim (o backup da abertura cobre)
        await Promise.race([job.catch((e) => console.warn("Backup ao fechar falhou:", e)), new Promise((r) => setTimeout(r, CLOSE_TIMEOUT_MS))]);
      })
      .then((u) => (unlisten = u))
      .catch((e) => console.warn("Sem backup ao fechar (fora do app?):", e));
    return () => unlisten?.();
  }, []);

  const backupNow = useCallback(async () => {
    const db = await getDb();
    await runAutoBackup(db, await loadAutoBackupConfig(db));
    notifyBackupDone();
  }, []);

  const show = lastAt !== undefined && needsReminder(lastAt);
  return { reminderDays: show ? daysSince(lastAt) : null, neverBackedUp: show && lastAt === null, backupNow };
}
