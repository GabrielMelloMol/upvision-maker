import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { sq, volume } from "../testUtil";
import type { Model } from "../types";
import type { ModelCtx } from "./common";
import { buildPuzzle, DEFAULT_PUZZLE as D, type PuzzleParams } from "./puzzle";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// desenho 20 × 10 (proporção 2:1) com um quadrado vazado no meio
const art = () => new M.CrossSection([[[-10, -5], [10, -5], [10, 5], [-10, 5]], sq(2)], "EvenOdd");
const ctx = (): ModelCtx => ({ M, art: art(), text: () => null });
const build = (p: Partial<PuzzleParams> = {}) => buildPuzzle(ctx(), { ...D, ...p });
const pieces = (models: Model[]) => models.filter((m) => m.name.startsWith("Peça"));
const box = (m: Model) => modelsBounds([m])!;

describe("quebra-cabeça (#60)", () => {
  test("grade segue a proporção do desenho: 4 colunas × 2 linhas; peças sem sobrepor e com a folga", () => {
    const { models, warnings } = build();
    const ps = pieces(models);
    expect(ps).toHaveLength(8);
    const cell = D.width / 4;
    const b = box(ps[0]);
    expect(b.max[0] - b.min[0]).toBeCloseTo(cell - D.clearance, 3);
    expect(b.max[2]).toBeCloseTo(D.thickness);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const a = box(ps[i]), c = box(ps[j]);
        expect(a.min[0] < c.max[0] && c.min[0] < a.max[0] && a.min[1] < c.max[1] && c.min[1] < a.max[1]).toBe(false);
      }
    expect(warnings).toEqual(["Peças pequenas: não é brinquedo para menores de 3 anos (risco de engasgo)."]); // 120/4 = 30 mm
    expect(build({ columns: 3 }).warnings).toEqual([]);
  });

  test("verso em outra cor, arte embutida rente na face (sem relevo)", () => {
    const m = pieces(build({ columns: 2 }).models)[0];
    const verso = m.parts.find((q) => q.name === "Verso")!;
    expect(verso.color).toBe(D.backColor);
    expect(meshBounds([verso.mesh])!.max[2]).toBeCloseTo(0.6);
    const arte = m.parts.filter((q) => q.name === "Arte");
    expect(arte.length).toBeGreaterThan(0);
    expect(meshBounds(arte.map((q) => q.mesh))!.min[2]).toBeCloseTo(D.thickness - D.inlay);
    // volume total = bloco cheio (a arte preenche o rebaixo)
    const cell = D.width / 2 - D.clearance;
    expect(m.parts.reduce((s, q) => s + volume(q.mesh), 0)).toBeCloseTo(cell * cell * D.thickness, 0);
  });

  test("face para baixo: arte na primeira camada", () => {
    const m = pieces(build({ columns: 2, face: "down" }).models)[0];
    const arte = m.parts.filter((q) => q.name === "Arte");
    const b = meshBounds(arte.map((q) => q.mesh))!;
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.max[2]).toBeCloseTo(D.inlay);
    for (const q of m.parts) expect(volume(q.mesh)).toBeGreaterThan(0); // triângulos continuam para fora
  });

  test("moldura e suporte são peças à parte; aviso de peça pequena e de mesa", () => {
    const { models } = build({ frame: true, stand: true });
    expect(models.slice(-2).map((m) => m.name)).toEqual(["Moldura", "Suporte"]);
    const fr = box(models.at(-2)!);
    expect(fr.max[0] - fr.min[0]).toBeCloseTo(D.width + D.clearance + 12, 0);
    expect(build({ columns: 8 }).warnings!.join(" ")).toMatch(/menores de 3 anos/);
    expect(build({ width: 250, columns: 16 }).warnings!.join(" ")).toMatch(/passa da mesa/);
  });

  test("sem desenho: prévia vazia", () => {
    expect(() => buildPuzzle({ M, art: null, text: () => null }, D)).toThrow("Envie um desenho");
  });
});
