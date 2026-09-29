import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { ModelCtx } from "./common";
import { buildPetTag, DEFAULT_PET_TAG as D, type PetShape } from "./petTag";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const tag = (shape: PetShape, art: ModelCtx["art"] = null) => buildPetTag(ctx(art), { ...D, shape }).models[0];
/** Quantos pedaços separados a tag tem (precisa ser 1). */
const pieces = (shape: PetShape, art: ModelCtx["art"] = null) => {
  const m = tag(shape, art).parts[0].mesh;
  const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
  const n = s.decompose().length;
  s.delete();
  return n;
};

describe("tag de pet: formatos novos (#70)", { timeout: 30_000 }, () => {
  test.each(["oval", "wavy", "fish"] as PetShape[])("%s: uma peça só, com argola, na largura pedida", (shape) => {
    expect(pieces(shape)).toBe(1);
    const b = meshBounds([tag(shape).parts[0].mesh])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(D.size, 0);
    expect(tag(shape).parts.map((q) => q.name)).toEqual(["Tag", "Nome", "Verso"]);
  });

  test("oval é mais larga que alta; peixe tem o rabo de um lado só", () => {
    const o = meshBounds([tag("oval").parts[0].mesh])!;
    expect(o.max[0] - o.min[0]).toBeGreaterThan((o.max[1] - o.min[1]) * 1.1);
    // peixe: o rabo é fino, então há menos volume no lado dele (direita) que no do corpo
    const rightShare = (shape: PetShape) => {
      const m = tag(shape).parts[0].mesh;
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
      const right = M.Manifold.cube([100, 200, 50]).translate([0, -100, -10]);
      const share = s.intersect(right).volume() / s.volume();
      [s, right].forEach((o) => o.delete());
      return share;
    };
    expect(rightShare("oval")).toBeCloseTo(0.5, 1);
    expect(rightShare("fish")).toBeLessThan(rightShare("oval") - 0.03);
  });

  test("formato por desenho: usa o contorno enviado; sem desenho, prévia vazia", () => {
    expect(pieces("art", M.CrossSection.circle(10, 64))).toBe(1);
    expect(() => tag("art")).toThrow("Envie o desenho do formato");
  });
});
