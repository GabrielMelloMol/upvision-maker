import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { pinHoles } from "./splitBed";
import { buildWallLetters, DEFAULT_WALL_LETTERS as D, type WallLettersParams } from "./wallLetters";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// "fonte": uma barra 0,5·h × h por letra, com 0,2·h de espaço
const ctx = (): ModelCtx => ({
  M,
  art: null,
  text: (s, h) => {
    const n = s.trim().length;
    if (!n) return null;
    const w = 0.5 * h, gap = 0.2 * h, total = n * w + (n - 1) * gap;
    return M.CrossSection.union(Array.from({ length: n }, (_, i) => M.CrossSection.square([w, h], true).translate([-total / 2 + w / 2 + i * (w + gap), 0])));
  },
});
const build = (p: Partial<WallLettersParams> = {}) => buildWallLetters(ctx(), { ...D, ...p });
const letters = (p: Partial<WallLettersParams>) => build(p).models.filter((m) => m.name.startsWith("Letra"));

describe("letras soltas para parede (#57)", { timeout: 60_000 }, () => {
  test("uma peça por letra na altura pedida; camadas em offset empilhadas", () => {
    const ls = letters({ text: "OI", height: 150, layers: 3 });
    expect(ls.map((m) => m.name)).toEqual(["Letra 1", "Letra 2"]);
    const [c1, c2, c3] = ls[0].parts;
    expect([c1, c2, c3].map((q) => q.name)).toEqual(["Camada 1", "Camada 2", "Camada 3"]);
    const h = (m: typeof c1.mesh) => meshBounds([m])!;
    expect(h(c3.mesh).max[1] - h(c3.mesh).min[1]).toBeCloseTo(150, 0);
    expect(h(c1.mesh).max[1] - h(c1.mesh).min[1]).toBeCloseTo(150 + 4 * D.offset, 0);
    expect(h(c2.mesh).min[2]).toBeCloseTo(D.thickness);
    expect(h(c3.mesh).max[2]).toBeCloseTo(D.thickness + 2 * D.layerThickness);
  });

  test("letra maior que a mesa: partes que cabem, com furos de pino, e aviso", () => {
    const { models, warnings } = build({ text: "I", height: 400, layers: 1, template: false });
    expect(models.map((m) => m.name)).toEqual(["Letra 1.1", "Letra 1.2"]);
    for (const m of models) expect(modelsBounds([m])!.max[1] - modelsBounds([m])!.min[1]).toBeLessThanOrEqual(256);
    expect(warnings!.join(" ")).toMatch(/filamento de 1,75 mm/);
    const whole = 200 * 400 * D.thickness;
    const total = models.reduce((s, m) => s + volume(m.parts[0].mesh), 0);
    expect(whole - total).toBeCloseTo(2 * Math.PI * 1 * 1 * 14, -1); // 2 furos de pino (cilindro de 16 lados ≈ 97,5% do círculo)
  });

  test("gabarito: tira com um risco no começo e no fim de cada letra", () => {
    const { models } = build({ text: "OI", height: 100 });
    const tpl = models.find((m) => m.name === "Gabarito")!;
    const b = meshBounds([tpl.parts[0].mesh])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(0.5 * 100 * 2 + 20 + 2 * D.offset, 0);
    expect(b.max[2]).toBeCloseTo(0.8);
    const plain = (b.max[0] - b.min[0]) * 20 * 0.8;
    expect(volume(tpl.parts[0].mesh)).toBeLessThan(plain - 4 * 1.2 * 10 * 0.8 * 0.5);
  });

  test("pinHoles não fura peça que cabe na mesa", () => {
    const s = M.Manifold.cube([100, 100, 8]);
    expect(pinHoles(M, s, 256, 1, 4).volume()).toBeCloseTo(s.volume());
  });
});
