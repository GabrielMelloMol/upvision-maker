// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../../bounds";
import { getManifold, type ManifoldToplevel } from "../../manifold";
import type { ModelCtx } from "../../models/common";
import { scoped } from "../../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, kitInstances, type KitParams } from "../index";
import { tractorKit } from "./tractor";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (): ModelCtx => ({ M, art: null, text });

describe("Trator de montar", { timeout: 120_000 }, () => {
  test.each<KitParams>([{}, { scale: 0.75 }, { length: 60 }, { scale: 2 }, { thickness: 2, fit: 0.3 }, { wheelsSpin: true, chimney: false }, { lugs: 18 }])("montado sem colisão e com as folgas dos pares (%j)", (params) => {
    scoped((k) => {
      const { insts, build, env } = kitInstances(M, k, tractorKit, params);
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
      expect(rep.collisions).toEqual([]);
      rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b}: folga ${q.gap}`).toBe(true));
      expect(rep.pairs.length).toBe(params.chimney === false ? 10 + 4 : 10 + 1 + 4);
    });
  });

  test("11 peças inteiras, presas à moldura, rodas de trás maiores que as da frente, e o montado tem o comprimento pedido", () => {
    const o = buildKitTemplate(ctx(), tractorKit, { showAssembled: true, title: "Trator" });
    expect(o.meta!.pieces).toBe(2 + 5 + 1 + 4);
    o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
    const card = meshBounds(o.models[0].parts.map((q) => q.mesh))!;
    expect(card.max[0] - card.min[0]).toBeLessThanOrEqual(256);
    scoped((k) => {
      const { insts, build } = kitInstances(M, k, tractorKit, {});
      for (const q of insts) {
        const cs = M.CrossSection.union(q.part.layers.map((l) => l.cs));
        expect(cs.decompose().length, `${q.id} em um pedaço só`).toBe(1);
        cs.delete();
      }
      const size = (id: string) => {
        const b = insts.find((q) => q.id === id)!.part.layers[0].cs.bounds();
        return b.max[0] - b.min[0];
      };
      expect(size("rodaTras")).toBeGreaterThan(1.7 * size("rodaFrente"));
      expect(size("rodaTras")).toBeCloseTo(0.44 * 90, 0);
      const sol = assemblySolids(M, k, insts, build.assembly);
      const xs = sol.flatMap((s) => [...s.colors.values()].map((v) => v.boundingBox()));
      const len = Math.max(...xs.map((b) => b.max[0])) - Math.min(...xs.map((b) => b.min[0]));
      expect(len).toBeGreaterThan(85);
      expect(len).toBeLessThan(97);
    });
  });

  test("as rodas tocam o chão na mesma altura (z mínimo igual) e giram com folga maior quando pedido", () => {
    scoped((k) => {
      const low = (params: KitParams) => {
        const { insts, build } = kitInstances(M, k, tractorKit, params);
        return assemblySolids(M, k, insts, build.assembly).filter((s) => s.id.startsWith("roda")).map((s) => Math.min(...[...s.colors.values()].map((v) => v.boundingBox().min[2])));
      };
      const z = low({});
      z.forEach((v) => expect(v).toBeCloseTo(0, 0));
      const hole = (spin: boolean) => kitInstances(M, k, tractorKit, { wheelsSpin: spin }).insts.find((q) => q.id === "lateral")!.part.layers[0].cs.area();
      expect(hole(true)).toBeLessThan(hole(false));
    });
  });

  test("uma peça fora do lugar é achada pela conferência (o teste de colisão morde)", () => {
    scoped((k) => {
      const { insts, build, env } = kitInstances(M, k, tractorKit, {});
      const moved = build.assembly.map((pl) => (pl.part === "teto" ? { ...pl, translate: pl.translate.map((v, i) => v + [0, 0, -4][i]) as [number, number, number] } : pl));
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, moved), build.pairs ?? [], env.fit);
      expect(rep.collisions.length > 0 || rep.pairs.some((q) => !q.ok)).toBe(true);
    });
  });
});
