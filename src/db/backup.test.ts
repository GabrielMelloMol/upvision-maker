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

  test("rejeita arquivo que não é backup do app", () => {
    expect(() => parseBackup("{}")).toThrow(/não é um backup/i);
    expect(() => parseBackup("lixo")).toThrow(/não é um backup/i);
  });

  test("rejeita backup de versão mais nova do app", async () => {
    const b = await exportBackup(await seeded());
    expect(() => parseBackup(JSON.stringify({ ...b, schemaVersion: 999 }))).toThrow(/versão mais nova/i);
  });
});
