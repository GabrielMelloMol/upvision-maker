// @vitest-environment happy-dom
import { beforeAll, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { svgToCrossSection } from "./svgImport";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

// Os retângulos dos segmentos saem em sentido horário: o preenchimento é NonZero para não descartá-los.
test("linha aberta com traço vira cápsula: comprimento × largura + pontas redondas", () => {
  const cs = svgToCrossSection(M, svg('<polyline points="10,50 50,50 50,90" fill="none" stroke="#000" stroke-width="4"/>'));
  const b = cs.bounds();
  expect([b.min[0], b.max[0], b.max[1]]).toEqual([expect.closeTo(8, 1), expect.closeTo(52, 1), expect.closeTo(92, 1)]);
  // 2 segmentos de 40 × 4 (sobreposição na junta) + 2 meias-pontas
  expect(cs.area()).toBeGreaterThan(80 * 4);
  expect(cs.area()).toBeLessThan(80 * 4 + Math.PI * 4 + 1);
  cs.delete();
});

test("pontos repetidos no traço não geram segmento degenerado", () => {
  const cs = svgToCrossSection(M, svg('<polyline points="0,0 0,0 30,0" fill="none" stroke="red" stroke-width="2"/>'));
  expect(cs.bounds().max[0]).toBeCloseTo(31, 1);
  cs.delete();
});

test("SVG gigante ou com ENTITY é recusado antes de processar", () => {
  expect(() => svgToCrossSection(M, "<svg>" + " ".repeat(5 * 1024 * 1024) + "</svg>")).toThrow("SVG maior que 5 MB.");
  expect(() => svgToCrossSection(M, '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>')).toThrow(/ENTITY/);
});
