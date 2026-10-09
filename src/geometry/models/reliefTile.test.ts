import { beforeAll, describe, expect, test } from "vitest";
import { modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { checkModels } from "../../qa/checks";
import { volume } from "../testUtil";
import type { Model } from "../types";
import type { ModelCtx } from "./common";
import { buildReliefTile, cellOf, DEFAULT_RELIEF_TILE as D, periodicPattern, rawPattern, type TileKind } from "./reliefTile";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (art = false): ModelCtx => ({ M, art: art ? M.CrossSection.circle(10, 32) : null, text: () => null });
const size = (models: Model[]) => {
  const b = modelsBounds(models)!;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};
const KINDS: TileKind[] = ["stripes", "waves", "hexagons", "dots", "checker"];
const small = { ...D, width: 60, height: 40, pitch: 8 };
const T = { timeout: 30_000 };

describe("azulejo em relevo (#116)", () => {
  test.each(KINDS)("o padrão %s repete sem emenda nos dois sentidos", (kind) => {
    const [px, py] = cellOf(kind, 8);
    const one = rawPattern(M, kind, 2, 2, 8); // 2×2 períodos
    const wide = rawPattern(M, kind, 6, 2, 8); // 3 azulejos lado a lado
    const tall = rawPattern(M, kind, 2, 6, 8);
    const win = (cs: ReturnType<typeof rawPattern>, x: number, y: number) => cs.intersect(M.CrossSection.square([2 * px, 2 * py]).translate([x, y])).translate([-x, -y]);
    for (const [big, x, y] of [[wide, 2 * px, 0], [tall, 0, 2 * py]] as const) {
      const b = win(big, x, y);
      const diff = one.subtract(b).area() + b.subtract(one).area();
      expect(diff).toBeLessThan(one.area() * 0.002);
    }
  });

  test("o padrão cobre uma boa parte do azulejo, nem tudo nem nada", () => {
    for (const kind of KINDS) {
      const frac = periodicPattern(M, kind, 60, 40, 8).area() / (60 * 40);
      expect(frac).toBeGreaterThan(0.15);
      expect(frac).toBeLessThan(0.85);
    }
  });

  test("azulejo: placa com as medidas pedidas, base mais relevo, sólido fechado e sobre a mesa", T, () => {
    const out = buildReliefTile(ctx(), { ...small, output: "tile", base: 3, depth: 2 });
    const [w, h, z] = size(out.models);
    expect(w).toBeCloseTo(60, 2);
    expect(h).toBeCloseTo(40, 2);
    expect(z).toBeCloseTo(5, 2);
    expect(out.models).toHaveLength(1);
    expect(checkModels(M, out.models).filter((i) => i.kind === "fail")).toEqual([]);
    const v = volume(out.models[0].parts[0].mesh);
    expect(v).toBeGreaterThan(60 * 40 * 3);
    expect(v).toBeLessThan(60 * 40 * 5);
  });

  test("molde: bloco com parede, cavidade do tamanho do azulejo e fundo com o padrão em negativo", T, () => {
    const tile = buildReliefTile(ctx(), { ...small, output: "tile" });
    const out = buildReliefTile(ctx(), { ...small, output: "mold", wall: 8, floor: 4 });
    const [w, h, z] = size(out.models);
    expect(w).toBeGreaterThan(60 + 2 * 8 - 0.01);
    expect(h).toBeGreaterThan(40 + 2 * 8 - 0.01);
    expect(z).toBeGreaterThan(4 + 2 + 3);
    // o molde (cheio) menos o volume da cavidade = azulejo + folga de saída + borda de nível: o plástico é bem mais que 0 e a cavidade cabe o azulejo
    const block = (60 + 16) * (40 + 16) * z;
    const cavity = block - volume(out.models[0].parts[0].mesh);
    expect(cavity).toBeGreaterThanOrEqual(volume(tile.models[0].parts[0].mesh) - 1);
  });

  test("o chanfro de saída alarga a boca da cavidade em relação ao fundo", T, () => {
    const flat = buildReliefTile(ctx(), { ...small, output: "mold", draft: 0 });
    const drafted = buildReliefTile(ctx(), { ...small, output: "mold", draft: 2 });
    expect(volume(drafted.models[0].parts[0].mesh)).toBeLessThan(volume(flat.models[0].parts[0].mesh));
  });

  test("azulejo e molde juntos saem lado a lado sem se tocar", T, () => {
    const out = buildReliefTile(ctx(), { ...small, output: "both" });
    expect(out.models.map((m) => m.name)).toEqual(["Azulejo", "Molde"]);
    expect(checkModels(M, out.models).filter((i) => i.kind === "fail")).toEqual([]);
  });

  test("conjunto 3×3 tem três vezes a largura e a altura de um azulejo", T, () => {
    const out = buildReliefTile(ctx(), { ...small, output: "grid" });
    const [w, h] = size(out.models);
    expect(w).toBeCloseTo(180, 1);
    expect(h).toBeCloseTo(120, 1);
  });

  test("com desenho: o desenho se repete em grade e fica dentro do azulejo", T, () => {
    const out = buildReliefTile(ctx(true), { ...small, kind: "art", output: "tile" });
    const [w, h, z] = size(out.models);
    expect([w, h]).toEqual([expect.closeTo(60, 2), expect.closeTo(40, 2)]);
    expect(z).toBeCloseTo(D.base + D.depth, 2);
  });

  test("desenho pedido sem desenho enviado avisa em vez de gerar liso", () => {
    expect(() => buildReliefTile(ctx(false), { ...small, kind: "art" })).toThrow(/desenho/i);
  });

  test("azulejo maior que a mesa avisa", T, () => {
    const out = buildReliefTile(ctx(), { ...D, width: 300, height: 300, pitch: 20, output: "tile" });
    expect(out.warnings?.join(" ")).toMatch(/mesa/);
  });

  test("volume do relevo cresce com a profundidade", T, () => {
    const a = buildReliefTile(ctx(), { ...small, output: "tile", depth: 1 });
    const b = buildReliefTile(ctx(), { ...small, output: "tile", depth: 3 });
    expect(volume(b.models[0].parts[0].mesh)).toBeGreaterThan(volume(a.models[0].parts[0].mesh));
  });
});
