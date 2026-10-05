import { invoke } from "@tauri-apps/api/core";
import { exportBackup } from "../db/backup";
import { deleteSecret, getSecret, setSecret } from "../db/repo";
import type { Db } from "../db/types";

/**
 * Backup automático rotativo (#5). A configuração fica na tabela local `secrets`
 * (não vai para o backup: a pasta é deste computador). Gravação, rotação e leitura ficam no Rust (backup.rs).
 */
/** `photos`: incluir as fotos (#162); desligado, o backup fica leve e restaurar mantém as fotos do app. */
export type AutoBackupConfig = { enabled: boolean; dir: string; keep: number; photos: boolean };
export type BackupEntry = { name: string; path: string; bytes: number };

/** Quantos backups guardar: nunca menos de 2, senão um dia ruim apagaria o único bom (B3). */
export const KEEP_MIN = 2;
export const KEEP_MAX = 365;
export const AUTO_DEFAULTS: AutoBackupConfig = { enabled: true, dir: "", keep: 10, photos: true };
const DAY_MS = 86_400_000;
export const REMIND_DAYS = 7;
const K = { enabled: "backup_enabled", dir: "backup_dir", keep: "backup_keep", last: "backup_last_at", photos: "backup_photos", error: "backup_error" };

const pad = (n: number) => String(n).padStart(2, "0");
/** `2026-09-28-153000` (hora local): vira parte do nome do arquivo. */
export const backupStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Automático vence 24 h depois do último backup (manual ou automático). */
export const isDue = (lastAt: string | null, now = new Date()) => !lastAt || now.getTime() - new Date(lastAt).getTime() >= DAY_MS;

export function daysSince(lastAt: string | null, now = new Date()): number | null {
  return lastAt ? Math.floor((now.getTime() - new Date(lastAt).getTime()) / DAY_MS) : null;
}

export const needsReminder = (lastAt: string | null, now = new Date()) => {
  const d = daysSince(lastAt, now);
  return d === null || d >= REMIND_DAYS;
};

export async function loadAutoBackupConfig(db: Db): Promise<AutoBackupConfig & { lastAt: string | null; lastError: string | null }> {
  const [enabled, dir, keep, lastAt, photos, lastError] = await Promise.all([getSecret(db, K.enabled), getSecret(db, K.dir), getSecret(db, K.keep), getSecret(db, K.last), getSecret(db, K.photos), getSecret(db, K.error)]);
  const n = Number(keep);
  return {
    enabled: enabled === null ? AUTO_DEFAULTS.enabled : enabled === "1",
    dir: dir ?? AUTO_DEFAULTS.dir,
    keep: Number.isInteger(n) && n >= 1 && n <= KEEP_MAX ? Math.max(n, KEEP_MIN) : AUTO_DEFAULTS.keep,
    photos: photos === null ? AUTO_DEFAULTS.photos : photos === "1",
    lastAt,
    lastError,
  };
}

export async function saveAutoBackupConfig(db: Db, c: AutoBackupConfig): Promise<void> {
  await setSecret(db, K.enabled, c.enabled ? "1" : "0");
  await setSecret(db, K.dir, c.dir.trim());
  await setSecret(db, K.keep, String(Math.round(c.keep)));
  await setSecret(db, K.photos, c.photos ? "1" : "0");
}

/** Registra que houve backup (automático ou o manual do menu). */
export const markBackupDone = (db: Db, when = new Date()) => setSecret(db, K.last, when.toISOString());

export const defaultBackupDir = () => invoke<string>("backup_default_dir");
export const listAutoBackups = (dir: string) => invoke<BackupEntry[]>("backup_list", { dir });
export const readAutoBackup = (dir: string, name: string) => invoke<string>("backup_read", { dir, name });

/**
 * Faz o backup agora na pasta configurada, apaga os mais antigos além de `keep` e registra a data.
 * Se falhar, guarda o motivo (M13): quem chama pode estar fechando o app e não ter onde mostrar; a próxima
 * abertura avisa. Dar certo apaga o aviso.
 */
export async function runAutoBackup(db: Db, c: AutoBackupConfig, now = new Date()): Promise<BackupEntry> {
  try {
    const json = JSON.stringify(await exportBackup(db, { photos: c.photos }));
    const entry = await invoke<BackupEntry>("backup_write", { dir: c.dir, stamp: backupStamp(now), json, keep: c.keep });
    await markBackupDone(db, now);
    await deleteSecret(db, K.error);
    return entry;
  } catch (e) {
    await setSecret(db, K.error, e instanceof Error ? e.message : String(e)).catch(() => {});
    throw e;
  }
}

/** Na abertura: se ligado e vencido, faz o backup. Retorna o arquivo criado ou null. */
export async function autoBackupIfDue(db: Db, now = new Date()): Promise<BackupEntry | null> {
  const c = await loadAutoBackupConfig(db);
  if (!c.enabled || !isDue(c.lastAt, now)) return null;
  return runAutoBackup(db, c, now);
}
