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

  test("M11: repor um estoque negativo desconta o déficit, e o estorno depois não infla o estoque", async () => {
    const id = await filaments.insert(db, { ...pla, stockG: 0 });
    await filaments.consume(db, id, 200); // um pedido consome 200 g e o estoque fica em −200
    await filaments.restock(db, id, 1000, 100);
    expect((await filaments.list(db))[0].stockG).toBe(800); // antes: 1000, o déficit sumia
    await db.execute("UPDATE filaments SET stockG = stockG + 200 WHERE id = ?", [id]); // cancelar o pedido estorna +200
    expect((await filaments.list(db))[0].stockG).toBe(1000); // antes: 1200
    // o custo médio continua ignorando o saldo negativo (só o que existe pesa na média)
    expect((await filaments.list(db))[0].pricePerKg).toBe(100);
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

describe("preferências com um campo inválido (A3)", () => {
  test("só o campo ruim volta ao padrão; o resto (canais, kWh, histórico) é aproveitado e salvar não apaga", async () => {
    const good = { ...DEFAULT_SETTINGS, kwhPrice: 0.9, kwhHistory: [{ month: "2026-09", total: 180, kwh: 200, flag: "verde" as const, price: 0.9 }] };
    // failurePct passou a aceitar até 90%: um valor gravado antes (120) agora é inválido
    await db.execute("INSERT INTO settings (id, data) VALUES (1, ?)", [JSON.stringify({ ...good, failurePct: 120 })]);

    const loaded = await loadSettings(db);

    expect(loaded.failurePct).toBe(DEFAULT_SETTINGS.failurePct);
    expect(loaded.kwhPrice).toBe(0.9);
    expect(loaded.kwhHistory).toEqual(good.kwhHistory);
    await saveSettings(db, { ...loaded, bedPrinterId: 3 }); // como o cartão de Ajustes faz
    const saved = await loadSettings(db);
    expect(saved.kwhPrice).toBe(0.9);
    expect(saved.bedPrinterId).toBe(3);
  });

  test("JSON ilegível no banco também não derruba: volta ao padrão", async () => {
    await db.execute("INSERT INTO settings (id, data) VALUES (1, ?)", ["{não é json"]);
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("B7: baixa manual e reposição não perdem uma baixa simultânea", () => {
  /** Db que, logo depois da 1ª leitura do estoque, deixa "um pedido" mexer no estoque (como o Rust faz no apply_stock). */
  const racing = (concurrent: string): Db => {
    let fired = false;
    return {
      ...db,
      select: async <T>(sql: string, p?: unknown[]) => {
        const rows = await db.select<T>(sql, p);
        if (!fired && /FROM filaments/.test(sql)) {
          fired = true;
          await db.execute(concurrent);
        }
        return rows;
      },
    };
  };

  test("baixa manual: um pedido grava 900 g de baixa entre a leitura e a gravação; a baixa de 50 g vale em cima disso", async () => {
    const id = await filaments.insert(db, { ...pla, stockG: 1000 });
    const next = await filaments.consume(racing(`UPDATE filaments SET stockG = 100 WHERE id = ${id}`), id, 50);
    expect(next).toBe(50); // antes: 950, a baixa do pedido sumia
    expect((await filaments.list(db))[0].stockG).toBe(50);
  });

  test("'Rolo acabou' e reposição também refazem a conta em cima do estoque que mudou", async () => {
    const id = await filaments.insert(db, { ...pla, stockG: 2000 });
    expect(await filaments.finishSpool(racing(`UPDATE filaments SET stockG = 1500 WHERE id = ${id}`), id)).toBe(1000); // 1500: o aberto tinha 500
    const id2 = await filaments.insert(db, { ...pla, stockG: 1000 });
    await filaments.restock(racing(`UPDATE filaments SET stockG = 400 WHERE id = ${id2}`), id2, 600, 80);
    expect((await filaments.list(db)).find((f) => f.id === id2)!.stockG).toBe(1000); // 400 + 600
  });
});

describe("bico da impressora", () => {
  test("sem o campo, 0,4; com ele, grava e devolve; edita; fora de 0,1 a 2 mm é recusado", async () => {
    await printers.insert(db, { name: "A1", watts: 95 });
    await printers.insert(db, { name: "Fina", watts: 80, nozzle: 0.2 });
    const [a, b] = await printers.list(db);
    expect(a.nozzle).toBe(0.4);
    expect(b.nozzle).toBe(0.2);
    await printers.update(db, a.id, { name: "A1", watts: 95, nozzle: 0.6 });
    expect((await printers.list(db))[0].nozzle).toBe(0.6);
    await expect(printers.insert(db, { name: "X", watts: 10, nozzle: 0 })).rejects.toThrow(/bico/i);
    await expect(printers.insert(db, { name: "X", watts: 10, nozzle: 3 })).rejects.toThrow(/bico/i);
    expect(await printers.list(db)).toHaveLength(2);
  });
});
