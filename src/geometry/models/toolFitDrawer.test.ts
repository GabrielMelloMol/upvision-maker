import { beforeAll, describe, expect, test } from "vitest";
import { EXAMPLE_OUTLINES } from "../../organizer/examples";
import type { ToolOutline } from "../../organizer/types";
import { bedMm } from "../bed";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Model } from "../types";
import { FOOT_H, GRID, HEIGHT_UNIT, LIP_H } from "./gridfinity";
import { BED_MARGIN } from "./gridDrawer";
import { binCells, DEFAULT_TOOL_FIT as D, toolBin, type ToolFitParams } from "./toolFit";
import { buildModularDrawer, modularPlan, moveBin, placeBins, type BinPlace } from "./toolFitDrawer";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const P: ToolFitParams = { ...D, mode: "drawer", drawerKind: "bins", drawerW: 400, drawerD: 300, drawerH: 80 };
const bar = (id: string, w: number, h: number): ToolOutline => ({ id, label: id, points: [[0, 0], [w, 0], [w, h], [0, h]] });
const box = (models: Model[]) => {
  const b = meshBounds(models.flatMap((m) => m.parts.map((q) => q.mesh)))!;
  return { w: b.max[0] - b.min[0], d: b.max[1] - b.min[1], z: b.max[2], b };
};
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("caixinha Gridfinity de uma ferramenta (#169, gaveta modular)", { timeout: 60_000 }, () => {
  test("menor número de casas que cabe a ferramenta + folga + parede (+ dedo); altura em unidades de 7 pelo encaixe", () => {
    const p = { ...P, clearance: 0.3, wall: 3, finger: false, depth: 12, floor: 2, lip: false }; // a borda soma 4,4 mm em cima (outro teste)
    const c = binCells(bar("chave", 100, 30), p);
    const need = [100 + 2 * (0.3 + 3), 30 + 2 * (0.3 + 3)];
    expect(c.w * GRID - 0.5).toBeGreaterThanOrEqual(need[0]);
    expect((c.w - 1) * GRID - 0.5).toBeLessThan(need[0]); // uma casa a menos não cabe
    expect(c.h * GRID - 0.5).toBeGreaterThanOrEqual(need[1]);
    expect((c.h - 1) * GRID - 0.5).toBeLessThan(need[1]);
    expect(c.u).toBe(Math.ceil((FOOT_H + 2 + 12) / HEIGHT_UNIT));
    const bin = toolBin(M, bar("chave", 100, 30), p);
    const s = box([bin.model]);
    expect(s.w).toBeCloseTo(c.w * GRID - 0.5, 1); // encaixa na grade de 42
    expect(s.d).toBeCloseTo(c.h * GRID - 0.5, 1);
    expect(s.z).toBeCloseTo(c.u * HEIGHT_UNIT, 2);
    expect(bin.model.name).toBe(`Caixinha chave ${c.w}×${c.h}×${c.u}`);
  });

  test("profundidade maior sobe a caixinha em unidades inteiras", () => {
    expect(binCells(bar("a", 60, 20), { ...P, depth: 30 }).u).toBeGreaterThan(binCells(bar("a", 60, 20), { ...P, depth: 12 }).u);
  });
});

describe("arrumação das caixinhas na gaveta (#169)", () => {
  const sizes = [{ id: "a", w: 3, h: 2 }, { id: "b", w: 2, h: 2 }, { id: "c", w: 1, h: 4 }, { id: "d", w: 2, h: 1 }];

  test("automática: todas dentro da grade, sem sobrepor, maiores primeiro", () => {
    const { places, missing } = placeBins(9, 6, sizes, {});
    expect(missing).toEqual([]);
    const rects = sizes.map((s) => ({ ...places[s.id], w: places[s.id].turned ? s.h : s.w, h: places[s.id].turned ? s.w : s.h }));
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(9);
      expect(r.y + r.h).toBeLessThanOrEqual(6);
    }
    rects.forEach((r, i) => rects.slice(i + 1).forEach((q) => expect(overlap(r, q)).toBe(false)));
  });

  test("posição salva (arrastada) é mantida; a inválida é refeita", () => {
    const saved: Record<string, BinPlace> = { a: { x: 6, y: 4, turned: false }, b: { x: 7, y: 5, turned: false } }; // b sai da grade
    const { places } = placeBins(9, 6, sizes, saved);
    expect(places.a).toEqual({ x: 6, y: 4, turned: false });
    expect(places.b.x + 2).toBeLessThanOrEqual(9);
    expect(places.b.y + 2).toBeLessThanOrEqual(6);
  });

  test("só cabe deitada: gira 90°; nem assim: fica de fora", () => {
    expect(placeBins(2, 5, [{ id: "longa", w: 4, h: 1 }], {}).places.longa.turned).toBe(true);
    expect(placeBins(2, 2, [{ id: "enorme", w: 4, h: 3 }], {}).missing).toEqual(["enorme"]);
  });

  test("arrastar: move se couber; batendo em outra ou saindo da grade, não muda", () => {
    const { places } = placeBins(9, 6, sizes, {});
    const moved = moveBin(9, 6, sizes, places, "d", 0, 0);
    expect(moved).toEqual(places);
    const free = placeBins(9, 6, [{ id: "x", w: 1, h: 1 }], {});
    expect(moveBin(9, 6, [{ id: "x", w: 1, h: 1 }], free.places, "x", 3, 2).x).toEqual({ x: 3, y: 2, turned: false });
    expect(moveBin(9, 6, [{ id: "x", w: 1, h: 1 }], free.places, "x", 20, 0)).toEqual(free.places);
  });
});

describe("gaveta modular montada (#169)", { timeout: 120_000 }, () => {
  test("base pela gaveta em pedaços que cabem na mesa; uma caixinha por ferramenta, no lugar do mapa, sem sobrepor", () => {
    const plan = modularPlan(P);
    const out = buildModularDrawer(M, EXAMPLE_OUTLINES, P, {});
    expect(out.bins).toHaveLength(3);
    expect(out.missing).toEqual([]);
    for (const piece of out.basePieces) {
      const s = box([piece]);
      expect(Math.max(s.w, s.d)).toBeLessThanOrEqual(bedMm() - 2 * BED_MARGIN + 1e-6);
    }
    // prévia: base montada (largura da grade + margens) e as caixinhas em cima
    const base = box(out.preview.filter((m) => m.name.startsWith("Base")));
    expect(base.w).toBeCloseTo(plan.nx * GRID + plan.marginX[0] + plan.marginX[1], 0);
    const bins = out.preview.filter((m) => m.name.startsWith("Caixinha")).map((m) => box([m]).b);
    expect(bins).toHaveLength(3);
    bins.forEach((a, i) => bins.slice(i + 1).forEach((b) => expect(a.max[0] <= b.min[0] + 1e-3 || b.max[0] <= a.min[0] + 1e-3 || a.max[1] <= b.min[1] + 1e-3 || b.max[1] <= a.min[1] + 1e-3).toBe(true)));
    for (const b of bins) {
      expect(b.min[0]).toBeGreaterThanOrEqual(base.b.min[0] - 1e-3);
      expect(b.max[0]).toBeLessThanOrEqual(base.b.max[0] + 1e-3);
    }
    // encaixe na grade: cada caixinha começa 0,25 mm depois da divisa de uma casa da base (folga padrão de 0,5 mm)
    for (const b of bins)
      for (const [axis, margin] of [[0, plan.marginX[0]], [1, plan.marginY[0]]] as const) {
        const rel = (b.min[axis] - (base.b.min[axis] + margin)) / GRID;
        expect(Math.abs(rel - Math.round(rel) - 0.25 / GRID)).toBeLessThan(0.01 / GRID + 1e-6);
      }
    // resumo da grade é informação (azul), não aviso
    expect(out.notes.join()).toMatch(/Cabem 9 × 7 casas/);
    expect(out.warnings.join()).not.toMatch(/Cabem/);
    // para imprimir: cada caixinha deitada no centro, uma de cada
    expect(out.groups.map((g) => g.count)).toEqual([1, 1, 1]);
  });

  test("caixinha mais alta que a gaveta avisa; gaveta pequena demais deixa ferramenta de fora com aviso", () => {
    const tall = buildModularDrawer(M, [bar("alta", 60, 20)], { ...P, depth: 60, drawerH: 40 }, {});
    expect(tall.warnings.join()).toMatch(/altura da gaveta/);
    const small = buildModularDrawer(M, [bar("grande", 200, 30)], { ...P, drawerW: 120, drawerD: 120 }, {});
    expect(small.missing).toEqual(["grande"]);
    expect(small.warnings.join()).toMatch(/não coube/);
  });
});

describe("altura das caixinhas na gaveta modular (#169)", { timeout: 120_000 }, () => {
  const tools = [{ ...bar("baixa", 60, 20), heightMm: 6 }, { ...bar("alta", 60, 20), heightMm: 40 }];
  const heights = (models: Model[]) => models.filter((m) => m.name.startsWith("Caixinha")).map((m) => Math.round(box([m]).z * 100) / 100);

  test("padrão: todas com a mesma altura (a da mais alta), niveladas para trocar de lugar; com a borda de empilhar em cima", () => {
    const out = buildModularDrawer(M, tools, { ...P, depth: 12 }, {});
    const hs = heights(out.bins);
    expect(new Set(hs).size).toBe(1);
    const u = Math.max(...tools.map((t) => binCells(t, { ...P, depth: 12 }).u));
    expect(hs[0]).toBeCloseTo(u * HEIGHT_UNIT + LIP_H, 1);
  });

  test("altura individual: cada uma pelo próprio encaixe; sem borda, topo na unidade", () => {
    const out = buildModularDrawer(M, tools, { ...P, binHeight: "each", lip: false, depth: 12 }, {});
    for (const [m, t] of out.bins.map((b, i) => [b, tools[i]] as const)) expect(box([m]).z).toBeCloseTo(binCells(t, { ...P, depth: 12 }).u * HEIGHT_UNIT, 1);
  });

  test("pela gaveta: todas na maior altura que cabe nela; gaveta baixa demais avisa", () => {
    const out = buildModularDrawer(M, tools, { ...P, binHeight: "drawer", drawerH: 60 }, {});
    const hs = heights(out.bins);
    expect(new Set(hs).size).toBe(1);
    expect(hs[0]).toBeLessThanOrEqual(60);
    expect(hs[0] + HEIGHT_UNIT).toBeGreaterThan(60 - 3); // a próxima unidade não caberia (com a folga de cima)
    expect(buildModularDrawer(M, tools, { ...P, drawerH: 20, depth: 24 }, {}).warnings.join()).toMatch(/altura da gaveta/);
  });
});
