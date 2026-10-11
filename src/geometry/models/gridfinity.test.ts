import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildGridBase, buildGridBin, DEFAULT_GRID_BASE, DEFAULT_GRID_BIN as D, FOOT_H, GRID, LIP_H, PLATE_H, type GridBinParams } from "./gridfinity";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const bin = (p: Partial<GridBinParams> = {}) => buildGridBin(ctx(), { ...D, label: "", ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("Gridfinity (#93)", { timeout: 60_000 }, () => {
  test("caixinha 2×1×3: 83,5 × 41,5 mm, 21 mm até o topo da parede + borda empilhável, uma peça só, na mesa", () => {
    const m = bin().models[0].parts[0].mesh;
    const b = meshBounds([m])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(2 * GRID - 0.5, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(GRID - 0.5, 1);
    expect(b.min[2]).toBeCloseTo(0, 2);
    expect(b.max[2]).toBeCloseTo(3 * 7 + LIP_H, 1);
    const s = solid(m);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    s.delete();
    expect(meshBounds([bin({ lip: false }).models[0].parts[0].mesh])!.max[2]).toBeCloseTo(21, 1);
  });

  test("pé por casa com o perfil da especificação: 4,75 mm, mais estreito embaixo", () => {
    const m = bin({ unitsX: 1, lip: false, labelTab: false, scoop: false, dividersX: 1 }).models[0].parts[0].mesh;
    const s = solid(m);
    const at = (z: number) => {
      const c = s.slice(z);
      const bb = c.bounds();
      return bb.max[0] - bb.min[0];
    };
    expect(at(0.1)).toBeCloseTo(41.5 - 2 * (0.8 + 2.15) + 0.2, 0);
    expect(at(2)).toBeCloseTo(41.5 - 2 * 2.15, 0);
    expect(at(FOOT_H + 1)).toBeCloseTo(41.5, 0);
    s.delete();
  });

  test("divisórias, aba, rampa e ímãs mudam o volume como esperado", () => {
    const v = (p: Partial<GridBinParams>) => volume(bin(p).models[0].parts[0].mesh);
    const base: Partial<GridBinParams> = { dividersX: 1, labelTab: false, scoop: false };
    expect(v({ ...base, dividersX: 3 })).toBeGreaterThan(v(base) + 2 * 1.2 * 30 * 10);
    expect(v({ ...base, labelTab: true })).toBeGreaterThan(v(base) + 50);
    expect(v({ ...base, scoop: true })).toBeGreaterThan(v(base) + 50);
    const mag = v({ ...base, magnets: true });
    expect(v(base) - mag).toBeCloseTo(8 * Math.PI * 3.25 ** 2 * 2.4, -1);
  });

  test("etiqueta com texto sai à parte em 2 cores", () => {
    const { models } = bin({ label: "M3" });
    expect(models.map((m) => m.parts.map((q) => q.name))).toEqual([["Caixinha"], ["Etiqueta", "Texto"]]);
  });

  test("base: um encaixe por casa, 42 mm por casa; grande sai em pedaços que cabem na mesa, cortados nas divisas", () => {
    const one = buildGridBase(ctx(), DEFAULT_GRID_BASE).models;
    expect(one).toHaveLength(1);
    const b = modelsBounds(one)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(4 * GRID, 1);
    expect(b.max[2] - b.min[2]).toBeCloseTo(PLATE_H, 1);
    const big = buildGridBase(ctx(), { ...DEFAULT_GRID_BASE, unitsX: 8, unitsY: 7 });
    expect(big.models.length).toBe(4);
    for (const m of big.models) {
      const bb = modelsBounds([m])!;
      expect(Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1])).toBeLessThanOrEqual(256);
      expect(((bb.max[0] - bb.min[0]) / GRID) % 1).toBeCloseTo(0, 3); // corte na divisa
    }
    expect(big.warnings!.join(" ")).toMatch(/4 pedaços/);
    const mag = buildGridBase(ctx(), { ...DEFAULT_GRID_BASE, magnets: true }).models;
    expect(modelsBounds(mag)!.max[2]).toBeCloseTo(PLATE_H + 2.4 + 0.8, 1);
  });
});

describe("Gridfinity modular: meia casa e divisórias livres", { timeout: 60_000 }, () => {
  const mesh = (p: Partial<GridBinParams> & { cutsX?: number[]; cutsY?: number[]; feet?: boolean }) => bin(p).models[0].parts[0].mesh;
  test("1,5 × 1 casa: 62,5 × 41,5 mm, pé só na casa inteira, uma peça só", () => {
    const m = mesh({ unitsX: 1.5, unitsY: 1, dividersX: 1, lip: false, labelTab: false, scoop: false });
    const b = meshBounds([m])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(1.5 * GRID - 0.5, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(GRID - 0.5, 1);
    const s = solid(m);
    expect(s.decompose().length).toBe(1);
    // embaixo (z = 0,1) só o pé de 1 casa: encostado na esquerda, 21 mm de folga na direita
    const foot = s.slice(0.1).bounds();
    expect(foot.max[0] - foot.min[0]).toBeLessThan(GRID);
    expect(foot.min[0] - b.min[0]).toBeLessThan(5);
    s.delete();
  });

  test("meia casa (0,5 × 1): 20,5 mm, sem pé (menor que uma casa), apoiada no corpo", () => {
    const m = mesh({ unitsX: 0.5, unitsY: 1, dividersX: 1, lip: false, labelTab: false, scoop: false });
    const b = meshBounds([m])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(0.5 * GRID - 0.5, 1);
    expect(b.min[2]).toBeGreaterThan(FOOT_H - 0.1);
  });

  test("divisórias nas posições pedidas: 3 compartimentos desiguais no 2×1 (25% e 80% do vão)", () => {
    const p = { unitsX: 2, unitsY: 1, unitsZ: 4, dividersX: 3, cutsX: [0.25, 0.8], lip: false, labelTab: false, scoop: false };
    const m = mesh(p);
    const s = solid(m);
    const b = meshBounds([m])!;
    const iw = b.max[0] - b.min[0] - 2 * D.wall;
    const left = b.min[0] + D.wall;
    // fatia no meio da altura da parede: as divisórias são paredes cheias; procurar o vazio entre elas
    const c = s.slice(15);
    const area = c.area();
    s.delete();
    const id = b.max[1] - b.min[1] - 2 * D.wall;
    const plain = solid(mesh({ ...p, dividersX: 1, cutsX: undefined }));
    const extra = area - plain.slice(15).area(); // só as 2 divisórias
    plain.delete();
    expect(extra).toBeGreaterThan(2 * D.wall * id * 0.95);
    expect(extra).toBeLessThan(2 * D.wall * id * 1.05);
    // posição: raio-x pela fatia em x = left + f·iw
    const s2 = solid(m);
    for (const f of [0.25, 0.8]) {
      const probe = s2.slice(15);
      const x = left + f * iw;
      const cut = M.CrossSection.square([D.wall * 0.5, id * 0.8], true).translate([x, (b.min[1] + b.max[1]) / 2]);
      const hit = probe.intersect(cut).area();
      expect(hit).toBeGreaterThan(D.wall * 0.5 * id * 0.8 * 0.98);
      cut.delete();
      probe.delete();
    }
    // e no meio do primeiro compartimento (12%) não há parede
    const gap = solid(m).slice(15).intersect(M.CrossSection.square([2, id * 0.8], true).translate([left + 0.12 * iw, (b.min[1] + b.max[1]) / 2]));
    expect(gap.area()).toBeCloseTo(0, 3);
    gap.delete();
    s2.delete();
  });

  test("divisórias em Y também livres; sem posições, continuam iguais pela quantidade", () => {
    const even = volume(mesh({ unitsX: 2, unitsY: 2, dividersX: 1, dividersY: 3, labelTab: false, scoop: false }));
    const same = volume(mesh({ unitsX: 2, unitsY: 2, dividersX: 1, dividersY: 3, cutsY: [1 / 3, 2 / 3], labelTab: false, scoop: false }));
    expect(same).toBeCloseTo(even, 0);
    const b = meshBounds([mesh({ unitsX: 2, unitsY: 2, dividersX: 1, dividersY: 3, cutsY: [0.2, 0.9], labelTab: false, scoop: false })])!;
    expect(b.max[1] - b.min[1]).toBeCloseTo(2 * GRID - 0.5, 1); // nada passa da caixinha
  });
});
