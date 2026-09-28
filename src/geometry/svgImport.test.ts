// @vitest-environment happy-dom
import { beforeAll, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";
import { svgToCrossSection } from "./svgImport";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const area = (svg: string) => scoped((k) => k(svgToCrossSection(M, svg)).area());

test("path com evenodd mantém o furo", () => {
  expect(area(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/></svg>`)).toBeCloseTo(84);
});

test("formas básicas e transform são aplicados", () => {
  const a = area(`<svg xmlns="http://www.w3.org/2000/svg"><g transform="scale(2)"><rect x="0" y="0" width="5" height="5"/></g></svg>`);
  expect(a).toBeCloseTo(100);
});

test("formas sobrepostas viram união (não somam área duas vezes)", () => {
  expect(area(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/><rect x="5" width="10" height="10"/></svg>`)).toBeCloseTo(150);
});

test("contorno só com traço (sem preenchimento) vira faixa com a largura do traço", () => {
  const a = area(`<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="none" stroke="#000" stroke-width="2"/></svg>`);
  expect(a).toBeGreaterThan(780);
  expect(a).toBeLessThan(820); // ≈ perímetro 400 × 2
});

test("SVG sem nenhuma forma dá erro amigável", () => {
  expect(() => area(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)).toThrow(/nenhuma forma/i);
});
