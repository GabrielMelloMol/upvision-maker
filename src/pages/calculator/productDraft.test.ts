import { describe, expect, test } from "vitest";
import { filaments, materials, printers } from "../../db/repo";
import { migrate } from "../../db/migrations";
import { memoryDb } from "../../db/testDb";
import { calculate } from "../../domain/calc";
import { DEFAULT_SETTINGS } from "../../domain/settings";
import { draftComposition, equivalentWatts, hasTyped, kwhPrinterId, registerTyped, typedItems, withPurge } from "./productDraft";

const num = (s: string) => Number(s.replace(",", ".")) || 0;
const line = (ref: string, price: string, qty: string) => ({ ref, price, qty });

describe("Salvar como produto com itens digitados (auditoria UX C1)", () => {
  test("acha só as linhas digitadas que entram no custo e a impressora sem cadastro", () => {
    const t = typedItems([line("", "120", "12"), line("3", "", "5"), line("", "", "4")], [line("", "0,90", "1")], "", "95", num, num);
    expect(t).toEqual({ filaments: [{ pricePerKg: 120, grams: 12 }], materials: [{ unitPrice: 0.9, qty: 1 }], watts: 95 });
    expect(hasTyped(t)).toBe(true);
    // impressora escolhida do cadastro: a potência digitada não vira impressora nova
    expect(typedItems([], [], "2", "95", num, num)).toEqual({ filaments: [], materials: [], watts: null });
    expect(hasTyped(typedItems([line("1", "", "8")], [], "", "", num, num))).toBe(false);
  });

  test("cadastra sem estoque e sem aviso de mínimo, e a composição guarda o custo", async () => {
    const db = memoryDb();
    await migrate(db);
    const t = typedItems([line("", "120", "12")], [line("", "0,90", "2")], "", "95", num, num);
    const ids = await registerTyped(db, t, "Chaveiro coração");
    const [fil] = await filaments.list(db);
    expect(fil).toMatchObject({ pricePerKg: 120, stockG: 0, minG: 0 });
    expect(fil.brand).toContain("Chaveiro coração");
    const [mat] = await materials.list(db);
    expect(mat).toMatchObject({ unitPrice: 0.9, stock: 0, min: 0 });
    const [pr] = await printers.list(db);
    expect(pr).toMatchObject({ watts: 95 });
    expect(ids.printerId).toBe(pr.id);

    const comp = draftComposition([line("", "", "5"), line("", "120", "12")], [line("", "0,90", "2")], num, num, ids); // a linha sem preço não leva o id
    expect(comp).toEqual({ filaments: [{ filamentId: fil.id, grams: 12 }], materials: [{ materialId: mat.id, qty: 2 }], items: [] });
  });

  test("sem cadastrar: só as linhas com item cadastrado entram", () => {
    const comp = draftComposition([line("4", "", "8"), line("", "120", "12")], [], num, num, null);
    expect(comp.filaments).toEqual([{ filamentId: 4, grams: 8 }]);
  });
});

describe("Salvar como produto leva a purga e o kWh (#242, C3)", () => {
  const comp = (grams: number[]) => ({ filaments: grams.map((g, i) => ({ filamentId: i + 1, grams: g })), materials: [], items: [] });

  test("a purga digitada vira gramas, repartidas na proporção das linhas, e o custo é o da calculadora", () => {
    const out = withPurge(comp([30, 10]), 8); // 40 g + 8 g de purga
    expect(out.filaments.map((f) => f.grams)).toEqual([36, 12]);
    expect(out.filaments.reduce((t, f) => t + f.grams, 0)).toBeCloseTo(48, 9);
    // custo igual ao da calculadora (purga ao preço médio dos filamentos usados)
    const prices = [100, 160];
    const calc = calculate({ filaments: [{ pricePerKg: 100, grams: 30 }, { pricePerKg: 160, grams: 10 }], purgeGrams: 8, extras: [], printerWatts: 0, printHours: 0, laborHours: 0, quantity: 1, freight: 0, marketplaceMarginPct: 30, failurePct: 0 }, DEFAULT_SETTINGS);
    const product = out.filaments.reduce((t, f, i) => t + (prices[i] / 1000) * f.grams, 0);
    expect(product).toBeCloseTo(calc.filament + calc.purge, 2);
  });

  test("sem purga ou sem filamento a composição fica como está (a mesma referência)", () => {
    const c = comp([30]);
    expect(withPurge(c, 0)).toBe(c);
    expect(withPurge(comp([]), 8).filaments).toEqual([]);
  });

  test("kWh medido: a potência equivalente dá o mesmo consumo em W × horas; sem tempo não dá para converter", () => {
    expect(equivalentWatts(0.285, 3)).toBe(95); // 0,285 kWh em 3 h = 95 W
    expect(equivalentWatts(0.5, 2)).toBe(250);
    expect(equivalentWatts(0.5, 0)).toBeNull();
    expect(equivalentWatts(0, 2)).toBeNull();
  });

  test("grava uma cópia da impressora com a potência equivalente (mantém a depreciação) e reaproveita nas próximas vezes", async () => {
    const db = memoryDb();
    await migrate(db);
    const baseId = await printers.insert(db, { name: "A1", watts: 95, price: 3000, lifeHours: 5000, upkeepPerHour: 0.1 });
    const [base] = await printers.list(db);
    const id = await kwhPrinterId(db, base, 250);
    expect(id).not.toBe(baseId);
    const copy = (await printers.list(db)).find((p) => p.id === id)!;
    expect(copy).toMatchObject({ name: "A1 (kWh medido)", watts: 250, price: 3000, lifeHours: 5000, upkeepPerHour: 0.1 });
    expect(await kwhPrinterId(db, base, 250)).toBe(id); // mesma potência: reaproveita
    expect((await printers.list(db)).length).toBe(2);
    expect(await kwhPrinterId(db, base, 260)).not.toBe(id); // outra potência: outra cópia
    // sem impressora escolhida
    const lone = await kwhPrinterId(db, undefined, 120);
    expect((await printers.list(db)).find((p) => p.id === lone)).toMatchObject({ name: "Impressora da calculadora (kWh medido)", watts: 120 });
  });
});
