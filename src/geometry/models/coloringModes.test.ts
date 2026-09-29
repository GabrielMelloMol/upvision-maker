import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { sq, volume } from "../testUtil";
import { buildColoringTile, DEFAULT_COLORING_TILE as D, type ColoringTileParams } from "./coloringTile";
import type { ModelCtx } from "./common";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// dois quadrados cheios lado a lado: no modo contorno viram 2 áreas com borda
const art = () => new M.CrossSection([sq(10, -12, 0), sq(10, 12, 0)], "NonZero");
const ctx = (a = art()): ModelCtx => ({ M, art: a, text: () => null });
const build = (p: Partial<ColoringTileParams> = {}, a?: ReturnType<typeof art>) => buildColoringTile(ctx(a), { ...D, ...p });

describe("plaquinha de colorir: modos (#61)", { timeout: 30_000 }, () => {
  test("rebaixado: uma peça, áreas afundadas na altura do traço", () => {
    const { models } = build({ style: "recessed" });
    expect(models).toHaveLength(1);
    const m = models[0].parts[0].mesh;
    expect(meshBounds([m])!.max[2]).toBeCloseTo(D.thickness + D.wall);
    expect(volume(m)).toBeLessThan(80 * 80 * (D.thickness + D.wall) - 500);
  });

  test("2 peças: base com canaletas e grade à parte, sem sobrepor", () => {
    const { models } = build({ style: "twoPiece" });
    expect(models.map((m) => m.name)).toEqual(["Base", "Grade"]);
    const base = volume(models[0].parts[0].mesh);
    expect(base).toBeLessThan(80 * 80 * D.thickness); // canaletas
    expect(modelsBounds([models[1]])!.min[0]).toBeGreaterThan(modelsBounds([models[0]])!.max[0]);
    expect(meshBounds([models[1].parts[0].mesh])!.max[2]).toBeCloseTo(D.wall + 1);
  });

  test("marchetaria: grade + uma peça por área, com folga (menores que o buraco)", () => {
    const { models } = build({ style: "marquetry" });
    expect(models[0].name).toBe("Grade");
    const pieces = models.filter((m) => m.name.startsWith("Peça"));
    // fundo em volta dos quadrados + 2 miolos dos quadrados
    expect(pieces.length).toBe(3);
    const small = pieces.map((m) => modelsBounds([m])!).sort((a, b) => a.max[0] - a.min[0] - (b.max[0] - b.min[0]))[0];
    expect(small.max[0] - small.min[0]).toBeCloseTo(20 * (80 - 10) / 44 - D.line - 2 * 0.2, 0);
  });

  test("traço solto avisa na grade (2 peças)", () => {
    const lonely = new M.CrossSection([sq(3, 0, 0)], "NonZero");
    expect(build({ style: "twoPiece", mode: "lines" }, lonely).warnings!.join(" ")).toMatch(/solto/);
    expect(build({}).warnings).toEqual([]);
  });
});
