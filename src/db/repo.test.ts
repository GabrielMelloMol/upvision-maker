import { beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { migrate } from "./migrations";
import { filaments, loadSettings, materials, printers, saveSettings } from "./repo";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

const pla = { material: "PLA", color: "Preto", brand: "X", pricePerKg: 80, spoolG: 1000, stockG: 500, minG: 200 };

describe("repositórios", () => {
  test("cria, lista, edita e exclui impressora", async () => {
    await printers.insert(db, { name: "A1", watts: 150 });
    const [p] = await printers.list(db);
    expect(p).toMatchObject({ name: "A1", watts: 150 });
    await printers.update(db, p.id, { name: "A1 mini", watts: 80 });
    expect((await printers.list(db))[0]).toMatchObject({ name: "A1 mini", watts: 80 });
    await printers.remove(db, p.id);
    expect(await printers.list(db)).toEqual([]);
  });

  test("valida antes de gravar", async () => {
    await expect(printers.insert(db, { name: "", watts: 10 })).rejects.toThrow();
    await expect(filaments.insert(db, { ...pla, pricePerKg: -1 })).rejects.toThrow();
    expect(await filaments.list(db)).toEqual([]);
  });

  test("reposição de filamento soma estoque e recalcula custo médio", async () => {
    await filaments.insert(db, pla);
    const [f] = await filaments.list(db);
    await filaments.restock(db, f.id, 1000, 110);
    expect((await filaments.list(db))[0]).toMatchObject({ stockG: 1500, pricePerKg: 100 });
  });

  test("reposição de material extra", async () => {
    await materials.insert(db, { name: "Ímã", unit: "un", unitPrice: 0.5, stock: 0, min: 10 });
    const [m] = await materials.list(db);
    await materials.restock(db, m.id, 100, 0.4);
    expect((await materials.list(db))[0]).toMatchObject({ stock: 100, unitPrice: 0.4 });
  });

  test("preferências: padrão quando vazio, salva e relê", async () => {
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
    await saveSettings(db, { ...DEFAULT_SETTINGS, kwhPrice: 1.1 });
    expect((await loadSettings(db)).kwhPrice).toBe(1.1);
  });
});
