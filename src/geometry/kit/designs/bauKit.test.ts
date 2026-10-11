// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import type { CS, ManifoldToplevel } from "../../manifold";
import { getManifold } from "../../manifold";
import type { ModelCtx } from "../../models/common";
import { scoped } from "../../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, kitInstances } from "../index";
import { BAU_SIZES } from "./bau";
import { bauTemplate } from "./bauKit";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: CS | null = null): ModelCtx => ({ M, art, text });

const VARIANTS = [
  { name: "pequeno", p: BAU_SIZES.small },
  { name: "médio", p: BAU_SIZES.medium },
  { name: "grande", p: BAU_SIZES.large },
  { name: "pino de 4 mm, espessura 2", p: { ...BAU_SIZES.medium, pin: "4", thickness: 2 } },
];

describe("kit baú", { timeout: 180_000 }, () => {
  test.each(VARIANTS)("$name: montado sem colisão e com as folgas dos pares certas", ({ p }) =>
    scoped((k) => {
      const { insts, build, env } = kitInstances(M, k, bauTemplate, p);
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
      expect(rep.collisions).toEqual([]);
      rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b}: folga ${q.gap}`).toBe(true));
    }));

  test.each(VARIANTS)("$name: o cartão sai, cada peça numerada e presa por 2+ pontos de corte", ({ p }) => {
    const o = buildKitTemplate(ctx(), bauTemplate, { showAssembled: false, ...p });
    o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
    expect(o.meta!.pieces).toBe(2 + 2 + 1 + 1 + 1 + 2 + 2); // 11
    expect(o.warnings!.join(" ")).toMatch(/Para montar/);
  });
});
