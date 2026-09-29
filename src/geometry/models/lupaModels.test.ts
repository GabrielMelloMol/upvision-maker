import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { volume } from "../testUtil";
import type { Mesh, Model } from "../types";
import type { ModelCtx } from "./common";
import { buildCakeStand, buildStickStand, DEFAULT_CAKE_STAND as B, DEFAULT_STICK_STAND as S, holeRings } from "./confectionery";
import { buildGridCutter, DEFAULT_GRID_CUTTER as G } from "./gridCutter";
import { buildOutlineBowl, DEFAULT_OUTLINE_BOWL as O } from "./outlineBowl";

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

describe("suporte de palitos (#65a)", () => {
  test("furos distribuídos em anéis, sem sobrar nem faltar; centro livre", () => {
    const rings = holeRings(12, 20);
    expect(rings.reduce((t, r) => t + r.count, 0)).toBe(12);
    for (const r of rings) expect((2 * Math.PI * r.radius) / r.count).toBeGreaterThanOrEqual(20 - 1e-6); // espaço entre furos
    expect(rings[0].radius).toBeGreaterThan(0);
  });

  test("maciço: um furo por palito (genus) e a altura pedida", () => {
    const { models } = buildStickStand(ctx(), { ...S, base: "solid" });
    expectPrintable(models);
    expect(size(models)[2]).toBeCloseTo(S.height, 1);
    expect(solid(models[0].parts[0].mesh).volume()).toBeGreaterThan(0);
  });

  test("leve (oco por baixo) gasta menos plástico; com peso ganha bolsão e tampa separada", () => {
    const vol = (base: "solid" | "light" | "weight") => volume(buildStickStand(ctx(), { ...S, base }).models[0].parts[0].mesh);
    expect(vol("light")).toBeLessThan(vol("solid") * 0.7);
    const weighted = buildStickStand(ctx(), { ...S, base: "weight" }).models;
    expectPrintable(weighted);
    expect(weighted.map((m) => m.name)).toEqual(["Suporte de palitos", "Tampa do peso"]);
    expect(vol("weight")).toBeLessThan(vol("solid"));
  });
});

describe("boleira (#65b)", () => {
  test("impressa de cabeça para baixo: prato na mesa, pé em cima; altura e diâmetro pedidos", () => {
    const { models } = buildCakeStand(ctx(), B);
    expectPrintable(models);
    const [w, , z] = size(models);
    expect(w).toBeCloseTo(B.diameter + 2 * B.waveDepth, 0);
    expect(z).toBeCloseTo(B.height, 1);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Boleira", "Nome"]);
    const name = meshBounds([models[0].parts[1].mesh])!;
    expect(name.min[2]).toBeCloseTo(0, 3); // nome embutido na face que fica na mesa (vira o topo do prato)
  });

  test("pé com rampa de no máximo 45° (sem suporte): pé largo demais para a altura é limitado e avisa", () => {
    const { warnings, models } = buildCakeStand(ctx(), { ...B, height: 40, footDiameter: 200 });
    expectPrintable(models);
    expect(warnings?.join()).toMatch(/pé/);
  });

  test("sem nome: uma peça só; prato maior que a mesa avisa", () => {
    expect(buildCakeStand(ctx(), { ...B, name: "" }).models[0].parts).toHaveLength(1);
    expect(buildCakeStand(ctx(), { ...B, diameter: 260 }).warnings?.join()).toMatch(/mesa/);
  });
});

describe("cumbuca no contorno (#66)", () => {
  const star = () => M.CrossSection.circle(30, 5); // pentágono como "desenho"
  const withArt = (): ModelCtx => ({ ...ctx(), art: star() });

  test("sem desenho: coração de exemplo; largura e altura pedidas; oca por dentro", () => {
    const { models } = buildOutlineBowl(ctx(), { ...O, floorArt: false });
    expectPrintable(models);
    const [w, , z] = size(models);
    expect(w).toBeCloseTo(O.width, 0);
    expect(z).toBeCloseTo(O.height, 1);
    const bowl = models[0].parts[0].mesh;
    expect(volume(bowl)).toBeLessThan(O.width * O.width * O.height * 0.35); // casca, não bloco
  });

  test("contorno do desenho enviado; fundo arredondado: a base é menor que a boca", () => {
    const { models } = buildOutlineBowl(withArt(), { ...O, floorArt: false, bottomRadius: 8 });
    expectPrintable(models);
    const s = solid(models[0].parts[0].mesh);
    const foot = s.trimByPlane([0, 0, -1], -0.2).boundingBox(); // o que está abaixo de 0,2 mm
    const all = s.boundingBox();
    expect(foot.max[0] - foot.min[0]).toBeLessThan(all.max[0] - all.min[0] - 8);
  });

  test("desenho em relevo no fundo, em outra cor, apoiado no piso por dentro", () => {
    const { models } = buildOutlineBowl(withArt(), O);
    expectPrintable(models);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Cumbuca", "Desenho no fundo"]);
    const b = meshBounds([models[0].parts[1].mesh])!;
    expect(b.min[2]).toBeCloseTo(O.floor, 3);
    expect(b.max[2]).toBeCloseTo(O.floor + O.relief, 3);
  });
});
