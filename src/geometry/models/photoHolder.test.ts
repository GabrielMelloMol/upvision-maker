import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildPhotoHolder, DEFAULT_PHOTO_HOLDER as D, spacedText, type PhotoHolderParams } from "./photoHolder";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<PhotoHolderParams> = {}) => buildPhotoHolder(ctx(), { ...D, ...p });
const width = (p: Partial<PhotoHolderParams>) => {
  const b = meshBounds([build(p).models[0].parts[0].mesh])!;
  return b.max[0] - b.min[0];
};

describe("porta-foto (#74)", { timeout: 30_000 }, () => {
  test("base no tamanho da foto, com fenda, de cabeça para baixo; texto à parte em outra cor", () => {
    const { models } = build();
    expect(models.map((m) => m.name)).toEqual(["Base", "Texto"]);
    expect(width({})).toBeCloseTo(150 + 20, 0);
    expect(width({ photo: "10x15" })).toBeCloseTo(120, 0);
    expect(width({ photo: "polaroid" })).toBeCloseTo(108, 0);
    expect(width({ photo: "custom", photoWidth: 60 })).toBeCloseTo(80, 0);
    const base = models[0].parts[0].mesh;
    const b = meshBounds([base])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(D.height, 3);
    // a fenda tira material: menos que o bloco cheio
    expect(volume(base)).toBeLessThan(170 * D.depth * D.height);
    expect(models[1].parts[0].color).toBe(D.textColor);
    expect(meshBounds([models[1].parts[0].mesh])!.max[1]).toBeLessThan(b.min[1]); // na frente, sem encostar
  });

  test("sem texto sai só a base", () => {
    expect(build({ text: "" }).models.map((m) => m.name)).toEqual(["Base"]);
  });

  test("espaçamento entre letras alarga o texto", () => {
    const t = ctx().text;
    const w = (sp: number) => {
      const cs = spacedText(M, t, "ABC", 10, sp)!;
      const b = cs.bounds();
      cs.delete();
      return b.max[0] - b.min[0];
    };
    expect(w(0)).toBeCloseTo(18);
    expect(w(2)).toBeCloseTo(18 + 4);
  });
});
