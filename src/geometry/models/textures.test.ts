import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { BG_TEXTURES, recessTexture, texturePattern } from "./textures";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const plate = () => M.CrossSection.square([60, 40], true);

describe("texturas de fundo (#50)", () => {
  test.each(BG_TEXTURES.filter(([k]) => k !== "none").map(([k]) => k))("%s: cobre parte da área e fica dentro do contorno", (kind) => {
    const region = plate();
    const pat = texturePattern(M, region, kind, 6)!;
    const frac = pat.area() / region.area();
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.8);
    const b = pat.bounds();
    expect(b.min[0]).toBeGreaterThanOrEqual(-30 - 1e-6);
    expect(b.max[1]).toBeLessThanOrEqual(20 + 1e-6);
  });

  test("liso não gera padrão", () => {
    expect(texturePattern(M, plate(), "none", 6)).toBeNull();
  });

  test("rebaixo tira volume só do topo, na profundidade pedida", () => {
    const region = plate();
    const block = region.extrude(3);
    const cut = recessTexture(M, block, region, 3, "checker", 5, 0.6);
    const removed = block.volume() - cut.volume();
    const pat = texturePattern(M, region, "checker", 5)!;
    expect(removed).toBeCloseTo(pat.area() * 0.6, 0);
    expect(cut.boundingBox().max[2]).toBeCloseTo(3);
    expect(recessTexture(M, block, region, 3, "none", 5, 0.6).volume()).toBeCloseTo(block.volume());
  });
});
