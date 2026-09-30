import { beforeAll, describe, expect, test } from "vitest";
import { modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildGridBase, buildGridBin, buildGridTest, DEFAULT_GRID_BASE, DEFAULT_GRID_BIN as D, GRID, type GridBinParams } from "./gridfinity";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const bin = (p: Partial<GridBinParams>) => solid(buildGridBin(ctx(), { ...D, unitsX: 1, unitsY: 1, unitsZ: 3, dividersX: 1, scoop: false, label: "", ...p }).models[0].parts[0].mesh);

/** Menor altura em que outra caixinha igual assenta por cima sem invadir (busca binária). */
function seat(s: Solid): number {
  let lo = 10, hi = 30;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const up = s.translate([0, 0, mid]);
    const hit = s.intersect(up);
    if (hit.volume() > 0.01) lo = mid;
    else hi = mid;
    up.delete();
    hit.delete();
  }
  return hi;
}

describe("Gridfinity: correções da Entrega 1 (#140)", { timeout: 120_000 }, () => {
  test("borda empilhável com apoio de 45°: a seção não salta no topo da parede", () => {
    const s = bin({ labelTab: false });
    const H = 21;
    const below = s.slice(H - 0.05).area(), above = s.slice(H + 0.05).area();
    expect(above / below).toBeLessThan(1.1);
    s.delete();
  });

  test("aba de etiqueta não levanta a caixinha de cima", () => {
    const plain = bin({ labelTab: false }), tab = bin({ labelTab: true });
    const a = seat(plain), b = seat(tab);
    expect(a).toBeCloseTo(21 - 0.35, 1);
    expect(b).toBeCloseTo(a, 2);
    plain.delete();
    tab.delete();
  });

  test("pedaços da base: 6 casas por pedaço na A1 e canto reto nas emendas", () => {
    const out = buildGridBase(ctx(), { ...DEFAULT_GRID_BASE, unitsX: 12, unitsY: 1 });
    expect(out.models).toHaveLength(2);
    const r = 4, corner = r * r - (Math.PI * r * r) / 4;
    for (const m of out.models) {
      const s = solid(m.parts[0].mesh);
      const b = s.boundingBox();
      expect(b.max[0] - b.min[0]).toBeCloseTo(6 * GRID, 2);
      // contorno visto de cima: retângulo menos só os 2 cantos de fora (os da emenda ficam retos)
      const outline = s.project().hull();
      expect(outline.area()).toBeCloseTo(6 * GRID * GRID - 2 * corner, 0);
      outline.delete();
      s.delete();
    }
  });

  test("base na medida da gaveta: 500 × 420 dá 6 pedaços e cobre a gaveta menos a folga, com o resumo", () => {
    const out = buildGridBase(ctx(), { ...DEFAULT_GRID_BASE, mode: "drawer", drawerW: 500, drawerD: 420, drawerH: 80 });
    expect(out.models).toHaveLength(6);
    for (const m of out.models) {
      const b = modelsBounds([m])!;
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(252.01);
    }
    // soma das larguras de uma fileira = 499 (500 − 1 de folga)
    const row = out.models.filter((m) => {
      const b = modelsBounds([m])!;
      return b.min[1] === Math.min(...out.models.map((x) => modelsBounds([x])!.min[1]));
    });
    const width = row.reduce((s, m) => {
      const b = modelsBounds([m])!;
      return s + b.max[0] - b.min[0];
    }, 0);
    expect(width).toBeCloseTo(499, 1);
    expect(out.warnings!.join(" ")).toMatch(/11 × 9 casas.*até 10 unidades/);
  });

  test("peça de teste de encaixe: base 2×1 e caixinha 1×1", () => {
    const out = buildGridTest(ctx(), { color: "#2563eb" });
    expect(out.models.map((m) => m.name)).toEqual(["Base de teste", "Caixinha de teste"]);
    const b = modelsBounds([out.models[0]])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(2 * GRID, 1);
  });
});
