import { beforeEach, describe, expect, test } from "vitest";
import { measuredByProduct } from "../pages/products/data";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import { migrate } from "./migrations";
import { printLogsRepo } from "./printLogsRepo";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

describe("ficha de impressão no banco (#163)", () => {
  test("grava, lista por produto (mais recente primeiro) e o brim volta como sim/não", async () => {
    await printLogsRepo.insert(db, { productId: 1, at: "2026-09-01", result: "ok", brim: true, layerHeight: 0.2, notes: "com brim" });
    await printLogsRepo.insert(db, { productId: 1, at: "2026-09-20", result: "falhou", reason: "soltou da mesa" });
    await printLogsRepo.insert(db, { productId: 2, at: "2026-09-10", result: "ok" });
    const mine = await printLogsRepo.forProduct(db, 1);
    expect(mine.map((l) => [l.at, l.result, l.brim])).toEqual([
      ["2026-09-20", "falhou", false],
      ["2026-09-01", "ok", true],
    ]);
    await expect(printLogsRepo.insert(db, { productId: 1, at: "ontem", result: "ok" })).rejects.toThrow();
  });

  test("taxa medida por produto só com 3+ impressões; a ficha entra no backup", async () => {
    for (const r of ["ok", "ok", "falhou", "ok"] as const) await printLogsRepo.insert(db, { productId: 7, at: "2026-09-01", result: r });
    await printLogsRepo.insert(db, { productId: 8, at: "2026-09-01", result: "falhou" });
    expect(measuredByProduct(await printLogsRepo.list(db))).toEqual({ 7: { pct: 25, prints: 4 } });

    const backup = parseBackup(JSON.stringify(await exportBackup(db)));
    expect(backup.tables.print_logs).toHaveLength(5);
    const other = memoryDb();
    await migrate(other);
    await restoreBackup(other, backup);
    expect(await printLogsRepo.forProduct(other, 7)).toHaveLength(4);
  });
});
