import { expect, test } from "vitest";
import { compareScenarios, type ScenarioSummary } from "./scenario";

const a: ScenarioSummary = { name: "PLA", unitCost: 4, price: 20, profit: 16, profitPerHour: 8, grams: 30, hours: 2 };
const b: ScenarioSummary = { name: "PETG", unitCost: 5.5, price: 27.5, profit: 22, profitPerHour: null, grams: 30, hours: 2.5 };

test("diferença é B − A; lado sem lucro/h deixa a diferença vazia (#44)", () => {
  const lines = Object.fromEntries(compareScenarios(a, b).map((l) => [l.label, l]));
  expect(lines["Custo por peça"].diff).toBe(1.5);
  expect(lines["Lucro por peça"].diff).toBe(6);
  expect(lines["Tempo de impressão"].diff).toBe(0.5);
  expect(lines["Filamento"].diff).toBe(0);
  expect(lines["Lucro por hora"].diff).toBeNull();
  expect(lines["Custo por peça"].higherIsBetter).toBe(false);
});
