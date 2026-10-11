import { beforeAll, describe, expect, test } from "vitest";
import type { ManifoldToplevel } from "../../manifold";
import { getManifold } from "../../manifold";
import { scoped } from "../../shape2d";
import { BICHO_LIMITS, DEFAULT_BICHO, bichoDims, bichoHead, bichoRib, bichoSpine, bichoTail, type BichoParams, type Env } from "./bicho";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const NOZZLES = [0.2, 0.4, 0.6];
const LENGTHS = [BICHO_LIMITS.length[0], 80, BICHO_LIMITS.length[1]];
const env = (k: Env["k"], nozzle = 0.4, t = 1.6, fit = 0.2): Env => ({ M, k, t, fit, nozzle });

/** Fração da área que some ao abrir pelo raio `r`: traços mais finos que 2r. */
const thinShare = (cs: ReturnType<Env["M"]["CrossSection"]["square"]>, r: number) =>
  scoped((k) => 1 - k(k(cs.offset(-r, "Miter")).offset(r, "Miter")).area() / cs.area());

describe("bicho de 4 patas: peças", () => {
  test.each(LENGTHS)("comprimento %i: cada peça é uma região única e não vazia", (length) =>
    scoped((k) => {
      const p: BichoParams = { ...DEFAULT_BICHO, length };
      const e = env(k);
      const parts = { coluna: bichoSpine(e, p), perna: bichoRib(e, p, true), corpo: bichoRib(e, p, false), cabeca: bichoHead(e, p), cauda: bichoTail(e, p) };
      for (const [name, cs] of Object.entries(parts)) {
        k(cs);
        expect(cs.area(), name).toBeGreaterThan(5);
        expect(cs.decompose().map(k).length, `${name} em pedaços`).toBe(1);
      }
    }));

  test("coluna: uma fenda por fatia, aberta por baixo, com a largura da folga", () =>
    scoped((k) => {
      const e = env(k);
      const d = bichoDims(DEFAULT_BICHO, e);
      const spine = k(bichoSpine(e, DEFAULT_BICHO));
      expect(d.ribs).toHaveLength(DEFAULT_BICHO.slices);
      for (const r of d.ribs) {
        // dentro da fenda não há material; um pouco ao lado, há
        const slot = k(M.CrossSection.square([d.s - 0.1, d.H / 2 - 0.2]).translate([r.x - (d.s - 0.1) / 2, 0.1]));
        expect(k(spine.intersect(slot)).area()).toBeLessThan(1e-6);
        const wall = k(M.CrossSection.square([0.5, d.H / 2]).translate([r.x + d.s / 2 + 0.1, 0.1]));
        expect(k(spine.intersect(wall)).area()).toBeGreaterThan(1);
      }
    }));

  test("fatia: fenda por cima com a mesma largura, só a de perna tem pernas, e a barriga da coluna passa pelo vão", () =>
    scoped((k) => {
      const e = env(k);
      const d = bichoDims(DEFAULT_BICHO, e);
      const leg = k(bichoRib(e, DEFAULT_BICHO, true)), body = k(bichoRib(e, DEFAULT_BICHO, false));
      expect(leg.bounds().min[1]).toBeCloseTo(0, 5);
      expect(body.bounds().min[1]).toBeCloseTo(d.P, 1);
      expect(leg.area()).toBeGreaterThan(body.area());
      const slot = k(M.CrossSection.square([d.s - 0.1, d.H / 2 - 0.2]).translate([-(d.s - 0.1) / 2, d.P + d.H / 2 + 0.1]));
      expect(k(body.intersect(slot)).area()).toBeLessThan(1e-6);
    }));

  test.each(["dog", "cat", "dino"] as const)("cabeça %s e cauda: a espiga entra no soquete com folga, sem encostar", (head) =>
    scoped((k) => {
      const p: BichoParams = { ...DEFAULT_BICHO, head };
      const e = env(k);
      const d = bichoDims(p, e);
      const spine = k(bichoSpine(e, p));
      const wall = Math.max(3, 2.5 * e.nozzle);
      const clearance = 0.05; // metade da folga de projeto (0,15 por lado)
      const placed = [
        [bichoHead(e, p), d.L - (d.headSock.base + 2 * wall) / 2, d.H + 0.08 * d.L],
        [bichoTail(e, p), (d.tailSock.base + 2 * wall) / 2, d.H + 0.04 * d.L],
      ] as const;
      for (const [cs, x, y] of placed) {
        const part = k(k(cs).translate([x, y]));
        const spigot = k(part.intersect(k(M.CrossSection.square([400, y - 0.1])))); // só o que desce no soquete
        expect(spigot.area(), "a espiga desce abaixo da boca").toBeGreaterThan(10);
        expect(k(k(spigot.offset(clearance, "Miter")).intersect(spine)).area(), "encosta na coluna").toBeLessThan(1e-6);
      }
    }));

  test.each(NOZZLES)("bico %s: nenhum traço mais fino que 2× o bico em nenhuma peça", (nozzle) =>
    scoped((k) => {
      const p = DEFAULT_BICHO;
      const e = env(k, nozzle);
      const parts = { coluna: bichoSpine(e, p), perna: bichoRib(e, p, true), corpo: bichoRib(e, p, false), cabeca: bichoHead(e, p), cauda: bichoTail(e, p) };
      for (const [name, cs] of Object.entries(parts)) expect(thinShare(k(cs), nozzle), name).toBeLessThan(0.02);
    }));

  test("fatias: 2 a 6; com 2 só há as de perna", () => {
    const e = { t: 1.6, fit: 0.2 };
    expect(bichoDims({ ...DEFAULT_BICHO, slices: 2 }, e).ribs.every((r) => r.leg)).toBe(true);
    const six = bichoDims({ ...DEFAULT_BICHO, slices: 6 }, e).ribs;
    expect(six).toHaveLength(6);
    expect(six.filter((r) => r.leg)).toHaveLength(2);
    expect(six.map((r) => r.x)).toEqual([...six.map((r) => r.x)].sort((a, b) => a - b));
  });
});
