import { describe, expect, test } from "vitest";
import { getManifold } from "../geometry/manifold";
import { toMesh } from "../geometry/mesh";
import type { Model } from "../geometry/types";
import { densityOfMaterial, estimateModels, meshMeasures, printedVolume } from "./estimate";

async function cube(side: number, color = "#ffffff"): Promise<Model> {
  const M = await getManifold();
  const s = M.Manifold.cube([side, side, side]);
  const mesh = toMesh(s);
  s.delete();
  return { name: "cubo", parts: [{ name: "cubo", color, mesh }] };
}

describe("estimativa sem fatiar (#99)", { timeout: 30_000 }, () => {
  test("volume e área da malha", async () => {
    const { volume, area } = meshMeasures((await cube(20)).parts[0].mesh);
    expect(volume).toBeCloseTo(8000);
    expect(area).toBeCloseTo(2400);
  });

  test("casca + miolo com preenchimento; peça fina é toda casca", () => {
    // cubo 20 mm, 3 paredes, 15%: casca 2400 × 3 × 0,42 = 3024; miolo (8000 − 3024) × 15% = 746,4
    expect(printedVolume(8000, 2400, { walls: 3, infill: 15 })).toBeCloseTo(3770.4);
    expect(printedVolume(100, 1000, { walls: 3, infill: 15 })).toBe(100);
    expect(printedVolume(8000, 2400, { walls: 3, infill: 100 })).toBe(8000);
  });

  test("cubo de 20 mm em PLA dá ~4,7 g (fatiador: 4–6 g) e tempo na casa de 10–20 min", async () => {
    const e = estimateModels([await cube(20)], { walls: 3, infill: 15, layerHeight: 0.2 })!;
    expect(e.grams).toBeCloseTo(4.7, 1);
    expect(e.seconds).toBeGreaterThan(600);
    expect(e.seconds).toBeLessThan(1200);
  });

  test("gramas separadas por cor, com a densidade do filamento de cada uma", async () => {
    const white = await cube(30, "#ffffff");
    const black = await cube(30, "#000000");
    const e = estimateModels([{ name: "duas cores", parts: [...white.parts, ...black.parts] }], { walls: 3, infill: 15 }, (c) => (c === "#000000" ? densityOfMaterial("PETG") : densityOfMaterial("PLA")))!;
    const [w, b] = e.byColor;
    expect(w.color).toBe("#ffffff");
    expect(b.grams).toBeGreaterThan(w.grams); // PETG é mais denso
    expect(e.grams).toBeCloseTo(w.grams + b.grams, 1);
  });

  test("sem malha: sem estimativa; material desconhecido cai no PLA", () => {
    expect(estimateModels([])).toBeNull();
    expect(densityOfMaterial("Seda")).toBe(1.24);
    expect(densityOfMaterial(" petg ")).toBe(1.27);
  });
});
