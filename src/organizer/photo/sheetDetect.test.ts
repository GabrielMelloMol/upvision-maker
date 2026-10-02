import { describe, expect, test } from "vitest";
import { A4, LETTER, lightness, locateSheet, LOW_CONFIDENCE, measureTools, sizeMm } from "./index";
import { printedTone } from "./markers";
import { order } from "./sheet";
import { BENCH } from "./sheetBench";
import { renderScene, truthCorners, type Scene } from "./testPhoto";

const cornerError = (found: [number, number][], scene: Scene) => {
  const truth = order(truthCorners(scene));
  return Math.max(...order(found).map((p, i) => Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1])));
};

describe("onde está a folha (#169)", { timeout: 120_000 }, () => {
  test("mesa escura e mesa clara (borda só com a sombra fina do papel): 12 de 12 com os cantos a menos de 1 px", () => {
    const misses = BENCH.filter(({ scene }) => {
      const r = locateSheet(lightness(renderScene(scene, 2)), A4);
      return !r || r.printed || cornerError(r.corners, scene) >= 1;
    }).map((b) => b.name);
    expect(misses).toEqual([]);
  });

  // mesa branca do mesmo tom do papel e sem sombra nenhuma: a borda some; só os marcadores impressos dizem onde está
  const blank: Scene = { ...BENCH[4].scene, table: { tone: 233 } };

  test("folha de medição numa mesa branca sem borda visível: acha pelos marcadores e mede 100 × 40 mm (± 0,5 mm)", () => {
    const scene: Scene = { ...blank, print: (x, y) => printedTone(A4, x, y) };
    const g = lightness(renderScene(scene, 2));
    const where = locateSheet(g, A4)!;
    expect(where.printed).toBe(true);
    expect(where.confidence).toBe(1);
    expect(cornerError(where.corners, scene)).toBeLessThan(1.5);
    const r = measureTools(g, { sheet: A4, corners: where.corners, focalPx: scene.focalPx, printed: true });
    expect(r.outlines).toHaveLength(1); // marcadores e régua não viram ferramenta
    const s = sizeMm(r.outlines[0]);
    expect(Math.abs(s.length - 100)).toBeLessThan(0.5);
    expect(Math.abs(s.width - 40)).toBeLessThan(0.5);
  });

  test("folha de medição Carta deitada na foto: os cantos saem na orientação certa", () => {
    const scene: Scene = { ...blank, sheet: { w: 215.9, h: 279.4 }, roll: 95, print: (x, y) => printedTone(LETTER, x, y) };
    const where = locateSheet(lightness(renderScene(scene, 2)), LETTER)!;
    expect(where.printed).toBe(true);
    expect(cornerError(where.corners, scene)).toBeLessThan(1.5);
  });

  test("sem borda e sem marcadores: confiança baixa (a tela pede para conferir os cantos)", () => {
    const r = locateSheet(lightness(renderScene(blank, 2)), A4);
    expect(r === null || r.confidence < LOW_CONFIDENCE).toBe(true);
  });
});
