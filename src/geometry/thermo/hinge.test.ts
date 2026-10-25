import { beforeAll, describe, expect, test, vi } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { scoped } from "../shape2d";
import { KIT_HINGE } from "../testKit/hingeLatch";
import { inradius } from "./dome";
import { buildRims, RIM_T } from "./hinge";
import { warpOntoDome } from "./preview";
import { presetSilhouette, type ThermoShape } from "./shapes";

vi.setConfig({ testTimeout: 180_000 });

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

type K = <D extends { delete(): void }>(o: D) => D;
const T = 1, BORDER = 3;
const opts = (side: "top" | "bottom" = "bottom", hinge = 0.3, latch = 1.2) => ({ t: T, border: BORDER, side, hinge, latch });
const rims = (k: K, shape: ThermoShape = "circle", o = opts()) => {
  const sil = k(presetSilhouette(M, shape, 70));
  return { sil, r: buildRims(M, k, sil, o) };
};
const vol = (k: K, a: Solid, b: Solid) => k(a.intersect(b)).volume();
/** Gira a peça em volta do eixo da dobradiça (paralelo a x, na emenda). */
const turn = (k: K, s: Solid, axisY: number, deg: number) => k(k(k(s.translate([0, -axisY, 0])).rotate([deg, 0, 0])).translate([0, axisY, 0]));
const cylX = (k: K, r: number, x0: number, x1: number, y: number) => k(k(k(M.Manifold.cylinder(x1 - x0, r, r, 64)).rotate([0, 90, 0])).translate([x0, y, 0]));

describe("dobradiça e trava da caixinha", () => {
  for (const [shape, side] of [["circle", "bottom"], ["heart", "top"], ["heart", "bottom"], ["egg", "bottom"]] as const)
    test(`${shape}, dobradiça ${side === "top" ? "em cima" : "embaixo"}: o aro de baixo gira de fechado até aberto sem bater no de cima`, () =>
      scoped((k) => {
        const { r } = rims(k, shape, opts(side));
        expect(vol(k, r.a, r.b)).toBeLessThan(1e-3); // fechado: só encostam na emenda
        // a trava é solta com o dedo antes de abrir: o resto do aro de cima não pode bater em nenhum ângulo
        for (const deg of [10, 30, 60, 90, 120, 150, 180]) expect(vol(k, r.aNoLatch, turn(k, r.b, r.axisY, r.openSign * deg)), `${deg}°`).toBeLessThan(1e-3);
      }));

  test("o pino tem a folga radial validada no Kit (dobradiça impressa montada)", () =>
    scoped((k) => {
      for (const hinge of [0.2, 0.3, 0.4]) {
        const { r } = rims(k, "circle", opts("bottom", hinge));
        const half = (3 * KIT_HINGE.klen + 2 * KIT_HINGE.axGap) / 2;
        expect(vol(k, r.b, cylX(k, KIT_HINGE.pinR + hinge - 0.05, -half, half, r.axisY))).toBeLessThan(1e-3);
        expect(vol(k, r.b, cylX(k, KIT_HINGE.pinR + hinge + 0.05, -half, half, r.axisY))).toBeGreaterThan(0.01);
        // o pino passa inteiro pelo nó do aro de baixo
        expect(vol(k, r.a, cylX(k, KIT_HINGE.pinR - 0.05, -KIT_HINGE.klen / 2, KIT_HINGE.klen / 2, r.axisY))).toBeGreaterThan(0.9 * Math.PI * (KIT_HINGE.pinR - 0.05) ** 2 * KIT_HINGE.klen);
      }
    }));

  test("a trava segura: fechada não encosta; ao puxar o aro de baixo meio milímetro, o gancho prende", () =>
    scoped((k) => {
      for (const side of ["top", "bottom"] as const) {
        const { r } = rims(k, "heart", opts(side));
        const pulled = k(r.b.translate([0, 0, -0.5]));
        expect(vol(k, r.latch, r.b)).toBeLessThan(1e-3);
        expect(vol(k, r.latch, pulled)).toBeGreaterThan(0.5);
      }
    }));

  test("o gancho avança o quanto a pessoa validou no Kit (trava de encaixe)", () =>
    scoped((k) => {
      const caught = (latch: number) => {
        const { r } = rims(k, "circle", opts("bottom", 0.3, latch));
        return vol(k, r.latch, k(r.b.translate([0, 0, -0.5])));
      };
      expect(caught(1.6)).toBeGreaterThan(caught(0.8));
    }));

  test("a borda da casca encaixa no rebaixo do aro e o domo não encosta no aro", () =>
    scoped((k) => {
      const { sil, r } = rims(k, "heart", opts("top"));
      const flange = k(sil.extrude(T));
      expect(vol(k, r.a, flange)).toBeLessThan(1e-3);
      expect(vol(k, r.b, k(flange.translate([0, 0, -T])))).toBeLessThan(1e-3);
      // o aro cobre a borda da casca por cima: segura e dá onde colar
      const over = k(k(k(sil.subtract(k(sil.offset(-BORDER, "Round")))).extrude(0.5)).translate([0, 0, T + 0.1]));
      expect(vol(k, r.a, over)).toBeGreaterThan(0.3 * over.volume());
      // a casca prensada (domo de 10 mm) passa pelo vão do aro
      const base = k(k(k(sil.offset(-BORDER, "Round")).offset(-5, "Round")).offset(5, "Round"));
      const dome = warpOntoDome(k(sil.extrude(T)), base, { L: inradius(base), H: 10, q: 2.2 }, k); // já vem registrada no k
      expect(vol(k, r.a, dome)).toBeLessThan(0.01);
    }));

  test("imprime numa peça só, aberta e deitada: os dois aros com o rebaixo para cima, sem se tocar", () =>
    scoped((k) => {
      const { r } = rims(k, "heart", opts("top"));
      const a = r.printA.boundingBox(), b = r.printB.boundingBox();
      expect(a.min[2]).toBeCloseTo(0, 4);
      expect(b.min[2]).toBeCloseTo(0, 4);
      expect(b.max[2]).toBeCloseTo(2 * RIM_T, 3); // o nó da dobradiça, com o eixo na altura da face de cima do aro (como no Kit)
      expect(vol(k, r.printA, r.printB)).toBeLessThan(1e-3);
      // lado a lado: cabe na mesa da A1 um coração de 70 mm
      const w = Math.max(a.max[1], b.max[1]) - Math.min(a.min[1], b.min[1]);
      expect(w).toBeLessThan(256);
    }));
});
