// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "../geometry/manifold";
import { svgToColorRegions, svgToCrossSection } from "../geometry/svgImport";
import { traceColors } from "./colorTrace";
import { DEFAULT_TRACE } from "./pipeline";
import { buildColorSvg } from "./svgOut";
import { loadFixture, synthImage } from "./testFixtures";

// o vtracer só lê data/width/height
class NodeImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}
(globalThis as { ImageData?: unknown }).ImageData = NodeImageData;

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** Traça, monta o SVG e mede as regiões 3D: soma das partes vs. união (sobreposição) e união vs. silhueta (fresta). */
async function roundTrip(rgba: Uint8ClampedArray, w: number, h: number, colors: number, palette: string[] | null = null) {
  const { layers } = await traceColors(rgba, w, h, { ...DEFAULT_TRACE, colors, palette, widthMm: 60 });
  const svg = buildColorSvg(layers, w, h, 60);
  const regions = svgToColorRegions(M, svg);
  const sum = regions.reduce((s, r) => s + r.cs.area(), 0);
  const union = M.CrossSection.union(regions.map((r) => r.cs));
  const silhouette = svgToCrossSection(M, svg);
  const gap = silhouette.subtract(union);
  const out = { layers, regions: regions.map((r) => ({ color: r.color, area: r.cs.area() })), sum, union: union.area(), silhouette: silhouette.area(), gap: gap.area() };
  [union, silhouette, gap, ...regions.map((r) => r.cs)].forEach((o) => o.delete());
  return out;
}

describe("modo colorido ponta a ponta (vtracer → SVG → regiões 3D)", () => {
  test("alvo de 3 cores: 3 camadas empilhadas, regiões sem sobreposição e sem fresta", async () => {
    const img = synthImage(200, 200, "#ffffff", [
      { kind: "circle", cx: 100, cy: 100, r: 90, color: "#2563eb" },
      { kind: "circle", cx: 100, cy: 100, r: 55, color: "#facc15" },
      { kind: "circle", cx: 100, cy: 100, r: 25, color: "#d6262e" },
    ]);
    const r = await roundTrip(img.rgba, 200, 200, 3);
    expect(r.layers).toHaveLength(3);
    expect(r.regions).toHaveLength(3);
    expect(Math.abs(r.sum - r.union) / r.union).toBeLessThan(0.001); // sem sobreposição
    expect(r.gap / r.silhouette).toBeLessThan(0.005); // sem fresta
    // áreas proporcionais aos anéis (π·(90²−55²), π·(55²−25²), π·25²) em px
    const expected = [90 ** 2 - 55 ** 2, 55 ** 2 - 25 ** 2, 25 ** 2].map((a) => a * Math.PI);
    r.regions.forEach((x, i) => expect(Math.abs(x.area - expected[i]) / expected[i]).toBeLessThan(0.05));
  }, 30_000);

  test("paleta de filamentos: as camadas saem com as cores cadastradas", async () => {
    const img = synthImage(160, 120, "#ffffff", [
      { kind: "rect", x: 10, y: 10, w: 140, h: 100, color: "#1e3a8a" },
      { kind: "circle", cx: 80, cy: 60, r: 30, color: "#ffffff" },
    ]);
    const r = await roundTrip(img.rgba, 160, 120, 2, ["#1c1c1e", "#f8f8f6", "#2563eb"]);
    expect(r.layers.map((l) => l.color)).toEqual(["#2563eb", "#f8f8f6"]);
  }, 30_000);

  test("fixture real (logo.jpg): 3 cores e regiões que se encaixam", async () => {
    const f = loadFixture("logo.jpg", 600);
    const r = await roundTrip(f.rgba, f.w, f.h, 4);
    expect(r.layers).toHaveLength(3);
    expect(Math.abs(r.sum - r.union) / r.union).toBeLessThan(0.001);
    expect(r.gap / r.silhouette).toBeLessThan(0.01);
  }, 30_000);
});
