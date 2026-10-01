import { describe, expect, test } from "vitest";
import { lastWorked, measuredFailurePct, PrintLogInput, printStats, settingsSummary, type PrintLog } from "./printLogs";

const log = (id: number, result: "ok" | "falhou", at = `2026-09-${String(10 + id).padStart(2, "0")}`): PrintLog => ({
  ...PrintLogInput.parse({ productId: 1, at, result }),
  id,
});

describe("ficha de impressão (#163)", () => {
  test("taxa de sucesso e taxa de falha medida só a partir de 3 impressões", () => {
    expect(printStats([])).toEqual({ total: 0, ok: 0, successPct: null });
    expect(printStats([log(1, "ok"), log(2, "falhou"), log(3, "ok"), log(4, "ok")])).toEqual({ total: 4, ok: 3, successPct: 75 });
    expect(measuredFailurePct([log(1, "falhou"), log(2, "ok")])).toBeNull(); // poucas impressões
    expect(measuredFailurePct([log(1, "ok"), log(2, "falhou"), log(3, "ok"), log(4, "ok")])).toBe(25);
    expect(measuredFailurePct([log(1, "falhou"), log(2, "falhou"), log(3, "falhou")])).toBe(90); // teto da calculadora
  });

  test("o que funcionou: a impressão mais recente que deu certo", () => {
    expect(lastWorked([log(1, "ok", "2026-09-01"), log(2, "ok", "2026-09-20"), log(3, "falhou", "2026-09-25")])?.id).toBe(2);
    expect(lastWorked([log(1, "falhou")])).toBeNull();
  });

  test("resumo dos ajustes; padrões para o mínimo", () => {
    const l = PrintLogInput.parse({ productId: 1, at: "2026-09-30", result: "ok", layerHeight: 0.2, infillPct: 15, supports: "árvore", brim: true, orientation: "deitado" });
    expect(settingsSummary(l)).toBe("0,2 mm · 15% · suporte em árvore · brim · deitado");
    expect(settingsSummary(PrintLogInput.parse({ productId: 1, at: "2026-09-30", result: "ok" }))).toBe("");
    expect(() => PrintLogInput.parse({ productId: 1, at: "30/09", result: "ok" })).toThrow();
  });
});
