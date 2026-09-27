import { describe, expect, test } from "vitest";
import { weightedAverage } from "./stock";

describe("weightedAverage (reposição com custo médio ponderado)", () => {
  test("pondera o preço antigo pelo saldo e o novo pela quantidade comprada", () => {
    // 500 g a R$ 80/kg + 1000 g a R$ 110/kg = R$ 100/kg
    expect(weightedAverage(500, 80, 1000, 110)).toBe(100);
  });

  test("sem saldo (ou saldo negativo) o custo passa a ser o da compra", () => {
    expect(weightedAverage(0, 80, 1000, 110)).toBe(110);
    expect(weightedAverage(-30, 80, 1000, 110)).toBe(110);
  });

  test("compra de quantidade zero mantém o preço", () => {
    expect(weightedAverage(500, 80, 0, 999)).toBe(80);
  });
});
