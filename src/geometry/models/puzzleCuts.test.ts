import { describe, expect, test } from "vitest";
import { KNOBS, knobDepth, puzzleGrid, type CutOptions } from "./puzzleCuts";

const area = (poly: [number, number][]) => poly.reduce((s, [x, y], i) => s + x * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y, 0) / 2;
const O: CutOptions = { cols: 4, rows: 3, cell: 30, knob: "classic", size: 0.22, seed: 7, random: true };

describe("cortes do quebra-cabeça (#159)", () => {
  test.each(KNOBS)("%s: toda peça é anti-horária e a soma das áreas é a do retângulo (orelha de uma = buraco da vizinha)", (knob) => {
    const g = puzzleGrid({ ...O, knob });
    const polys = g.flat();
    expect(polys).toHaveLength(12);
    for (const p of polys) expect(area(p)).toBeGreaterThan(0);
    expect(polys.reduce((s, p) => s + area(p), 0)).toBeCloseTo(4 * 30 * 3 * 30, 6);
  });

  test("arestas compartilhadas são idênticas (mesmos pontos, ao contrário) e as da borda são retas", () => {
    const g = puzzleGrid(O);
    const key = ([x, y]: [number, number]) => `${x.toFixed(6)},${y.toFixed(6)}`;
    const a = new Set(g[0][0].map(key)), b = new Set(g[0][1].map(key));
    const shared = [...a].filter((k) => b.has(k));
    expect(shared.length).toBeGreaterThan(10); // a orelha inteira da aresta do meio
    // borda: nenhum ponto passa do retângulo
    for (const p of g.flat()) for (const [x, y] of p) expect(Math.abs(x) <= 60 + 1e-9 && Math.abs(y) <= 45 + 1e-9).toBe(true);
  });

  test("mesma semente refaz igual; outra semente muda; sem 'cada peça diferente' fica alternado e sem variação", () => {
    expect(puzzleGrid(O)).toEqual(puzzleGrid(O));
    expect(puzzleGrid({ ...O, seed: 8 })).not.toEqual(puzzleGrid(O));
    const fixed = puzzleGrid({ ...O, random: false });
    expect(puzzleGrid({ ...O, random: false, seed: 99 })).toEqual(fixed);
    // as 4 peças do meio de uma grade fixa têm o mesmo formato a menos de giro/reflexo: mesma área de 2 em 2
    const areas = fixed.flat().map((p) => area(p).toFixed(3));
    expect(new Set(areas).size).toBeLessThan(areas.length);
  });

  test("profundidade da orelha: nenhum ponto passa da aresta mais que knobDepth", () => {
    for (const knob of KNOBS) {
      const d = knobDepth({ ...O, knob });
      // 1 coluna × 2 linhas: a única aresta interna é y = 0; fora da borda de cima/baixo, nenhum ponto passa de d
      for (const p of puzzleGrid({ ...O, knob, cols: 1, rows: 2 }).flat()) for (const [, y] of p) if (Math.abs(y) < 30 - 1e-6) expect(Math.abs(y)).toBeLessThanOrEqual(d + 1e-9);
      if (knob === "straight") expect(d).toBe(0);
      else expect(d).toBeGreaterThan(0);
    }
  });
});
