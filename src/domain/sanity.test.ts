import { expect, test } from "vitest";
import { sanityWarnings } from "./sanity";

const ok = { filaments: [{ pricePerKg: 120, grams: 50 }], printHours: 2, watts: 95, failurePct: 5, channelFees: [{ name: "Shopee", feePct: 20 }], consumer: 40, unitCost: 8 };
const keys = (x: Partial<typeof ok>) => sanityWarnings({ ...ok, ...x }).map((w) => w.key);

test("valores normais não avisam", () => {
  expect(sanityWarnings(ok)).toEqual([]);
});

test("cada valor fora do normal gera um aviso com chave própria", () => {
  expect(keys({ filaments: [{ pricePerKg: 1.2, grams: 50 }] })).toEqual(["kg:1.2"]);
  expect(keys({ filaments: [{ pricePerKg: 1200, grams: 50 }] })).toEqual(["kg:1200"]);
  expect(keys({ filaments: [{ pricePerKg: 120, grams: 2000 }, { pricePerKg: 120, grams: 1500 }] })).toEqual(["g:3500"]);
  expect(keys({ printHours: 200 })).toEqual(["h:200"]);
  expect(keys({ watts: 1600 })).toEqual(["w:1600"]);
  expect(keys({ failurePct: 40 })).toEqual(["fail:40"]);
  expect(keys({ channelFees: [{ name: "Loja", feePct: 45 }] })).toEqual(["fee:Loja:45"]);
  expect(keys({ consumer: 7 })).toEqual(["below-cost"]);
});

test("texto explica e sugere o erro de digitação provável", () => {
  expect(sanityWarnings({ ...ok, filaments: [{ pricePerKg: 1.2, grams: 50 }] })[0].text).toMatch(/R\$\s1,20 por kg parece baixo demais/);
  expect(sanityWarnings({ ...ok, filaments: [{ pricePerKg: 120, grams: 3500 }] })[0].text).toMatch(/3\.500 g numa mesa/);
  expect(sanityWarnings({ ...ok, watts: 1600 })[0].text).toMatch(/potência da fonte/);
  expect(sanityWarnings({ ...ok, filaments: [{ pricePerKg: 0, grams: 0 }] })).toEqual([]); // linha vazia não conta
});
