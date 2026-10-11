// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../../bounds";
import { getManifold } from "../../manifold";
import type { ManifoldToplevel } from "../../manifold";
import type { ModelCtx } from "../../models/common";
import { scoped } from "../../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, kitInstances } from "../index";
import { KIT_CAR } from "./kitCar";
import { KIT_TRUCK } from "./kitTruck";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (): ModelCtx => ({ M, art: null, text });
const solid = (m: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

const CASES = [
  ["carro", KIT_CAR, [{}, { length: 70, width: 30, bodyH: 9, cabinH: 12, wheelD: 14 }, { scale: 1.3, thickness: 2, fit: 0.3, spin: 0.4 }]],
  ["caminhão", KIT_TRUCK, [{}, { axlesN: 3 }, { length: 100, boxH: 20, scale: 1.2, tire: 0 }]],
] as const;

describe("kits de veículo: carro e caminhão (#kit)", { timeout: 300_000 }, () => {
  for (const [name, tpl, variants] of CASES)
    variants.forEach((v, i) => {
      test(`${name} #${i + 1}: montado sem colisão, folgas dos pares certas e rodas que giram`, () => {
        scoped((k) => {
          const { insts, build, env } = kitInstances(M, k, tpl, v);
          const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
          expect(rep.collisions, JSON.stringify(rep.collisions)).toEqual([]);
          rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b} (${q.kind}): folga ${q.gap}`).toBe(true));
          // a roda gira: o pino tem folga no furo da lateral (spin/2) e a trava aperta no pino
          const spin = Number(env.p.spin ?? 0.3);
          const pinHole = rep.pairs.filter((q) => q.kind === "pin-hole" && q.a.startsWith("lateral") && q.b.startsWith("roda"));
          expect(pinHole.length).toBe(insts.filter((q) => q.id === "roda").length);
          pinHole.forEach((q) => {
            expect(q.gap).toBeGreaterThan(spin / 2 - 0.05);
            expect(q.gap).toBeLessThan(spin / 2 + 0.05);
          });
        });
      });
    });

  for (const [name, tpl] of [["carro", KIT_CAR], ["caminhão", KIT_TRUCK]] as const)
    test(`${name}: cartão com todas as peças presas (2+ pontos de corte), cartão na mesa e montado ao lado`, () => {
      const o = buildKitTemplate(ctx(), tpl, { title: name });
      o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
      const real = o.models.filter((m) => !m.previewOnly)[0];
      const all = real.parts.map((q) => solid(q.mesh));
      expect(M.Manifold.union(all).decompose().length).toBe(1);
      const b = meshBounds(real.parts.map((q) => q.mesh))!;
      expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(256);
      expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(256);
      expect(o.models.some((m) => m.previewOnly)).toBe(true);
      expect(o.warnings!.join(" ")).toMatch(/Para montar: .*Prenda cada roda/);
      const colors = real.parts.map((q) => q.name);
      expect(colors).toEqual(expect.arrayContaining(["Cartão", "Carroceria", "Chassi", "Rodas", "Pneus", "Travas"]));
    });

  test("parâmetros de proporção e de roda mudam o modelo: roda maior, carro mais longo", () => {
    scoped((k) => {
      const a = kitInstances(M, k, KIT_CAR, {}).build.parts.find((q) => q.id === "roda")!.layers[0].cs.bounds();
      const b = kitInstances(M, k, KIT_CAR, { wheelD: 26 }).build.parts.find((q) => q.id === "roda")!.layers[0].cs.bounds();
      expect((b.max[0] - b.min[0]) / (a.max[0] - a.min[0])).toBeCloseTo(26 / 19, 2);
      const la = kitInstances(M, k, KIT_CAR, {}).build.parts.find((q) => q.id === "lateral1")!.layers[0].cs.bounds();
      const lb = kitInstances(M, k, KIT_CAR, { length: 120 }).build.parts.find((q) => q.id === "lateral1")!.layers[0].cs.bounds();
      expect((lb.max[0] - lb.min[0]) / (la.max[0] - la.min[0])).toBeCloseTo(120 / 90, 1);
    });
  });

  test("caminhão com 3 eixos tem 6 rodas e 6 travas", () => {
    scoped((k) => {
      const kb = kitInstances(M, k, KIT_TRUCK, { axlesN: 3 }).build;
      expect(kb.parts.find((q) => q.id === "roda")!.count).toBe(6);
      expect(kb.parts.find((q) => q.id === "trava")!.count).toBe(6);
    });
  });

  /** Centro de massa de um sólido (teorema da divergência sobre a malha). */
  const centroid = (m: { positions: Float32Array; indices: Uint32Array }) => {
    let v = 0;
    const c = [0, 0, 0];
    const p = m.positions;
    for (let i = 0; i < m.indices.length; i += 3) {
      const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, d = m.indices[i + 2] * 3;
      const vol = (p[a] * (p[b + 1] * p[d + 2] - p[b + 2] * p[d + 1]) - p[a + 1] * (p[b] * p[d + 2] - p[b + 2] * p[d]) + p[a + 2] * (p[b] * p[d + 1] - p[b + 1] * p[d])) / 6;
      v += vol;
      for (let k = 0; k < 3; k++) c[k] += (vol * (p[a + k] + p[b + k] + p[d + k])) / 4;
    }
    return c.map((x) => x / v);
  };
  const assembled = (tpl: typeof KIT_CAR, v: Record<string, number>) =>
    scoped((k) => {
      const { insts, build, env } = kitInstances(M, k, tpl, v);
      const sol = assemblySolids(M, k, insts, build.assembly).map((q) => {
        const whole = q.colors.size > 1 ? k(M.Manifold.union([...q.colors.values()])) : [...q.colors.values()][0];
        const mesh = whole.getMesh();
        const box = whole.boundingBox();
        return { name: q.name, id: q.id, box, c: centroid({ positions: Float32Array.from(mesh.vertProperties), indices: Uint32Array.from(mesh.triVerts) }) };
      });
      return { sol, Wi: Number(env.p.width) * env.scale, t: env.t };
    });

  for (const [name, tpl, variants] of CASES)
    variants.forEach((v, i) => {
      test(`${name} #${i + 1}: as rodas ficam POR FORA das laterais (|y| do centro maior que a meia largura do corpo)`, () => {
        const { sol, Wi, t } = assembled(tpl, v);
        const wheels = sol.filter((q) => q.id === "roda");
        expect(wheels.length).toBeGreaterThanOrEqual(4);
        for (const w of wheels) expect(Math.abs(w.c[1]), `${w.name} (centro y ${w.c[1].toFixed(2)})`).toBeGreaterThan(Wi / 2 + t / 2);
      });

      test(`${name} #${i + 1}: simétrico esquerda/direita (laterais, rodas e travas espelhadas em y = 0)`, () => {
        const { sol } = assembled(tpl, v);
        const by = (n: string) => sol.find((q) => q.name === n)!;
        const mirrored = (a: ReturnType<typeof by>, b: ReturnType<typeof by>) => {
          expect(a.box.min[0]).toBeCloseTo(b.box.min[0], 2);
          expect(a.box.max[0]).toBeCloseTo(b.box.max[0], 2);
          expect(a.box.min[2]).toBeCloseTo(b.box.min[2], 2);
          expect(a.box.max[2]).toBeCloseTo(b.box.max[2], 2);
          expect(a.box.min[1]).toBeCloseTo(-b.box.max[1], 2);
          expect(a.box.max[1]).toBeCloseTo(-b.box.min[1], 2);
          expect(a.c[0]).toBeCloseTo(b.c[0], 1);
          expect(a.c[1]).toBeCloseTo(-b.c[1], 1);
          expect(a.c[2]).toBeCloseTo(b.c[2], 1);
        };
        mirrored(by("lateral1"), by("lateral2"));
        for (const id of ["roda", "trava"]) {
          const list = sol.filter((q) => q.id === id);
          for (let n = 0; n < list.length; n += 2) mirrored(list[n], list[n + 1]); // 1 e 2, 3 e 4, ...: direita e esquerda do mesmo eixo
        }
        // as placas e paredes do meio são simétricas em y
        for (const q of sol.filter((x) => !["lateral1", "lateral2", "roda", "trava"].includes(x.id))) {
          expect(q.box.min[1], q.name).toBeCloseTo(-q.box.max[1], 2);
          expect(q.c[1], q.name).toBeCloseTo(0, 1);
        }
      });
    });

  test("carro: as rodas não passam por cima do capô nem do porta-malas (topo da roda abaixo das placas)", () => {
    for (const v of [{}, { wheelD: 28 }, { wheelD: 14, bodyH: 8 }] as Record<string, number>[]) {
      const { sol } = assembled(KIT_CAR, v);
      const wheelTop = Math.max(...sol.filter((q) => q.id === "roda").map((q) => q.box.max[2]));
      for (const id of ["capo", "malas"]) expect(wheelTop, `${id} com ${JSON.stringify(v)}`).toBeLessThanOrEqual(sol.find((q) => q.id === id)!.box.min[2] + 1e-6);
    }
  });
});
