import { describe, expect, test } from "vitest";
import { memoryDb } from "../db/testDb";
import { migrate } from "../db/migrations";
import { backupStamp, daysSince, isDue, loadAutoBackupConfig, markBackupDone, needsReminder, saveAutoBackupConfig, AUTO_DEFAULTS } from "./auto";

describe("backup automático: regras", () => {
  const now = new Date("2026-09-28T15:30:00");

  test("carimbo do arquivo em horário local, só dígitos e hífens", () => {
    expect(backupStamp(now)).toBe("2026-09-28-153000");
  });

  test("vence depois de 24 h do último; nunca feito = vence", () => {
    expect(isDue(null, now)).toBe(true);
    expect(isDue("2026-09-27T15:31:00", now)).toBe(false);
    expect(isDue("2026-09-27T15:29:00", now)).toBe(true);
  });

  test("lembrete com 7 dias ou mais sem backup; conta dias inteiros", () => {
    expect(needsReminder(null, now)).toBe(true);
    expect(needsReminder("2026-09-22T16:00:00", now)).toBe(false);
    expect(needsReminder("2026-09-21T15:00:00", now)).toBe(true);
    expect(daysSince("2026-09-21T15:00:00", now)).toBe(7);
    expect(daysSince(null, now)).toBeNull();
  });
});

describe("backup automático: configuração no banco local", async () => {
  test("padrões, gravação e registro do último backup", async () => {
    const db = memoryDb();
    await migrate(db);
    expect(await loadAutoBackupConfig(db)).toEqual({ ...AUTO_DEFAULTS, lastAt: null });
    await saveAutoBackupConfig(db, { enabled: false, dir: "C:/OneDrive/Backups", keep: 30, photos: false });
    await markBackupDone(db, new Date("2026-09-28T10:00:00Z"));
    expect(await loadAutoBackupConfig(db)).toEqual({ enabled: false, dir: "C:/OneDrive/Backups", keep: 30, photos: false, lastAt: "2026-09-28T10:00:00.000Z" });
  });

  test("valor corrompido cai no padrão", async () => {
    const db = memoryDb();
    await migrate(db);
    await db.execute("INSERT INTO secrets (key, value) VALUES ('backup_keep', 'abc')");
    expect((await loadAutoBackupConfig(db)).keep).toBe(AUTO_DEFAULTS.keep);
  });
});
