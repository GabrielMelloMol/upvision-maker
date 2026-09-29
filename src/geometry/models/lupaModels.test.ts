import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { volume } from "../testUtil";
import type { Mesh, Model } from "../types";
import type { ModelCtx } from "./common";
import { buildGridCutter, DEFAULT_GRID_CUTTER as G } from "./gridCutter";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: cada letra é um retângulo 0,6h × h. */
const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const size = (models: Model[]) => {
  const b = modelsBounds(models)!;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};

/** Toda parte é um sólido fechado, com volume e apoiado na mesa (z ≥ 0). */
export function expectPrintable(models: Model[]) {
  for (const m of models)
    for (const q of m.parts) {
      const s = solid(q.mesh);
      expect(s.status()).toBe("NoError");
      expect(volume(q.mesh)).toBeGreaterThan(0);
      expect(meshBounds([q.mesh])!.min[2]).toBeGreaterThanOrEqual(-1e-4);
      s.delete();
    }
}

describe("cortador em grade (#63)", () => {
  test("uma abertura por célula; tamanho = colunas × largura + lâmina; altura da lâmina", () => {
    const { models } = buildGridCutter(ctx(), { ...G, tabs: false });
    expectPrintable(models);
    const blade = solid(models[0].parts[0].mesh);
    expect(blade.genus()).toBe(G.rows * G.cols); // cada célula é um furo que atravessa
    const [w, h, z] = size(models);
    expect(w).toBeCloseTo(G.cols * G.cellWidth + G.wall + 2 * G.flangeWidth, 0);
    expect(h).toBeCloseTo(G.rows * G.cellHeight + G.wall + 2 * G.flangeWidth, 0);
    expect(z).toBeCloseTo(G.height, 1);
  });

  test("abas de pega com texto em relevo em outra cor, uma de cada lado", () => {
    const { models } = buildGridCutter(ctx(), G);
    expectPrintable(models);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Cortador", "Texto"]);
    const [w] = size(models);
    expect(w).toBeGreaterThan(G.cols * G.cellWidth + 2 * G.tabLength - 1);
    const text = meshBounds([models[0].parts[1].mesh])!;
    expect(text.min[2]).toBeCloseTo(G.flangeHeight, 3); // em cima da aba
  });

  test("grade maior que a mesa avisa", () => {
    const { warnings } = buildGridCutter(ctx(), { ...G, cols: 10, cellWidth: 30 });
    expect(warnings?.join()).toMatch(/mesa/);
  });
});
