import { describe, expect, test } from "vitest";
import { filaments, materials, printers } from "../../db/repo";
import { migrate } from "../../db/migrations";
import { memoryDb } from "../../db/testDb";
import { draftComposition, hasTyped, registerTyped, typedItems } from "./productDraft";

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
