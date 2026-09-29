import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { Model } from "../types";
import { buildBigLetter, DEFAULT_BIG_LETTER as D, type BigLetterParams } from "./bigLetter";
import type { ModelCtx } from "./common";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// "fonte" de teste: cada texto vira um retângulo (0,6·h por letra × h)
const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<BigLetterParams> = {}) => buildBigLetter(ctx(), { ...D, ...p });
const part = (m: Model, name: string) => m.parts.find((q) => q.name === name)!;
const size = (models: Model[]) => {
  const b = modelsBounds(models)!;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};

function expectPrintable(models: Model[]) {
  for (const m of models)
    for (const q of m.parts) {
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: q.mesh.positions, triVerts: q.mesh.indices }));
      expect(s.status()).toBe("NoError");
      expect(volume(q.mesh)).toBeGreaterThan(0);
      expect(meshBounds([q.mesh])!.min[2]).toBeGreaterThanOrEqual(-1e-4);
      s.delete();
    }
}

describe("letra grande com nome (#55)", { timeout: 30_000 }, () => {
  test("encaixado: letra com rebaixo + peça do nome separada ao lado", () => {
    const { models } = build();
    expectPrintable(models);
    expect(models.map((m) => m.name)).toEqual(["A", "Alice"]);
    const [w, h, z] = size([models[0]]);
    expect(h).toBeCloseTo(D.height, 0);
    expect(w).toBeCloseTo(0.6 * D.height, 0);
    expect(z).toBeCloseTo(D.thickness);
    const solid = D.height * 0.6 * D.height * D.thickness;
    const pocket = (0.6 * D.nameHeight * 5 + 2 * D.clearance) * (D.nameHeight + 2 * D.clearance) * D.depth;
    expect(volume(models[0].parts[0].mesh)).toBeCloseTo(solid - pocket, -2) // cantos da folga são arredondados;
    expect(size([models[1]])[2]).toBeCloseTo(D.nameThickness);
    expect(modelsBounds([models[1]])!.min[0]).toBeGreaterThan(modelsBounds([models[0]])!.max[0]); // não sobrepõe
  });

  test("rebaixado: só a letra, com o nome afundado; relevo: nome por cima", () => {
    const sunken = build({ nameMode: "sunken" }).models;
    expect(sunken).toHaveLength(1);
    expect(volume(sunken[0].parts[0].mesh)).toBeLessThan(D.height * 0.6 * D.height * D.thickness - 1);
    const raised = build({ nameMode: "raised" }).models;
    expect(raised[0].parts.map((q) => q.name)).toEqual(["Letra", "Nome"]);
    expect(size(raised)[2]).toBeCloseTo(D.thickness + D.depth);
  });

  test("borda para resina: parede em volta da letra, mais alta que ela", () => {
    const { models, warnings } = build({ finish: "resin", nameMode: "raised" });
    expectPrintable(models);
    const rim = meshBounds([part(models[0], "Borda").mesh])!;
    expect(rim.max[2]).toBeCloseTo(D.thickness + D.resinHeight);
    expect(rim.max[1] - rim.min[1]).toBeCloseTo(D.height + 2 * D.wall, 0);
    expect(warnings!.join(" ")).toMatch(/resina/);
  });

  test("fundo para material: fundo + moldura, molde do material e nome (3 peças)", () => {
    const { models } = build({ finish: "material" });
    expectPrintable(models);
    expect(models.map((m) => m.name)).toEqual(["A", "Molde do material", "Alice"]);
    expect(models[0].parts.map((q) => q.name)).toEqual(["Letra", "Moldura"]);
    expect(size([models[0]])[2]).toBeCloseTo(2 + D.materialThickness);
    const tpl = size([models[1]]);
    expect(tpl[1]).toBeCloseTo(D.height - 2 * (D.wall + D.clearance), 0);
  });

  test("pendurar tira material das costas; suporte vira peça à parte", () => {
    const flat = build().models[0];
    const hung = build({ mount: "hang" });
    expectPrintable(hung.models);
    expect(volume(hung.models[0].parts[0].mesh)).toBeLessThan(volume(flat.parts[0].mesh) - 20);
    const stand = build({ mount: "stand", nameMode: "sunken" }).models;
    expect(stand.map((m) => m.name)).toEqual(["A", "Suporte"]);
  });

  test("avisa quando passa da mesa e quando o nome sai da letra", () => {
    expect(build({ height: 280 }).warnings!.join(" ")).toMatch(/passa da mesa de 256 mm/);
    expect(build({ nameDx: 200 }).warnings!.join(" ")).toMatch(/fora da letra/);
  });

  test("sem letra: prévia vazia", () => {
    expect(() => build({ letter: " " })).toThrow("Digite a letra");
  });

  test("fundo texturizado: rebaixa a face fora do nome (#50)", () => {
    const vol = (t: BigLetterParams["texture"]) => volume(build({ nameMode: "raised", texture: t }).models[0].parts[0].mesh);
    const flat = vol("none"), tex = vol("hexagons");
    expect(tex).toBeLessThan(flat - 100);
    expect(flat - tex).toBeLessThan(D.height * 0.6 * D.height * D.textureDepth); // só a profundidade, nunca atravessa
  });
});
