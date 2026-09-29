import { expect, test } from "vitest";
import type { CalcResult } from "./calc";
import { priceSplit } from "./priceSplit";

// mesa com 2 peças: custo da mesa 20 (filamento 8, energia 2, mão de obra 10) → 10 por peça
const r = { filament: 8, extras: 0, energy: 2, machine: 0, failure: 0, fixed: 0, maintenance: 0, labor: 10, batchCost: 20, unitCost: 10 } as unknown as CalcResult;

test("partes somam o preço da peça, por peça (não da mesa)", () => {
  const { parts, loss } = priceSplit(r, { price: 30, fees: 6, profit: 12 }, 2);
  expect(parts.map((p) => [p.key, p.value])).toEqual([
    ["production", 5],
    ["labor", 5],
    ["fees", 6],
    ["freight", 2],
    ["profit", 12],
  ]);
  expect(parts.reduce((t, p) => t + p.value, 0)).toBe(30);
  expect(parts.find((p) => p.key === "profit")!.pct).toBe(40);
  expect(parts[0].detail).toBe("Filamento R$ 4,00 · Energia R$ 1,00");
  expect(loss).toBe(0);
});

test("prejuízo: sem fatia de lucro, e diz quanto falta; partes zeradas somem", () => {
  const { parts, loss } = priceSplit(r, { price: 12, fees: 3, profit: -1 }, 0);
  expect(parts.map((p) => p.key)).toEqual(["production", "labor", "fees"]);
  expect(loss).toBe(1);
});
