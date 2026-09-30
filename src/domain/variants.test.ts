import { expect, test } from "vitest";
import { spreadWarning, swapComposition, Variant, variantErrors } from "./variants";

const v = (name: string, sku = "") => Variant.parse({ name, sku });

test("troca só o filamento da cor e mantém o resto da composição", () => {
  const c = { filaments: [{ filamentId: 1, grams: 20 }, { filamentId: 2, grams: 5 }], materials: [{ materialId: 1, qty: 1 }], items: [] };
  const out = swapComposition(c, [{ from: 1, to: 9 }]);
  expect(out.filaments).toEqual([{ filamentId: 9, grams: 20 }, { filamentId: 2, grams: 5 }]);
  expect(out.materials).toBe(c.materials);
  expect(swapComposition(c, [])).toBe(c);
});

test("nomes e SKUs repetidos (sem diferenciar maiúsculas) impedem salvar; SKU vazio pode repetir", () => {
  expect(variantErrors([v("Azul", "A"), v("Rosa", "B")])).toEqual([]);
  expect(variantErrors([v("Azul"), v("Rosa")])).toEqual([]);
  expect(variantErrors([v("Azul", "X"), v("azul", "x")])).toEqual(["Variação repetida: azul.", "SKU repetido: x."]);
});

test("aviso quando o maior preço passa de 4× o menor", () => {
  expect(spreadWarning([10, 40])).toBeNull();
  expect(spreadWarning([10, 40.01])).toMatch(/Shopee não aceita/);
  expect(spreadWarning([0, 100])).toBeNull();
});
