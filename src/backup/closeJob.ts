import { getDb } from "../db";
import { errorText } from "../ui/Toast";
import { logError } from "../diagnostics/log";
import { loadSyncConfig, session, syncOnClose, whoAmI } from "../sync/sync";
import { flushPendingSaves } from "../tools/pendingSaves";
import { loadAutoBackupConfig, runAutoBackup } from "./auto";

/** Tempo máximo que o fechamento espera sem sincronização: só o backup. */
export const CLOSE_TIMEOUT_MS = 4000;
/** Com sincronização ligada o passo crítico é enviar para o outro computador: dá mais tempo (M2). */
export const SYNC_CLOSE_TIMEOUT_MS = 15_000;

/**
 * O que o app faz antes de sair (janela fechada, Cmd+Q ou instalando uma atualização): envia o daqui e solta a trava
 * da sincronização, e depois faz o backup. A sincronização vem primeiro porque é ela que o outro computador espera, e
 * o backup (pesado, com fotos) comia o tempo dela (M2). Nunca prende o fechamento além do limite: se demorar, sai
 * mesmo assim (o backup da abertura cobre). Falha do backup fica guardada para avisar na próxima abertura (M13).
 */
export async function runCloseJob(): Promise<void> {
  const db = await getDb();
  const syncing = session.active && (await loadSyncConfig(db)).enabled;
  const job = (async () => {
    await flushPendingSaves(); // a última edição das ferramentas (gravação adiada em 0,8 s) entra na sync e no backup (M14)
    if (syncing) await syncOnClose(db, await whoAmI(db), session.since);
    const c = await loadAutoBackupConfig(db);
    if (c.enabled) await runAutoBackup(db, c);
  })();
  const timeout = new Promise<void>((r) => setTimeout(r, syncing ? SYNC_CLOSE_TIMEOUT_MS : CLOSE_TIMEOUT_MS));
  await Promise.race([job.catch((e) => logError("fechar", new Error(`Fechamento incompleto: ${errorText(e)}`), "warn")), timeout]);
}
