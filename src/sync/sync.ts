import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { backupStamp, loadAutoBackupConfig } from "../backup/auto";
import { replaceData } from "../backupActions";
import { exportBackup, type Backup } from "../db/backup";
import { exclusive } from "../db/dataLock";
import { getSecret, setSecret } from "../db/repo";
import type { Db } from "../db/types";

/**
 * Sincronizar 2 computadores pela pasta do backup automático (OneDrive/Google Drive/Dropbox) (#16).
 * Na pasta: `upvision-sync.json` (um backup com a marca `sync`) e `upvision-sync.lock` (quem está usando).
 * Cada computador lembra o estado local e o da pasta na última sincronização; mudou só um lado → copia;
 * mudaram os dois → conflito: guarda os dados da pasta como cópia (em Backups guardados) e fica com os daqui.
 */
export type Me = { device: string; deviceName: string };
export type SyncLock = Me & { since: string; heartbeat: string };
export type LockState = "livre" | "minha" | "outro";
export type Decision = "nada" | "importar" | "exportar" | "conflito";
type Last = { local: string; remote: string };

/** Trava sem sinal de vida há mais que isso = o outro computador fechou sem avisar (queda, bateria). */
export const STALE_MS = 5 * 60_000;
export const TICK_MS = 60_000;
const K = {
  enabled: "sync_enabled",
  device: "sync_device",
  local: "sync_local_hash",
  remote: "sync_remote_hash",
  at: "sync_last_at",
};

const LockSchema = z.object({
  device: z.string().min(1),
  deviceName: z.string(),
  since: z.string(),
  heartbeat: z.string(),
});
const MarkSchema = z.object({
  sync: z.object({
    device: z.string(),
    deviceName: z.string(),
    savedAt: z.string(),
    hash: z.string(),
  }),
});
export type SyncMark = z.infer<typeof MarkSchema>["sync"];

export function lockState(lock: SyncLock | null, me: string, now = new Date()): LockState {
  if (!lock) return "livre";
  if (lock.device === me) return "minha";
  return now.getTime() - new Date(lock.heartbeat).getTime() > STALE_MS ? "livre" : "outro";
}

export function decide(local: string, remote: string | null, last: Last | null): Decision {
  if (remote === null) return "exportar";
  if (remote === local) return "nada";
  if (!last) return "conflito"; // primeira vez com dados dos dois lados: não escolhe sozinho
  const localChanged = local !== last.local;
  const remoteChanged = remote !== last.remote;
  if (localChanged && remoteChanged) return "conflito";
  if (remoteChanged) return "importar";
  return localChanged ? "exportar" : "nada";
}

export async function dataHash(b: Backup): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(b.tables)));
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export type SyncConfig = {
  enabled: boolean;
  dir: string;
  lastAt: string | null;
  last: Last | null;
};

export async function loadSyncConfig(db: Db): Promise<SyncConfig> {
  const [enabled, local, remote, lastAt, backup] = await Promise.all([
    getSecret(db, K.enabled),
    getSecret(db, K.local),
    getSecret(db, K.remote),
    getSecret(db, K.at),
    loadAutoBackupConfig(db),
  ]);
  return {
    enabled: enabled === "1" && backup.dir !== "",
    dir: backup.dir,
    lastAt,
    last: local && remote ? { local, remote } : null,
  };
}

export const setSyncEnabled = (db: Db, on: boolean) => setSecret(db, K.enabled, on ? "1" : "0");

export async function whoAmI(db: Db): Promise<Me> {
  let device = await getSecret(db, K.device);
  if (!device) {
    device = crypto.randomUUID();
    await setSecret(db, K.device, device);
  }
  return {
    device,
    deviceName: await invoke<string>("device_name").catch(() => "outro computador"),
  };
}

const read = (dir: string, kind: "data" | "lock") => invoke<string | null>("sync_read", { dir, kind });

export async function readLock(dir: string): Promise<SyncLock | null> {
  const text = await read(dir, "lock");
  if (!text) return null;
  try {
    const r = LockSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null; // trava ilegível (cortada pela nuvem): tratada como livre
  }
}

export const writeLock = (dir: string, me: Me, since: string, now = new Date()) =>
  invoke("sync_write", {
    dir,
    kind: "lock",
    json: JSON.stringify({
      ...me,
      since,
      heartbeat: now.toISOString(),
    } satisfies SyncLock),
  });

/** Os dados da pasta: o texto (um backup válido) e a marca de quem gravou. */
export async function readRemote(dir: string): Promise<{ text: string; mark: SyncMark } | null> {
  const text = await read(dir, "data");
  if (!text) return null;
  try {
    const r = MarkSchema.safeParse(JSON.parse(text));
    if (r.success) return { text, mark: r.data.sync };
  } catch {
    // cai no erro abaixo
  }
  throw new Error("O arquivo de sincronização na pasta está corrompido. Restaure um backup ou desligue a sincronização.");
}

async function remember(db: Db, local: string, remote: string, now: Date) {
  await setSecret(db, K.local, local);
  await setSecret(db, K.remote, remote);
  await setSecret(db, K.at, now.toISOString());
}

async function exportTo(db: Db, dir: string, me: Me, backup: Backup, hash: string, now: Date) {
  const sync: SyncMark = { ...me, savedAt: now.toISOString(), hash };
  await invoke("sync_write", {
    dir,
    kind: "data",
    json: JSON.stringify({ ...backup, sync }),
  });
  await remember(db, hash, hash, now);
}

export type SyncResult =
  { kind: "desligado" | "ok" } | { kind: "importado"; from: SyncMark } | { kind: "trava"; lock: SyncLock } | { kind: "conflito"; copy: string; from: SyncMark };

/**
 * Sincroniza agora. Na abertura (`since` = agora) e a cada minuto (`since` = quando pegou a trava).
 * `force` assume a trava de outro computador.
 */
export const syncNow = (db: Db, me: Me, opts: SyncOpts): Promise<SyncResult> => exclusive(() => syncStep(db, me, opts));

type SyncOpts = { since: string; force?: boolean; now?: Date };

async function syncStep(db: Db, me: Me, opts: SyncOpts): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const c = await loadSyncConfig(db);
  if (!c.enabled) return { kind: "desligado" };
  const lock = await readLock(c.dir);
  if (!opts.force && lock && lockState(lock, me.device, now) === "outro") return { kind: "trava", lock };
  await writeLock(c.dir, me, lock?.device === me.device ? lock.since : opts.since, now);

  // ponytail: exporta e faz o hash de tudo a cada minuto (poucos milhares de linhas); marcar "sujo" nos repos se ficar pesado
  const backup = await exportBackup(db);
  const local = await dataHash(backup);
  const remote = await readRemote(c.dir);
  const d = decide(local, remote?.mark.hash ?? null, c.last);
  if (d === "nada") {
    if (remote && (c.last?.local !== local || c.last.remote !== remote.mark.hash)) await remember(db, local, remote.mark.hash, now);
    return { kind: "ok" };
  }
  if (d === "exportar" || !remote) {
    await exportTo(db, c.dir, me, backup, local, now);
    return { kind: "ok" };
  }
  if (d === "importar") {
    await replaceData(remote.text); // guarda uma cópia dos dados daqui antes; numa transação só
    await remember(db, await dataHash(await exportBackup(db)), remote.mark.hash, now);
    return { kind: "importado", from: remote.mark };
  }
  // conflito: os dados da pasta viram uma cópia restaurável e os daqui passam a valer nos dois
  const copy = await invoke<{ name: string }>("sync_conflict", {
    dir: c.dir,
    stamp: backupStamp(now),
    json: remote.text,
  });
  await exportTo(db, c.dir, me, backup, local, now);
  return { kind: "conflito", copy: copy.name, from: remote.mark };
}

/** Ao fechar: sincroniza e solta a trava (se for minha). */
export const syncOnClose = (db: Db, me: Me, since: string): Promise<void> =>
  exclusive(async () => {
    const r = await syncStep(db, me, { since });
    if (r.kind === "desligado" || r.kind === "trava") return;
    await invoke("sync_remove", {
      dir: (await loadSyncConfig(db)).dir,
      kind: "lock",
    });
  });

/** Esta sessão do app: desde quando tem a trava e se ainda sincroniza ("Continuar sem sincronizar" ou trava de outro desligam). */
export const session = { since: new Date().toISOString(), active: true };

/**
 * Ligar pela primeira vez. Se a pasta já tem dados de outro computador, a usuária escolhe:
 * "pasta" traz os de lá (os daqui ficam na cópia de segurança); "daqui" mantém estes (os de lá viram cópia de conflito).
 */
export const startSync = (db: Db, me: Me, keep: "pasta" | "daqui"): Promise<SyncResult> => exclusive(() => startStep(db, me, keep));

async function startStep(db: Db, me: Me, keep: "pasta" | "daqui"): Promise<SyncResult> {
  await setSyncEnabled(db, true);
  if (keep === "pasta") {
    await setSecret(db, K.local, await dataHash(await exportBackup(db)));
    await setSecret(db, K.remote, "-"); // a pasta "mudou": importa
  } else {
    await setSecret(db, K.local, "");
    await setSecret(db, K.remote, "");
  }
  session.active = true;
  return syncStep(db, me, { since: session.since, force: true });
}

export async function stopSync(db: Db, me: Me): Promise<void> {
  const c = await loadSyncConfig(db);
  await setSyncEnabled(db, false);
  if (c.enabled && (await readLock(c.dir))?.device === me.device) await invoke("sync_remove", { dir: c.dir, kind: "lock" });
}

/** "hoje 14:32" / "28/09 14:32". */
export function whenLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return d.toDateString() === now.toDateString() ? `hoje ${time}` : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${time}`;
}
