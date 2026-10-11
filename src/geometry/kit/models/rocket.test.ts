// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../../bounds";
import { getManifold, type ManifoldToplevel } from "../../manifold";
import type { ModelCtx } from "../../models/common";
import { scoped } from "../../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, kitInstances, type KitParams } from "../index";
import { rocketKit } from "./rocket";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (): ModelCtx => ({ M, art: null, text });

describe("Foguete de montar", { timeout: 120_000 }, () => {
  test.each<KitParams>([{}, { scale: 0.7 }, { height: 100, finSpan: 60 }, { thickness: 2, fit: 0.3 }, { windows: false, height: 145 }, { scale: 2 }])("montado sem colisão e com as folgas dos pares (%j)", (params) => {
    scoped((k) => {
      const { insts, build, env } = kitInstances(M, k, rocketKit, params);
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
      expect(rep.collisions).toEqual([]);
      expect(rep.pairs.length).toBe(3 + 4 + 2);
      rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b}: folga ${q.gap}`).toBe(true));
    });
  });

  test("7 peças, cada uma de um sólido só, o foguete tem a altura pedida e o cartão cabe na mesa", () => {
    const o = buildKitTemplate(ctx(), rocketKit, { showAssembled: true, title: "Foguete" });
    expect(o.meta!.pieces).toBe(7);
    o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
    const card = meshBounds(o.models[0].parts.map((q) => q.mesh))!;
    expect(card.max[0] - card.min[0]).toBeLessThanOrEqual(256);
    const asm = o.models.find((m) => m.previewOnly)!;
    const ab = meshBounds(asm.parts.map((q) => q.mesh))!;
    expect(ab.max[2] - ab.min[2]).toBeCloseTo(140, 0);
    scoped((k) => {
      const { insts } = kitInstances(M, k, rocketKit, {});
      for (const q of insts) {
        const cs = M.CrossSection.union(q.part.layers.map((l) => l.cs));
        expect(cs.decompose().length, `${q.id} em um pedaço só`).toBe(1);
        cs.delete();
      }
    });
  });

  test("estágios têm cores próprias e as aletas outra", () => {
    const o = buildKitTemplate(ctx(), rocketKit, { showAssembled: false, c_s2: "#00ff00", c_fin: "#ff00ff" });
    const col = Object.fromEntries(o.models[0].parts.map((q) => [q.name, q.color]));
    expect(col).toMatchObject({ "Estágio 2": "#00ff00", Aletas: "#ff00ff" });
    expect(Object.keys(col)).toEqual(expect.arrayContaining(["Estágio 1", "Bico", "Base de lançamento"]));
  });

  test("uma peça fora do lugar é achada pela conferência (o teste de colisão morde)", () => {
    scoped((k) => {
      const { insts, build, env } = kitInstances(M, k, rocketKit, {});
      const moved = build.assembly.map((pl) => (pl.part === "a2" ? { ...pl, translate: pl.translate.map((v, i) => v + [0, 0.8, 0][i]) as [number, number, number] } : pl));
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, moved), build.pairs ?? [], env.fit);
      expect(rep.collisions.length > 0 || rep.pairs.some((q) => !q.ok)).toBe(true);
    });
  });
});
