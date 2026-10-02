import { describe, expect, test } from "vitest";
import { apply, homography, invert, type Pt } from "./homography";
import { lightness } from "./image";
import { convexHull, findSheetCorners, maxQuad, order } from "./sheet";
import { renderScene, truthCorners, type Scene } from "./testPhoto";

export const A4_SCENE: Scene = {
  sheet: { w: 210, h: 297 },
  boxes: [{ x: 50, y: 120, w: 100, d: 40, h: 0 }],
  camera: [160, 330, 420],
  target: [105, 150, 0],
  focalPx: 1300,
  size: [1600, 1200],
  roll: 8,
};

// renderiza uma foto de 1600 × 1200 com supersample (~1 s, mais com a máquina carregada)
describe("folha na foto (#169)", { timeout: 30_000 }, () => {
  test("homografia leva os 4 pontos exatamente e a inversa volta", () => {
    const from: Pt[] = [[0, 0], [210, 0], [210, 297], [0, 297]];
    const to: Pt[] = [[100, 80], [900, 120], [950, 1100], [60, 1000]];
    const h = homography(from, to)!;
    from.forEach((p, i) => {
      expect(apply(h, p)[0]).toBeCloseTo(to[i][0], 6);
      expect(apply(h, p)[1]).toBeCloseTo(to[i][1], 6);
    });
    const back = apply(invert(h), [500, 600]);
    const again = apply(h, back);
    expect(again[0]).toBeCloseTo(500, 6);
    expect(again[1]).toBeCloseTo(600, 6);
  });

  test("quadrilátero de maior área no fecho e ordem horária a partir do topo à esquerda", () => {
    const pts: Pt[] = [[10, 10], [100, 5], [60, 50], [105, 90], [8, 95], [50, 3], [3, 50]];
    const q = order(maxQuad(convexHull(pts))!);
    expect(q).toEqual([[10, 10], [100, 5], [105, 90], [8, 95]]);
  });

  test("acha os 4 cantos da A4 em perspectiva com erro abaixo de 0,5 px", () => {
    const img = renderScene(A4_SCENE);
    const found = findSheetCorners(lightness(img))!;
    const truth = order(truthCorners(A4_SCENE));
    expect(found).toHaveLength(4);
    found.forEach((p, i) => expect(Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1])).toBeLessThan(0.5));
  });
});
