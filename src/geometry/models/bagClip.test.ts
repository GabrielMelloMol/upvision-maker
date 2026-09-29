import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh } from "../types";
import { bagClipProfile, buildBagClip, DEFAULT_BAG_CLIP } from "./bagClip";
import type { ModelCtx } from "./common";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, artLayers: null, text: () => null });
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const p = DEFAULT_BAG_CLIP;

/** Vão entre as hastes medido numa linha vertical em x. */
function gapAt(x: number): number {
  const clip = solid(buildBagClip(ctx(), p).models[0].parts[0].mesh);
  const probe = (h: number) => clip.intersect(M.Manifold.cube([0.2, h, 4], true).translate([x, 0, p.height / 2])).volume() < 1e-4;
  let lo = 0, hi = 30;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (probe(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

describe("clipe de saco (#25)", () => {
  test("sem desenho já gera o clipe (coração padrão) e a arte não é branca", () => {
    const { models } = buildBagClip(ctx(), p);
    expect(models[0].parts.map((x) => x.name)).toEqual(["Clipe", "Arte"]);
    expect(p.artColor.toLowerCase()).not.toMatch(/^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/);
    for (const part of models[0].parts) expect(solid(part.mesh).status()).toBe("NoError");
  });

  test("uma peça só: hastes ligadas pela raiz, comprimento = largura da boca do saco", () => {
    const clip = solid(buildBagClip(ctx(), p).models[0].parts[0].mesh);
    expect(clip.decompose()).toHaveLength(1);
    const b = clip.boundingBox();
    expect(b.max[2] - b.min[2]).toBeCloseTo(p.height);
    const armEnd = b.max[0];
    expect(armEnd).toBeGreaterThan(p.cover - 1);
  });

  test("fenda afunila: larga na raiz, na ponta mais estreita que o saco (é isso que aperta)", () => {
    const root = gapAt(8);
    const tip = gapAt(p.cover - 6);
    expect(root).toBeGreaterThan(p.gap);
    expect(tip).toBeLessThan(p.gap);
    expect(tip).toBeGreaterThan(0.1); // não encosta: imprime separado
  });

  test("dente de trava perto da ponta e boca aberta na entrada", () => {
    const prof = bagClipProfile(p);
    expect(prof.toothGap).toBeLessThan(prof.tipGap);
    expect(prof.mouth).toBeGreaterThan(p.gap + 1);
    expect(gapAt(p.cover + prof.flare - 0.3)).toBeGreaterThan(p.gap); // entrada larga
  });

  test("raiz reforçada: mais grossa que as hastes", () => {
    const prof = bagClipProfile(p);
    expect(prof.rootWall).toBeGreaterThan(p.arm * 1.2);
  });

  test("saco mais grosso = fenda maior; hastes mais grossas = mais força", () => {
    expect(bagClipProfile({ ...p, gap: 2.5 }).tipGap).toBeGreaterThan(bagClipProfile(p).tipGap);
    const thin = solid(buildBagClip(ctx(), { ...p, arm: 2 }).models[0].parts[0].mesh).volume();
    const thick = solid(buildBagClip(ctx(), { ...p, arm: 4 }).models[0].parts[0].mesh).volume();
    expect(thick).toBeGreaterThan(thin);
  });

  test("desenho enviado substitui o coração", () => {
    const art = new M.CrossSection([[[-10, -5], [10, -5], [10, 5], [-10, 5]]], "NonZero");
    const withArt = buildBagClip(ctx(art), p).models[0].parts[1].mesh;
    const def = buildBagClip(ctx(), p).models[0].parts[1].mesh;
    expect(solid(withArt).volume()).not.toBeCloseTo(solid(def).volume(), 0);
  });
});
