import { beforeEach, describe, expect, test } from "vitest";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import { migrate } from "./migrations";
import { filaments } from "./repo";
import type { ApplyStock } from "./stock";
import { memoryDb } from "./testDb";
import type { Db } from "./types";
import { wasteRunsRepo } from "./wasteRunsRepo";

let db: Db;
const apply: ApplyStock = async (movements) => {
  for (const m of movements) await db.execute("UPDATE filaments SET stockG = stockG + ? WHERE id = ?", [m.delta, m.id]);
};
const stock = async () => (await filaments.list(db))[0].stockG;
const input = { kind: "failure" as const, at: "2026-10-09", productId: null, printerId: null, notes: "descolou", lines: [{ filamentId: 1, grams: 50 }] };

beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
  await filaments.insert(db, { material: "PLA", color: "Azul", brand: "X", pricePerKg: 100, spoolG: 1000, stockG: 1000, minG: 0, td: null });
});

describe("registros de amostra e erro (#189)", () => {
  test("registra com o custo pelo preço do filamento e dá baixa no estoque", async () => {
    await wasteRunsRepo.create(db, input, await filaments.list(db), apply);
    const [r] = await wasteRunsRepo.list(db);
    expect(r).toMatchObject({ kind: "failure", cost: 5, notes: "descolou", lines: [{ filamentId: 1, grams: 50 }] });
    expect(await stock()).toBe(950);
  });

  test("se a baixa falhar, o registro é desfeito", async () => {
    await expect(wasteRunsRepo.create(db, input, await filaments.list(db), async () => { throw new Error("sem estoque"); })).rejects.toThrow("sem estoque");
    expect(await wasteRunsRepo.list(db)).toEqual([]);
    expect(await stock()).toBe(1000);
  });

  test("excluir devolve os gramas ao estoque", async () => {
    await wasteRunsRepo.create(db, input, await filaments.list(db), apply);
    await wasteRunsRepo.remove(db, (await wasteRunsRepo.list(db))[0], apply);
    expect(await wasteRunsRepo.list(db)).toEqual([]);
    expect(await stock()).toBe(1000);
  });

  test("recusa registro sem filamento", async () => {
    await expect(wasteRunsRepo.create(db, { ...input, lines: [] }, [], apply)).rejects.toThrow();
  });

  test("entra no backup e volta na restauração; backup antigo sem a tabela não apaga os registros", async () => {
    await wasteRunsRepo.create(db, input, await filaments.list(db), apply);
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
    expect(backup.tables.waste_runs).toHaveLength(1);
    await db.execute("DELETE FROM waste_runs");
    await restoreBackup(db, parseBackup(JSON.stringify(backup)));
    expect(await wasteRunsRepo.list(db)).toMatchObject([{ cost: 5, lines: [{ grams: 50 }] }]);
    const old = { ...backup, schemaVersion: 23 };
    delete old.tables.waste_runs;
    await restoreBackup(db, parseBackup(JSON.stringify(old)));
    expect(await wasteRunsRepo.list(db)).toHaveLength(1);
  });
});
