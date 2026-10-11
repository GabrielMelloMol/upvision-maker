// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold } from "../../manifold";
import type { ManifoldToplevel } from "../../manifold";
import { scoped } from "../../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, kitInstances } from "../index";
import type { ModelCtx } from "../../models/common";
import type { KitParams, KitTemplate } from "../types";
import { AVIAO } from "./aviao";
import { HELICOPTERO } from "./helicoptero";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const CASES: [KitTemplate, KitParams, number][] = [
  [AVIAO, { blades: 2 }, 12],
  [AVIAO, { blades: 3 }, 12],
  [AVIAO, { scale: 0.8, thickness: 1.4 }, 12],
  [HELICOPTERO, { rotorBlades: 2 }, 10],
  [HELICOPTERO, { rotorBlades: 3 }, 10],
  [HELICOPTERO, { scale: 0.8, thickness: 1.4 }, 10],
];

describe("kits de avião e helicóptero", { timeout: 120_000 }, () => {
  for (const [tpl, params, pairs] of CASES) {
    test(`${tpl.label} ${JSON.stringify(params)}: montado sem colisão e com os encaixes na folga certa`, () => {
      scoped((k) => {
        const { insts, build, env } = kitInstances(M, k, tpl, params);
        const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
        expect(rep.collisions).toEqual([]);
        rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b}: folga ${q.gap}`).toBe(true));
        expect(rep.pairs.length).toBeGreaterThanOrEqual(pairs);
      });
    });
  }

  for (const tpl of [AVIAO, HELICOPTERO]) {
    test(`${tpl.label}: cartão com cada peça presa por 2+ pontos de corte, tudo ligado e que cabe na mesa`, () => {
      const text = (str: string, h: number) => (str.trim() ? M.CrossSection.square([h * 0.5 * [...str.trim()].length, h], true) : null);
      const ctx: ModelCtx = { M, art: null, text };
      const o = buildKitTemplate(ctx, tpl, { showAssembled: false, title: tpl.label });
      o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
      const solids = o.models[0].parts.map((q) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: q.mesh.positions, triVerts: q.mesh.indices })));
      expect(M.Manifold.union(solids).decompose().length).toBe(1);
      expect(Math.max(o.meta!.card.w, o.meta!.card.h)).toBeLessThanOrEqual(256);
      expect(o.warnings!.join(" ")).not.toMatch(/mais finas que o bico|menos de 2 pontos/);
    });
  }

  test("as abas passam 0,4 mm ou mais da face de fora das laterais (o encaixe se vê e se aperta)", () => {
    scoped((k) => {
      for (const [tpl, sideY] of [[AVIAO, 5.5], [HELICOPTERO, 11]] as const) {
        const { insts, build, env } = kitInstances(M, k, tpl, {});
        const sol = assemblySolids(M, k, insts, build.assembly);
        const ribs = sol.filter((s) => /caverna|anteparo/.test(s.id));
        expect(ribs.length).toBeGreaterThan(0);
        for (const r of ribs) {
          const b = [...r.colors.values()][0].boundingBox();
          expect(b.max[1], r.name).toBeGreaterThanOrEqual(sideY + env.t / 2 + 0.4);
        }
      }
    });
  });
});
