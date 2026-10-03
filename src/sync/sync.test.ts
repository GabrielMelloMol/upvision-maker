// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { restoreFromText } from "../backupActions";
import { exportBackup } from "../db/backup";
import { runBatch } from "../db/testDb";
import type { Stmt } from "../db/types";
import { setSecret } from "../db/repo";
import { setupTauri } from "../test/harness";
import { dataHash, decide, lockState, setSyncEnabled, syncNow, syncOnClose, whoAmI, type SyncLock } from "./sync";

const t = setupTauri();
const DIR = "C:/Users/ana/OneDrive/UpVision";
const folder = () => t.autoBackups.get(DIR) ?? new Map<string, string>();
const since = "2026-09-29T14:32:00.000Z";
const at = (iso: string) => ({ since, now: new Date(iso) });
const printers = async () => (await t.db.select<{ name: string }>("SELECT name FROM printers ORDER BY id")).map((p) => p.name);

/** O "outro computador" grava na pasta os dados de agora com as impressoras trocadas. */
async function otherComputerSaves(names: string[]) {
  const b = await exportBackup(t.db);
  const tables = {
    ...b.tables,
    printers: names.map((name, i) => ({
      ...b.tables.printers[0],
      id: i + 1,
      name,
    })),
  };
  const hash = await dataHash({ ...b, tables });
  folder().set(
    "upvision-sync.json",
    JSON.stringify({
      ...b,
      tables,
      sync: {
        device: "outro",
        deviceName: "NOTE-ANA",
        savedAt: "2026-09-29T15:00:00.000Z",
        hash,
      },
    }),
  );
}
const lockOf = (device: string, heartbeat: string): SyncLock => ({
  device,
  deviceName: "NOTE-ANA",
  since,
  heartbeat,
});

beforeEach(async () => {
  await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 100)");
  await setSecret(t.db, "backup_dir", DIR);
  await setSyncEnabled(t.db, true);
});

describe("decisões (#16)", () => {
  test("trava: livre, minha, de outro, e de outro sem sinal há mais de 5 min vira livre", () => {
    const now = new Date("2026-09-29T15:00:00Z");
    expect(lockState(null, "eu", now)).toBe("livre");
    expect(lockState(lockOf("eu", "2026-09-29T10:00:00Z"), "eu", now)).toBe("minha");
    expect(lockState(lockOf("outro", "2026-09-29T14:58:00Z"), "eu", now)).toBe("outro");
    expect(lockState(lockOf("outro", "2026-09-29T14:54:00Z"), "eu", now)).toBe("livre");
  });

  test("o que mudou desde a última sincronização decide o sentido", () => {
    const last = { local: "L", remote: "R" };
    expect(decide("L", null, last)).toBe("exportar");
    expect(decide("X", "X", last)).toBe("nada");
    expect(decide("L", "R", last)).toBe("nada");
    expect(decide("L", "R2", last)).toBe("importar");
    expect(decide("L2", "R", last)).toBe("exportar");
    expect(decide("L2", "R2", last)).toBe("conflito");
    expect(decide("L", "R", null)).toBe("conflito");
  });
});

describe("sincronizar pela pasta (#16)", () => {
  test("desligada ou na pasta padrão (que não sai do computador) não faz nada", async () => {
    const me = await whoAmI(t.db);
    await setSyncEnabled(t.db, false);
    expect(await syncNow(t.db, me, { since })).toEqual({ kind: "desligado" });
    await setSyncEnabled(t.db, true);
    await setSecret(t.db, "backup_dir", "");
    expect(await syncNow(t.db, me, { since })).toEqual({ kind: "desligado" });
    expect(t.calls).not.toContain("sync_write");
  });

  test("pasta vazia: exporta, pega a trava; sem mudança, não regrava; ao fechar solta a trava", async () => {
    const me = await whoAmI(t.db);
    expect(me.deviceName).toBe("ESTE-PC");
    expect(await syncNow(t.db, me, at("2026-09-29T14:32:00Z"))).toEqual({
      kind: "ok",
    });
    const saved = JSON.parse(folder().get("upvision-sync.json")!);
    expect(saved.app).toBe("upvision-maker"); // é um backup válido
    expect(saved.sync).toMatchObject({
      device: me.device,
      deviceName: "ESTE-PC",
    });
    expect(JSON.parse(folder().get("upvision-sync.lock")!)).toMatchObject({
      device: me.device,
      since,
    });
    const before = folder().get("upvision-sync.json");
    await syncNow(t.db, me, at("2026-09-29T14:33:00Z"));
    expect(folder().get("upvision-sync.json")).toBe(before);
    await syncOnClose(t.db, me, since);
    expect(folder().has("upvision-sync.lock")).toBe(false);
  });

  test("o outro computador mudou e este não: importa (com cópia de segurança dos dados daqui)", async () => {
    const me = await whoAmI(t.db);
    await syncNow(t.db, me, { since });
    await otherComputerSaves(["Ender 3", "Prusa MK4"]);
    const r = await syncNow(t.db, me, { since });
    expect(r).toMatchObject({
      kind: "importado",
      from: { deviceName: "NOTE-ANA" },
    });
    expect(await printers()).toEqual(["Ender 3", "Prusa MK4"]);
    expect([...t.files.keys()].some((k) => k.includes("antes-de-restaurar"))).toBe(true);
    expect(await syncNow(t.db, me, { since })).toEqual({ kind: "ok" }); // não importa de novo
  });

  test("este mudou: exporta por cima", async () => {
    const me = await whoAmI(t.db);
    await syncNow(t.db, me, { since });
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('K1', 350)");
    await syncNow(t.db, me, { since });
    expect(JSON.parse(folder().get("upvision-sync.json")!).tables.printers.map((p: { name: string }) => p.name)).toEqual(["Bambu A1", "K1"]);
  });

  test("os dois mudaram: mantém os dados daqui, guarda os da pasta como cópia de conflito restaurável", async () => {
    const me = await whoAmI(t.db);
    await syncNow(t.db, me, { since });
    await otherComputerSaves(["Ender 3"]);
    const theirs = folder().get("upvision-sync.json");
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('K1', 350)");
    const r = await syncNow(t.db, me, at("2026-09-29T15:10:00Z"));
    if (r.kind !== "conflito") throw new Error(`esperava conflito, veio ${r.kind}`);
    expect(r.copy).toMatch(/^upvision-conflito-2026-09-29-\d{6}\.json$/);
    expect(r.from.deviceName).toBe("NOTE-ANA");
    expect(folder().get(r.copy)).toBe(theirs);
    expect(await printers()).toEqual(["Bambu A1", "K1"]);
    expect(t.calls).toContain("sync_conflict");
  });

  test("em uso no outro computador: não mexe em nada; assumir pega a trava", async () => {
    const me = await whoAmI(t.db);
    t.autoBackups.set(DIR, new Map([["upvision-sync.lock", JSON.stringify(lockOf("outro", "2026-09-29T14:59:00Z"))]]));
    const r = await syncNow(t.db, me, at("2026-09-29T15:00:00Z"));
    expect(r).toMatchObject({
      kind: "trava",
      lock: { deviceName: "NOTE-ANA" },
    });
    expect(folder().has("upvision-sync.json")).toBe(false);
    await syncNow(t.db, me, { ...at("2026-09-29T15:00:00Z"), force: true });
    expect(JSON.parse(folder().get("upvision-sync.lock")!).device).toBe(me.device);
  });

  test("trava abandonada (sem sinal há mais de 5 min) é assumida sozinha", async () => {
    const me = await whoAmI(t.db);
    t.autoBackups.set(DIR, new Map([["upvision-sync.lock", JSON.stringify(lockOf("outro", "2026-09-29T14:00:00Z"))]]));
    expect(await syncNow(t.db, me, at("2026-09-29T15:00:00Z"))).toEqual({
      kind: "ok",
    });
  });

  test("arquivo da pasta estragado: erro claro, nada é apagado", async () => {
    const me = await whoAmI(t.db);
    t.autoBackups.set(DIR, new Map([["upvision-sync.json", "{cortado"]]));
    await expect(syncNow(t.db, me, { since })).rejects.toThrow(/corrompido/);
    expect(await printers()).toEqual(["Bambu A1"]);
  });

  test("restaurar e sincronizar nunca rodam juntos: o tick espera a restauração terminar (C1)", async () => {
    const backup = JSON.stringify(await exportBackup(t.db));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    t.handlers.sql_batch = async (a) => {
      await gate; // restauração "demorada" (fotos)
      runBatch(t.raw, a.statements as Stmt[]);
      return null;
    };
    const restoring = restoreFromText(backup);
    const ticking = syncNow(t.db, await whoAmI(t.db), at("2026-09-29T15:01:00Z"));
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls).not.toContain("sync_read"); // o tick não leu a pasta com o banco pela metade
    release();
    await Promise.all([restoring, ticking]);
    expect(t.calls.indexOf("sync_read")).toBeGreaterThan(t.calls.indexOf("sql_batch"));
  });
});
