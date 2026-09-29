import { beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { migrate } from "./migrations";
import { deleteSecret, filaments, getSecret, loadSettings, materials, printers, saveSettings, setSecret } from "./repo";
import { exportBackup } from "./backup";
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
    expect(p).toMatchObject({ price: 0, lifeHours: 5000, upkeepPerHour: 0 }); // cadastro antigo, sem depreciação
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

  test("baixa de gramas (#12): tira do estoque, pode ficar negativo; valor inválido é recusado", async () => {
    const id = await filaments.insert(db, pla);
    expect(await filaments.consume(db, id, 120.5)).toBe(379.5);
    expect(await filaments.consume(db, id, 400)).toBe(-20.5);
    await expect(filaments.consume(db, id, 0)).rejects.toThrow("maior que zero");
    await expect(filaments.consume(db, id, Number.NaN)).rejects.toThrow();
    await expect(filaments.consume(db, 999, 10)).rejects.toThrow("não encontrado");
  });

  test("rolo acabou (#12): some o que restava do rolo aberto; os fechados continuam", async () => {
    const id = await filaments.insert(db, { ...pla, stockG: 2300 }); // 2 fechados + 300 g no aberto
    expect(await filaments.finishSpool(db, id)).toBe(2000);
    expect(await filaments.finishSpool(db, id)).toBe(1000); // estoque redondo: o aberto era um rolo inteiro
    const one = await filaments.insert(db, { ...pla, stockG: 150 });
    expect(await filaments.finishSpool(db, one)).toBe(0);
    const neg = await filaments.insert(db, { ...pla, stockG: -40 });
    expect(await filaments.finishSpool(db, neg)).toBe(0);
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

test("segredos (chave da API) ficam no banco local e NÃO entram no backup", async () => {
  expect(await getSecret(db, "anthropic_api_key")).toBeNull();
  await setSecret(db, "anthropic_api_key", "sk-ant-teste");
  expect(await getSecret(db, "anthropic_api_key")).toBe("sk-ant-teste");
  expect(JSON.stringify(await exportBackup(db))).not.toContain("sk-ant-teste");
  await deleteSecret(db, "anthropic_api_key");
  expect(await getSecret(db, "anthropic_api_key")).toBeNull();
});
