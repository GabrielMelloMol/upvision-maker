import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { useCallback, useEffect, useState } from "react";
import { getDb } from "../db";
import { autoBackupIfDue, daysSince, loadAutoBackupConfig, needsReminder, runAutoBackup } from "./auto";
import { BACKUP_DONE_EVENT, notifyBackupDone } from "./BackupSettingsCard";
import { runCloseJob } from "./closeJob";

/**
 * Backup automático do app (#5): na abertura, se venceu (24 h); ao fechar, se ligado (substitui o do dia).
 * Devolve quantos dias faz sem backup quando passou do limite do lembrete (senão null), o último erro do backup
 * automático (M13) e um "fazer agora".
 */
export function useAutoBackup(): { reminderDays: number | null; neverBackedUp: boolean; backupError: string | null; backupNow: () => Promise<void> } {
  const [state, setState] = useState<{ lastAt: string | null; error: string | null } | undefined>(undefined);

  const reload = useCallback(async () => {
    const c = await loadAutoBackupConfig(await getDb());
    setState({ lastAt: c.lastAt, error: c.lastError });
  }, []);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      if (await autoBackupIfDue(db)) notifyBackupDone();
    })()
      .catch((e) => console.warn("Backup automático na abertura falhou:", e)) // o motivo fica guardado e a faixa o mostra
      .finally(() => void reload().catch(() => {}));
    const onDone = () => void reload().catch(() => {});
    window.addEventListener(BACKUP_DONE_EVENT, onDone);
    return () => window.removeEventListener(BACKUP_DONE_EVENT, onDone);
  }, [reload]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    let alive = true;
    let win: ReturnType<typeof getCurrentWindow>;
    try {
      win = getCurrentWindow();
    } catch {
      return; // fora do app (navegador/teste): sem janela nativa
    }
    win
      .onCloseRequested(() => runCloseJob()) // nunca prende o fechamento além do limite
      .then((u) => (unlisten = u))
      .catch((e) => console.warn("Sem backup ao fechar (fora do app?):", e));
    // Cmd+Q no Mac não fecha a janela antes: o Rust adia a saída e o trabalho do fechamento roda aqui (M3)
    listen("exit-requested", async () => {
      await runCloseJob();
      await exit(0);
    })
      .then((u) => (alive ? (unlistenExit = u) : u()))
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
      unlistenExit?.();
    };
  }, []);

  const backupNow = useCallback(async () => {
    const db = await getDb();
    try {
      await runAutoBackup(db, await loadAutoBackupConfig(db));
      notifyBackupDone();
    } finally {
      await reload().catch(() => {});
    }
  }, [reload]);

  const show = state !== undefined && needsReminder(state.lastAt);
  return { reminderDays: show ? daysSince(state.lastAt) : null, neverBackedUp: show && state.lastAt === null, backupError: state?.error ?? null, backupNow };
}
