import { expect, test } from "vitest";
import { calculate } from "./calc";
import { priceDifferences } from "./priceDiff";
import { DEFAULT_SETTINGS } from "./settings";

const s = { ...DEFAULT_SETTINGS, multConsumer: 5, kwhPrice: 1, laborHourCost: 30, failurePct: 10, maintenancePct: 0, multiplyLabor: false };
// mesa de 2 peças: 100 g a R$ 100/kg (R$ 10), 2 h a 100 W (R$ 0,20), 1 h de mão de obra (R$ 30)
const r = calculate({ filaments: [{ pricePerKg: 100, grams: 100 }], extras: [], printHours: 2, printerWatts: 100, laborHours: 1, quantity: 2, failurePct: 10, freight: 0, marketplaceMarginPct: 0 }, s);
const d = Object.fromEntries(priceDifferences(r, s, { failurePct: 10, watts: 100 }).map((x) => [x.id, x]));

test("falha dividida sai maior que somada (por peça)", () => {
  // perde-se 10,20 na mesa: ÷0,9 − 10,20 = 1,13 → 0,57 por peça; somar 10% = 1,02 → 0,51
  expect(d.failure.ours).toBeCloseTo(0.57, 2);
  expect(d.failure.theirs).toBeCloseTo(0.51, 2);
});

test("potência da fonte multiplica a energia por 3,5", () => {
  expect(d.power.ours).toBeCloseTo(0.1, 2);
  expect(d.power.theirs).toBeCloseTo(0.35, 2);
});

test("×5 = markup 400 % / margem 80 %: tratar 80 % como acréscimo dá ×1,8", () => {
  expect(d.markup.theirs / d.markup.ours).toBeCloseTo(1.8 / 5, 2);
  expect(d.markup.text).toContain("markup de 400 %");
});

test("mão de obra entra uma vez; multiplicada pesaria ×5", () => {
  expect(d.labor.ours).toBe(15);
  expect(d.labor.theirs).toBe(75);
});
