import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { buildBookmark, DEFAULT_BOOKMARK as D, type BookmarkParams } from "./bookmark";
import type { ModelCtx } from "./common";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const side = (p: Partial<BookmarkParams> = {}, art: ModelCtx["art"] = null) => buildBookmark(ctx(art), { ...D, mode: "side", text: "Ana", ...p });
const part = (name: string, p: Partial<BookmarkParams> = {}) => meshBounds([side(p).models[0].parts.find((q) => q.name === name)!.mesh])!;

describe("marca-página com nome na lateral (#71)", { timeout: 30_000 }, () => {
  test("aba fina e nome de pé saindo pela borda comprida, em outra cor", () => {
    const { models } = side();
    expect(models[0].parts.map((q) => q.name)).toEqual(["Base", "Nome", "Contorno"]);
    const base = part("Base"), name = part("Nome");
    expect(base.max[2]).toBeCloseTo(0.8);
    expect(name.max[2]).toBeCloseTo(D.thickness + D.relief);
    // o nome passa da borda da aba (sai do livro) pela maior parte da altura dele
    const tabEdge = 14 * 0.35;
    expect(name.max[0]).toBeCloseTo(14, 0);
    expect(name.max[0] - tabEdge).toBeGreaterThan(8);
    expect(base.min[0]).toBeCloseTo(-D.width + tabEdge, 0);
  });

  test("letra se ajusta ao comprimento: nome longo não passa de 90% da aba", () => {
    const n = part("Nome", { text: "Maria Eduarda Souza", length: 120 });
    expect(n.max[1] - n.min[1]).toBeLessThanOrEqual(120 * 0.9 + 1e-3);
    expect(n.max[0] - n.min[0]).toBeLessThan(14); // encolheu para caber
  });

  test("espaço entre letras alonga o nome; desenho vai na aba", () => {
    const a = part("Nome", { spacing: 0 }), b = part("Nome", { spacing: 3 });
    expect(b.max[1] - b.min[1]).toBeGreaterThan(a.max[1] - a.min[1] + 3);
    const withArt = side({}, M.CrossSection.circle(10, 32)).models[0].parts.map((q) => q.name);
    expect(withArt).toContain("Desenho");
  });

  test("modo tira continua igual", () => {
    expect(buildBookmark(ctx(), D).models[0].parts.map((q) => q.name)).toEqual(["Base", "Texto"]);
  });
});
