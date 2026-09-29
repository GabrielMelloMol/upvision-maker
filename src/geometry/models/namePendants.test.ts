import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildNamePendants, DEFAULT_NAME_PENDANTS as D, parsePendants, type NamePendantsParams } from "./namePendants";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<NamePendantsParams> = {}, art: ModelCtx["art"] = null) => buildNamePendants(ctx(art), { ...D, ...p });

test("parsePendants: nome e ícone por item (vírgula ou linha); ícone desconhecido vira coração", () => {
  expect(parsePendants("Ana; Pata\nBia, ,Caio; foguete, Du; nenhum")).toEqual([
    { name: "Ana", icon: "paw" },
    { name: "Bia", icon: "none" },
    { name: "Caio", icon: "heart" },
    { name: "Du", icon: "none" },
  ]);
});

describe("pingentes de nomes (#72)", { timeout: 30_000 }, () => {
  test("um pingente por linha, na largura pedida, em 3 cores, arrumados sem sobrepor", () => {
    const { models } = build();
    expect(models.map((m) => m.name)).toEqual(["Ana", "Pedro", "Thor"]);
    for (const m of models) {
      const b = modelsBounds([m])!;
      expect(b.max[0] - b.min[0]).toBeCloseTo(D.width, -1);
      expect(m.parts.map((q) => q.name)).toEqual(["Base", "Nome", "Ícone"]);
      expect(new Set(m.parts.map((q) => q.color)).size).toBe(3);
    }
    const bs = models.map((m) => modelsBounds([m])!);
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) expect(bs[i].min[0] < bs[j].max[0] && bs[j].min[0] < bs[i].max[0] && bs[i].min[1] < bs[j].max[1] && bs[j].min[1] < bs[i].max[1]).toBe(false);
  });

  test("ícone fica à esquerda do nome; furos de ligação tiram material das laterais", () => {
    const [m] = build({ items: "Ana; estrela" }).models;
    const icon = meshBounds([m.parts[2].mesh])!, name = meshBounds([m.parts[1].mesh])!;
    expect(icon.max[0]).toBeLessThan(name.min[0]);
    const noHoles = build({ items: "Ana; estrela", holes: false }).models[0];
    expect(modelsBounds([noHoles])!.max[0] - modelsBounds([noHoles])!.min[0]).toBeCloseTo(D.width, -1);
    expect(volume(m.parts[0].mesh)).toBeGreaterThan(0);
  });

  test("ícone por desenho usa o desenho enviado; sem desenho avisa", () => {
    const withArt = build({ items: "Rex; desenho" }, new M.CrossSection([[[-5, -5], [5, -5], [5, 5], [-5, 5]]], "NonZero"));
    expect(withArt.models[0].parts.some((q) => q.name === "Ícone")).toBe(true);
    const noArt = build({ items: "Rex; desenho" });
    expect(noArt.warnings!.join(" ")).toMatch(/envie um desenho/);
    expect(noArt.models[0].parts.map((q) => q.name)).toEqual(["Base", "Nome"]);
  });

  test("sem itens: prévia vazia", () => {
    expect(() => build({ items: "  \n" })).toThrow("Digite um pingente por linha");
  });
});
