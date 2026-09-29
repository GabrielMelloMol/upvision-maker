import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type CS, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import { buildLogoPlate, DEFAULT_ADAPTIVE_PLATE } from "./logoPlate";
import { buildPixPlate, DEFAULT_PIX_PLATE } from "./pixPlate";
import { buildSignPlate, DEFAULT_SIGN_PLATE } from "./signPlate";
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

describe("textura nas placas (#50)", { timeout: 30_000 }, () => {
  const ctx = (art: CS | null = null) => ({ M, art, text: (s: string, h: number) => (s.trim() ? M.CrossSection.square([0.6 * h * s.length, h], true) : null) });
  const vol = (m: Mesh) => {
    const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
    const v = s.volume();
    s.delete();
    return v;
  };

  test("placa de sinalização, adaptável e Pix: a placa perde volume só com textura", () => {
    const cases: [string, (t: "none" | "dots") => Mesh][] = [
      ["sinalização", (t) => buildSignPlate(ctx(), { ...DEFAULT_SIGN_PLATE, texture: t }).models[0].parts[0].mesh],
      ["adaptável", (t) => buildLogoPlate(ctx(M.CrossSection.circle(10, 64)), { ...DEFAULT_ADAPTIVE_PLATE, texture: t }).models[0].parts[0].mesh],
      ["pix", (t) => buildPixPlate(ctx(), { ...DEFAULT_PIX_PLATE, key: "a@b.com", name: "Ana", city: "Rio", texture: t }).models[0].parts[0].mesh],
    ];
    for (const [name, build] of cases) expect(vol(build("dots")), name).toBeLessThan(vol(build("none")) - 5);
  });

  test("Pix: nada de textura embaixo do QR", () => {
    const p = { ...DEFAULT_PIX_PLATE, key: "a@b.com", name: "Ana", city: "Rio", title: "", subtitle: "", stand: false };
    const plate = (t: "none" | "checker") => {
      const m = buildPixPlate(ctx(), { ...p, texture: t }).models[0].parts[0].mesh;
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
      // fatia só a área do QR (sem título e subtítulo, o QR fica no centro)
      const q = p.width * 0.84;
      const box = M.Manifold.cube([q - 1, q - 1, 20], true);
      const v = s.intersect(box).volume();
      [s, box].forEach((o) => o.delete());
      return v;
    };
    expect(plate("checker")).toBeCloseTo(plate("none"), 0);
  });
});
