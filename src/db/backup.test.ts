import { describe, expect, test } from "vitest";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import { migrate } from "./migrations";
import { memoryDb } from "./testDb";

async function seeded() {
  const db = memoryDb();
  await migrate(db);
  await db.execute("INSERT INTO settings (id, data) VALUES (1, ?)", ['{"kwhPrice":1}']);
  return db;
}

describe("backup", () => {
  test("exporta, restaura e devolve exatamente os mesmos dados", async () => {
    const db = await seeded();
    const json = JSON.stringify(await exportBackup(db));
    await db.execute("UPDATE settings SET data = ?", ['{"kwhPrice":9}']);

    await restoreBackup(db, parseBackup(json));

    expect(await db.select("SELECT * FROM settings")).toEqual([{ id: 1, data: '{"kwhPrice":1}' }]);
  });

  test("backup antigo (impressora sem preço/vida útil) restaura com os padrões", async () => {
    const db = await seeded();
    const b = await exportBackup(db);
    const old = { ...b, schemaVersion: 9, tables: { ...b.tables, printers: [{ id: 1, name: "A1", watts: 95 }] } };
    await restoreBackup(db, parseBackup(JSON.stringify(old)));
    expect(await db.select("SELECT * FROM printers")).toEqual([{ id: 1, name: "A1", watts: 95, price: 0, lifeHours: 5000, upkeepPerHour: 0 }]);
  });

  test("backup antigo (produto sem taxa de falha) restaura com null (#35)", async () => {
    const db = await seeded();
    const b = await exportBackup(db);
    const product = { id: 1, name: "Chaveiro", kind: "simple", composition: '{"filaments":[],"materials":[],"items":[]}', printerId: null, printMinutes: 0, laborMinutes: 0, piecesPerPlate: 1, freight: 0, manualPrice: null, consignmentPrice: null, stock: 0, minStock: 0, sku: "", notes: "" };
    await restoreBackup(db, parseBackup(JSON.stringify({ ...b, schemaVersion: 10, tables: { ...b.tables, products: [product] } })));
    expect(await db.select("SELECT name, failurePct FROM products")).toEqual([{ name: "Chaveiro", failurePct: null }]);
  });

  test("backup antigo sem número de orçamento: a restauração numera por ano (#36)", async () => {
    const db = await seeded();
    const b = await exportBackup(db);
    const q = (id: number, createdAt: string) => ({ id, data: "{}", createdAt, convertedOrderId: null });
    const old = { ...b, schemaVersion: 11, tables: { ...b.tables, quotes: [q(1, "2025-12-01 10:00:00"), q(2, "2026-01-05 10:00:00"), q(3, "2026-02-05 10:00:00")], quote_numbers: undefined } };
    await restoreBackup(db, parseBackup(JSON.stringify(old)));
    expect(await db.select("SELECT id, year, seq FROM quotes ORDER BY id")).toEqual([
      { id: 1, year: 2025, seq: 1 },
      { id: 2, year: 2026, seq: 1 },
      { id: 3, year: 2026, seq: 2 },
    ]);
    expect(await db.select("SELECT id, seq FROM quote_numbers ORDER BY id")).toEqual([{ id: 2025, seq: 1 }, { id: 2026, seq: 2 }]);
  });

  test("rejeita arquivo que não é backup do app", () => {
    expect(() => parseBackup("{}")).toThrow(/não é um backup/i);
    expect(() => parseBackup("lixo")).toThrow(/não é um backup/i);
  });

  test("rejeita backup de versão mais nova do app", async () => {
    const b = await exportBackup(await seeded());
    expect(() => parseBackup(JSON.stringify({ ...b, schemaVersion: 999 }))).toThrow(/versão mais nova/i);
  });
});
