import { describe, expect, test } from "vitest";
import { cellsOf, formatStrips, layoutProblem, MIN_CELL, parseStrips, smallestSide, stripsOf, type LayoutParams } from "./layout";

const base: LayoutParams = { layoutMode: "equal", cols: 5, rows: 4, strips: "" };
const W = 173.2, D = 113.2, DIV = 2;

describe("divisão da caixa organizadora (#204)", () => {
  test("iguais: 5 × 4 nichos", () => {
    const s = stripsOf(base);
    expect(s).toHaveLength(4);
    expect(s.every((x) => x.n === 5)).toBe(true);
  });
  test("largos + pequenos: a faixa da frente tem metade dos nichos (arredondada) e as outras a grade normal", () => {
    expect(stripsOf({ ...base, layoutMode: "mixed" }).map((s) => s.n)).toEqual([3, 5, 5, 5]);
  });
  test("canal: faixa inteira na frente com proporção 1,5 e as outras linhas atrás", () => {
    const s = stripsOf({ ...base, layoutMode: "channel" });
    expect(s[0]).toEqual({ n: 1, ratio: 1.5 });
    expect(s).toHaveLength(4);
  });
  test("faixa por faixa: lê o texto, limita a 8 faixas, 10 nichos e proporção 0,5–4", () => {
    expect(parseStrips("6:1, 3:1.5")).toEqual([{ n: 6, ratio: 1 }, { n: 3, ratio: 1.5 }]);
    expect(parseStrips("99:9, 0:0.1")).toEqual([{ n: 10, ratio: 4 }, { n: 1, ratio: 0.5 }]);
    expect(parseStrips(Array(12).fill("2:1").join(","))).toHaveLength(8);
    expect(parseStrips("")).toEqual([]);
    expect(formatStrips(parseStrips("6, 3:1.5"))).toBe("6:1, 3:1.5");
    expect(stripsOf({ ...base, layoutMode: "custom", strips: "" })).toHaveLength(1); // vazio nunca deixa a caixa sem nicho
  });
  for (const layoutMode of ["equal", "mixed", "channel", "custom"] as const)
    test(`${layoutMode}: a soma dos nichos mais as paredes fecha com o vão (tolerância 0,01 mm)`, () => {
      const rows = cellsOf(stripsOf({ ...base, layoutMode, strips: "6:1, 3:1.5, 2:0.5" }), W, D, DIV);
      for (const row of rows) {
        const sum = row.reduce((a, c) => a + (c.x1 - c.x0), 0) + (row.length - 1) * DIV;
        expect(Math.abs(sum - W)).toBeLessThan(0.01);
      }
      const depth = rows.reduce((a, r) => a + (r[0].y1 - r[0].y0), 0) + (rows.length - 1) * DIV;
      expect(Math.abs(depth - D)).toBeLessThan(0.01);
      expect(rows[0][0].y0).toBeCloseTo(-D / 2, 5); // a primeira faixa é a da frente
    });
  test("nicho menor que 9 mm é recusado com a frase de ajuda; com folga passa", () => {
    expect(layoutProblem({ ...base, cols: 10, rows: 8 }, 60, 40, DIV)).toMatch(/pequeno demais para pegar a peça/);
    expect(layoutProblem(base, W, D, DIV)).toBeNull();
    expect(smallestSide(cellsOf(stripsOf(base), W, D, DIV))).toBeGreaterThan(MIN_CELL);
  });
});
