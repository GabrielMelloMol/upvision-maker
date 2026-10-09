import { describe, expect, test } from "vitest";
import { failureShare, wasteCost, wasteTotals, WasteRunInput } from "./wasteRuns";

const filaments = [{ id: 1, pricePerKg: 100 }, { id: 2, pricePerKg: 150 }];

describe("amostras e erros de impressão (#189)", () => {
  test("o custo é gramas × preço por kg de cada filamento", () => {
    expect(wasteCost([{ filamentId: 1, grams: 50 }, { filamentId: 2, grams: 20 }], filaments)).toBe(8); // 5 + 3
    expect(wasteCost([{ filamentId: 9, grams: 50 }], filaments)).toBe(0); // filamento removido
  });

  test("totais do período separam erros de amostras e deixam de fora as outras datas", () => {
    const runs = [
      { at: "2026-10-02", cost: 4, kind: "failure" as const },
      { at: "2026-10-09", cost: 1.5, kind: "sample" as const },
      { at: "2026-09-30", cost: 100, kind: "failure" as const },
    ];
    expect(wasteTotals(runs, "2026-10-01", "2026-10-31")).toEqual({ sample: 1.5, failure: 4, total: 5.5 });
  });

  test("erros como parte do custo de produção: 20 de 100 é 20%; sem nada, não há taxa", () => {
    expect(failureShare(20, 80)).toBe(20);
    expect(failureShare(0, 0)).toBeNull();
    expect(failureShare(5, 0)).toBe(100);
  });

  test("valida: precisa de filamento com gramas e data certa", () => {
    const ok = { kind: "failure", at: "2026-10-09", productId: null, printerId: null, notes: "", lines: [{ filamentId: 1, grams: 10 }] };
    expect(WasteRunInput.safeParse(ok).success).toBe(true);
    expect(WasteRunInput.safeParse({ ...ok, lines: [] }).success).toBe(false);
    expect(WasteRunInput.safeParse({ ...ok, lines: [{ filamentId: 1, grams: 0 }] }).success).toBe(false);
    expect(WasteRunInput.safeParse({ ...ok, at: "09/10/2026" }).success).toBe(false);
    expect(WasteRunInput.safeParse({ ...ok, kind: "venda" }).success).toBe(false);
  });
});
