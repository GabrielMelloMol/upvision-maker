import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import { MissingInput, type ModelCtx } from "./common";
import { buildFridgeMagnet, DEFAULT_FRIDGE_MAGNET as D, magnetSpots, type FridgeMagnetParams } from "./fridgeMagnet";
import { nfcLayout } from "./nfcKeychain";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text });
/** Arte quadrada 100 × 100 (a largura pedida a escala): corpo previsível. */
const build = (p: Partial<FridgeMagnetParams> = {}) => buildFridgeMagnet(ctx(M.CrossSection.square([100, 100], true)), { ...D, width: 60, ...p });
const solid = (m: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const holesAt = (mesh: Parameters<typeof solid>[0], z: number) => {
  const s = solid(mesh), cs = s.slice(z);
  const rings = cs.toPolygons().length;
  cs.delete();
  s.delete();
  return rings - 1; // 1 contorno + os furos
};

describe("ímã de geladeira (#186)", { timeout: 60_000 }, () => {
  test("corpo apoiado na mesa, na altura das camadas do bolso, com a arte em relevo por cima", () => {
    const L = nfcLayout({ tagThickness: D.magnetHeight, layerHeight: D.layerHeight });
    const out = build();
    const [body, art] = out.models[0].parts;
    const b = meshBounds([body.mesh])!;
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.max[2]).toBeCloseTo(L.height, 3);
    expect(meshBounds([art.mesh])!.max[2]).toBeCloseTo(L.height + D.relief, 3);
    expect(b.max[0] - b.min[0]).toBeCloseTo(60 + 2 * D.margin, 0);
    expect(out.pauses).toEqual([L.pauseZ]);
  });

  test.each([1, 2, 3, 4, 5])("%i ímã(s): o mesmo número de bolsos fechados, com o volume do ímã tirado", (count) => {
    const L = nfcLayout({ tagThickness: D.magnetHeight, layerHeight: D.layerHeight });
    const out = build({ count });
    const mesh = out.models[0].parts[0].mesh;
    const mid = (L.bottom + L.top) / 2;
    expect(holesAt(mesh, mid)).toBe(count);
    expect(holesAt(mesh, L.bottom / 2)).toBe(0); // piso fechado embaixo
    expect(holesAt(mesh, L.top + 0.1)).toBe(0); // e cobertura fechada em cima
    const full = M.CrossSection.square([60 + 2 * D.margin, 60 + 2 * D.margin], true);
    const roundedFull = full.area();
    const r = (D.magnetDiameter + 0.4) / 2;
    const removed = Math.PI * r * r * (L.top - L.bottom) * count;
    expect(volume(mesh)).toBeLessThan(roundedFull * L.height - removed + 1); // o contorno é arredondado: sobra menos que o quadrado cheio
    expect(volume(mesh)).toBeGreaterThan(roundedFull * L.height * 0.9 - removed);
    expect(out.warnings!.join(" ")).toMatch(count === 1 ? /coloque o ímã no bolso/ : new RegExp(`os ${count} ímãs`));
  });

  test("os bolsos ficam dentro do corpo, com parede, e separados entre si", () => {
    const fits = M.CrossSection.square([40, 40], true);
    const r = 5.2;
    const spots = magnetSpots(fits, r, 5);
    expect(spots).toHaveLength(5);
    for (const [x, y] of spots) expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(20 + 1e-6);
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1])).toBeGreaterThanOrEqual(2 * r + 2);
    const [c] = magnetSpots(fits, r, 1);
    expect(Math.hypot(...c)).toBeLessThan(1.5); // um só: no meio
  });

  test("não cabem todos: coloca os que cabem e avisa; nenhum cabe: erro claro", () => {
    const out = build({ count: 5, magnetDiameter: 25, width: 45 });
    const w = out.warnings!.join(" ");
    expect(w).toMatch(/Só (cabe 1 ímã|cabem \d ímãs) de 25 mm/);
    expect(() => build({ magnetDiameter: 25, width: 20, margin: 1.5 })).toThrow(/não cabe/);
  });

  test("a altura do ímã e a camada mudam a altura da pausa; sem arte nem texto, pede dados", () => {
    const a = build({ magnetHeight: 2 }).pauses![0], b = build({ magnetHeight: 5 }).pauses![0];
    expect(b).toBeGreaterThan(a + 2);
    expect(() => buildFridgeMagnet(ctx(), { ...D, text: "" })).toThrow(MissingInput);
    expect(buildFridgeMagnet(ctx(), D).models[0].parts[0].name).toBe("Corpo");
  });
});
