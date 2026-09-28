import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { buildCutter, DEFAULT_CUTTER, type CutterParams } from "./cutter";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { csFromContours, scoped } from "./shape2d";
import { modelSize as size, modelVolume as vol, sq } from "./testUtil";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

function run(contours: [number, number][][], p: Partial<CutterParams> = {}) {
  return scoped((k) => buildCutter(M, k(csFromContours(M, contours, "EvenOdd")), { ...DEFAULT_CUTTER, ...p }));
}

// Desenho de linha: contorno quadrado de 40 mm com traço de 2 mm + bolinha (quadrado 10 mm) no meio
const lineArt = [sq(20), sq(18), sq(5)];

describe("cortador", () => {
  test("lâmina de 0,8 mm na altura pedida + borda de apoio na base", () => {
    const [cutter] = run(lineArt, { stamp: false }).models;
    const [w, d, h] = size(cutter);
    expect(w).toBeCloseTo(40 + 2 * (0.8 + 4), 1);
    expect(d).toBeCloseTo(w, 5);
    expect(h).toBeCloseTo(15);
    // lâmina ≈ (160×0,8 + π·0,8²)×15; borda ≈ (160×4,8 + π·4,8²)×2; menos a sobreposição (lâmina nos 2 mm da borda)
    const expected = (128 + Math.PI * 0.64) * 15 + (768 + Math.PI * 23.04) * 2 - (128 + Math.PI * 0.64) * 2;
    expect(vol(cutter) / expected).toBeGreaterThan(0.98);
    expect(vol(cutter) / expected).toBeLessThan(1.02);
  });

  test("carimbo: placa com folga para entrar no cortador + relevo só do desenho interno", () => {
    const { models, warnings } = run(lineArt);
    expect(models).toHaveLength(2);
    const stamp = models[1];
    const [w] = size(stamp);
    expect(w).toBeCloseTo(40 - 2 * DEFAULT_CUTTER.clearance, 1);
    const plate = (40 - 2 * DEFAULT_CUTTER.clearance) ** 2 * DEFAULT_CUTTER.plate;
    // relevo = só a bolinha (o contorno externo é do cortador, não do carimbo)
    expect(vol(stamp)).toBeCloseTo(plate + 100 * DEFAULT_CUTTER.relief, -1);
    expect(warnings).toEqual([]);
  });

  test("carimbo não encosta no cortador na mesa", () => {
    const [cutter, stamp] = run(lineArt).models;
    const a = meshBounds(cutter.parts.map((p) => p.mesh))!;
    const b = meshBounds(stamp.parts.map((p) => p.mesh))!;
    expect(b.min[0]).toBeGreaterThan(a.max[0]);
  });

  test("silhueta cheia com detalhe vazado: o vazado vira o relevo (modo automático)", () => {
    const stamp = run([sq(20), sq(5)]).models[1];
    const plate = (40 - 2 * DEFAULT_CUTTER.clearance) ** 2 * DEFAULT_CUTTER.plate;
    expect(vol(stamp)).toBeCloseTo(plate + 100 * DEFAULT_CUTTER.relief, -1);
  });

  test("sem desenho interno: avisa e o carimbo sai liso", () => {
    const { models, warnings } = run([sq(20)]);
    expect(models).toHaveLength(2);
    expect(warnings.join()).toMatch(/desenho interno/i);
  });
});
