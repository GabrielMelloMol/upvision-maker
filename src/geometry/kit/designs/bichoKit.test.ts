// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import type { CS, ManifoldToplevel } from "../../manifold";
import { getManifold } from "../../manifold";
import type { ModelCtx } from "../../models/common";
import { scoped } from "../../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, kitInstances } from "../index";
import { bichoTemplate } from "./bichoKit";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: CS | null = null): ModelCtx => ({ M, art, text });

const VARIANTS: { name: string; p: Record<string, string | number> }[] = [
  { name: "padrão", p: {} },
  { name: "gato, cauda curta, 6 fatias", p: { head: "cat", tail: "short", slices: 6 } },
  { name: "dinossauro, quase retangular, 2 fatias", p: { head: "dino", profile: "boxy", slices: 2, length: 110 } },
  { name: "pequeno", p: { length: 50, tail: "up" } },
];

describe("kit bicho de 4 patas", { timeout: 120_000 }, () => {
  test.each(VARIANTS)("$name: montado sem colisão, folgas dos pares dentro do esperado", ({ p }) =>
    scoped((k) => {
      const { insts, build, env } = kitInstances(M, k, bichoTemplate, p);
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
      expect(rep.collisions).toEqual([]);
      rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b}: folga ${q.gap}`).toBe(true));
    }));

  test.each(VARIANTS)("$name: o cartão sai, cada peça numerada e presa por 2+ pontos de corte", ({ p }) => {
    const o = buildKitTemplate(ctx(), bichoTemplate, { showAssembled: false, ...p });
    o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
    const n = Number(p.slices ?? 4);
    expect(o.meta!.pieces).toBe(n + 3); // coluna, N fatias, cabeça, cauda
    expect(o.warnings!.join(" ")).toMatch(/Para montar/);
  });

  test("fatias demais para o comprimento: usa as que cabem e avisa", () => {
    const o = buildKitTemplate(ctx(), bichoTemplate, { showAssembled: false, length: 120, slices: 6 });
    expect(o.meta!.pieces).toBe(4 + 3);
    expect(o.warnings!.join(" ")).toMatch(/só cabem 4 fatias/);
  });

  test("a mesma montagem sai com bico de 0,2 e 0,6", () => {
    for (const w of [0.2, 0.6]) scoped((k) => expect(() => kitInstances(M, k, bichoTemplate, { fit: w })).not.toThrow());
  });
});
