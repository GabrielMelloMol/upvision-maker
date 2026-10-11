import { beforeAll, describe, expect, test } from "vitest";
import type { CS, ManifoldToplevel } from "../../manifold";
import { getManifold } from "../../manifold";
import { scoped } from "../../shape2d";
import type { Env } from "./bicho";
import { BAU_SIZES, DEFAULT_BAU, bauDims, bauPanels } from "./bau";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const env = (k: Env["k"], nozzle = 0.4, t = 1.6, fit = 0.2): Env => ({ M, k, t, fit, nozzle });
const sq = (x0: number, y0: number, x1: number, y1: number) => M.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);
const SIZES = Object.entries(BAU_SIZES).map(([n, s]) => [n, { ...DEFAULT_BAU, ...s }] as const);
const thinShare = (cs: CS, r: number) => scoped((k) => 1 - k(k(cs.offset(-r, "Miter")).offset(r, "Miter")).area() / cs.area());
const all = (b: ReturnType<typeof bauPanels>) => Object.entries({ ...Object.fromEntries(Object.entries(b.box).map(([n, c]) => [`caixa ${n}`, c])), ...Object.fromEntries(Object.entries(b.lid).map(([n, c]) => [`tampa ${n}`, c])) }).filter((e): e is [string, CS] => e[1] !== null);

describe("baú: peças", () => {
  test.each(SIZES)("%s: toda peça é uma região única e a tampa não tem parede de trás", (_n, p) =>
    scoped((k) => {
      const parts = bauPanels(env(k), p);
      expect(parts.box.back).not.toBeNull();
      expect(parts.lid.back).toBeNull();
      for (const [name, cs] of all(parts)) {
        k(cs);
        expect(cs.area(), name).toBeGreaterThan(20);
        expect(cs.decompose().map(k).length, `${name} em pedaços`).toBe(1);
      }
    }));

  test("abas e fendas: a fenda da lateral é maior que a aba (espessura + folga) e não passa 0,3 mm disso", () =>
    scoped((k) => {
      const e = env(k);
      const d = bauDims(DEFAULT_BAU, e);
      const { box } = bauPanels(e, DEFAULT_BAU);
      k(box.side);
      const tabH = Math.min(12, Math.max(6, 0.22 * d.H));
      const v = 0.28 * d.H;
      for (const sd of [-1, 1]) {
        const cx = sd * (d.D / 2 + e.t / 2);
        const tab = k(sq(cx - e.t / 2, v - tabH / 2, cx + e.t / 2, v + tabH / 2));
        expect(k(box.side.intersect(tab)).area(), "a aba cabe na fenda").toBeLessThan(1e-9);
        const loose = k(sq(cx - e.t / 2 - 0.3, v - tabH / 2 - 0.3, cx + e.t / 2 + 0.3, v + tabH / 2 + 0.3));
        expect(k(box.side.intersect(loose)).area(), "a fenda não é folgada demais").toBeGreaterThan(0);
      }
    }));

  test("piso: abas em x e y, e fendas do piso na frente, no fundo e nas laterais com folga", () =>
    scoped((k) => {
      const e = env(k);
      const d = bauDims(DEFAULT_BAU, e);
      const { box } = bauPanels(e, DEFAULT_BAU);
      const b = box.plate.bounds();
      expect(b.max[0] - b.min[0]).toBeCloseTo(d.W + 2 * e.t, 5);
      expect(b.max[1] - b.min[1]).toBeCloseTo(d.D + 2 * e.t, 5);
      const slot = (cx: number) => k(sq(cx - 5, 2 + 0.05, cx + 5, 2 + e.t - 0.05));
      for (const cx of [-d.W / 4, d.W / 4]) expect(k(box.front.intersect(slot(cx))).area()).toBeLessThan(1e-9);
      for (const cx of [-d.D / 4, d.D / 4]) expect(k(box.side.intersect(slot(cx))).area()).toBeLessThan(1e-9);
    }));

  test("dobradiça: furo (⌀ do pino + folga) na lateral da caixa e na da tampa, no mesmo ponto depois de alinhadas", () =>
    scoped((k) => {
      const e = env(k);
      const d = bauDims(DEFAULT_BAU, e);
      const { box, lid } = bauPanels(e, DEFAULT_BAU);
      const overlap = d.hl - 2 - e.t; // a tampa fechada: a origem dela fica `overlap` abaixo da borda da caixa
      const boxPivot = { u: d.hingeU, z: d.hingeV }, lidPivot = { u: d.hingeU, z: d.H - overlap + d.lidHingeV };
      expect(lidPivot.z).toBeCloseTo(boxPivot.z, 9);
      for (const [side, v] of [[box.side, d.hingeV], [lid.side, d.lidHingeV]] as const) {
        k(side);
        const pin = k(M.CrossSection.circle(d.pr, 32).translate([d.hingeU, v]));
        expect(k(side.intersect(pin)).area(), "o pino passa").toBeLessThan(1e-9);
        const bigger = k(M.CrossSection.circle(d.pr + 0.45, 32).translate([d.hingeU, v]));
        expect(k(side.intersect(bigger)).area(), "o furo não é folgado demais").toBeGreaterThan(0);
        expect(k(side.intersect(k(M.CrossSection.circle(d.lug - 0.05, 40).translate([d.hingeU, v])).subtract(bigger))).area(), "tem material em volta do furo").toBeGreaterThan(5);
      }
    }));

  test.each([0, 15, 30, 45, 60, 75, 90, 100])("a tampa gira %i° sem bater no fundo da caixa", (deg) =>
    scoped((k) => {
      const e = env(k);
      const d = bauDims(DEFAULT_BAU, e);
      // vista de lado (y horizontal, z para cima): fundo da caixa e as peças da tampa que ficam em y > ... giradas ao redor do eixo
      const yh = d.hingeU, zh = d.hingeV;
      const rearWall = k(sq(d.D / 2, 0, d.D / 2 + e.t, d.H));
      const plate = k(sq(-d.lid.D / 2, d.H, d.lid.D / 2, d.H + e.t));
      const frontWall = k(sq(-d.lid.D / 2 - e.t, d.H - (d.hl - 2 - e.t), -d.lid.D / 2, d.H + e.t));
      for (const [name, cs] of [["topo", plate], ["frente", frontWall]] as const) {
        const turned = k(k(k(cs.translate([-yh, -zh])).rotate(-deg)).translate([yh, zh])); // abrir = a frente sobe
        expect(k(turned.intersect(rearWall)).area(), `${name} a ${deg}°`).toBeLessThan(1e-6);
      }
    }));

  test.each([0.2, 0.4, 0.6])("bico %s: nenhum traço mais fino que 2× o bico", (nozzle) =>
    scoped((k) => {
      for (const [name, cs] of all(bauPanels(env(k, nozzle), DEFAULT_BAU))) expect(thinShare(k(cs), nozzle), name).toBeLessThan(0.02);
    }));

  test("pino: raio e comprimento atravessam as duas orelhas", () => {
    const d = bauDims({ ...DEFAULT_BAU, pin: 4 }, { t: 1.6, fit: 0.2 });
    expect(d.pr).toBe(2);
    expect(d.pinLen).toBeGreaterThanOrEqual(2 * 1.6 + 0.3);
  });
});
