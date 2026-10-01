import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import { sq, volume } from "../testUtil";
import type { Model } from "../types";
import type { ModelCtx } from "./common";
import { buildPuzzle, DEFAULT_PUZZLE as D, pieceRegions, type PuzzleParams } from "./puzzle";
import { KNOBS } from "./puzzleCuts";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// desenho 20 × 10 (proporção 2:1) com um quadrado vazado no meio
const art = () => new M.CrossSection([[[-10, -5], [10, -5], [10, 5], [-10, 5]], sq(2)], "EvenOdd");
const digit = () => new M.CrossSection([sq(2)], "Positive"); // "número" de 4 × 4 mm
const ctx = (withArt = true): ModelCtx => ({ M, art: withArt ? art() : null, text: () => digit() });
const build = (p: Partial<PuzzleParams> = {}, withArt = true) => buildPuzzle(ctx(withArt), { ...D, ...p });
const pieces = (models: Model[]) => models.filter((m) => m.name.startsWith("Peça"));
const box = (m: Model) => modelsBounds([m])!;
const vol = (m: Model) => m.parts.reduce((s, q) => s + volume(q.mesh), 0);

describe("quebra-cabeça (#60, #159)", { timeout: 60_000 }, () => {
  test.each(KNOBS)("%s: as regiões cobrem o retângulo sem sobrepor (encaixe exato antes da folga)", (knob) => {
    scoped((k) => {
      const cut = { cols: 4, rows: 3, cell: 30, knob, size: 0.22, seed: 3, random: true };
      const rect = k(M.CrossSection.square([120, 90], true));
      const rs = pieceRegions(M, k, cut, rect);
      expect(rs).toHaveLength(12);
      expect(rs.reduce((s, r) => s + r.cs.area(), 0)).toBeCloseTo(120 * 90, 0);
      expect(k(M.CrossSection.union(rs.map((r) => r.cs))).area()).toBeCloseTo(120 * 90, 0);
    });
  });

  test("grade segue a proporção do desenho (4 × 2); folga separa as peças; orelhas afastadas na mesa sem encostar", () => {
    const { models, warnings } = build();
    const ps = pieces(models);
    expect(ps).toHaveLength(8);
    for (const m of ps) expect(box(m).max[2]).toBeCloseTo(D.thickness);
    // espalhadas: nenhuma caixa encosta na outra
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const a = box(ps[i]), c = box(ps[j]);
        expect(a.min[0] < c.max[0] && c.min[0] < a.max[0] && a.min[1] < c.max[1] && c.min[1] < a.max[1]).toBe(false);
      }
    expect(warnings).toEqual(["Peças pequenas: não é brinquedo para menores de 3 anos (risco de engasgo)."]); // 120/4 = 30 mm
    expect(build({ columns: 3 }).warnings).toEqual([]);
    expect(build({ rows: 3 }).models.filter((m) => m.name.startsWith("Peça"))).toHaveLength(12);
  });

  test("montado: peças no lugar, com a folga entre elas (volume total = área do contorno menos a folga)", () => {
    const ps = pieces(build({ layout: "assembled", numbers: false }).models);
    const total = ps.reduce((s, m) => s + vol(m), 0);
    const full = 120 * 60 * D.thickness;
    expect(total).toBeLessThan(full);
    expect(total).toBeGreaterThan(full * 0.95);
    expect(build({ layout: "assembled" }).warnings!.join(" ")).toMatch(/Montado é só para ver/);
  });

  test("verso em outra cor com número gravado; arte embutida rente na face", () => {
    const m = pieces(build({ columns: 2 }).models)[0];
    const verso = m.parts.filter((q) => q.name === "Verso");
    expect(verso.every((q) => q.color === D.backColor)).toBe(true);
    expect(meshBounds(verso.map((q) => q.mesh))!.max[2]).toBeCloseTo(0.6);
    // o número (4 × 4 mm) fica vazado na primeira camada do verso
    const semNumero = pieces(build({ columns: 2, numbers: false }).models)[0];
    expect(vol(semNumero) - vol(m)).toBeCloseTo(16 * 0.4, 1);
    const arte = m.parts.filter((q) => q.name === "Arte");
    expect(arte.length).toBeGreaterThan(0);
    expect(meshBounds(arte.map((q) => q.mesh))!.min[2]).toBeCloseTo(D.thickness - D.inlay);
  });

  test("face para baixo: arte na primeira camada", () => {
    const m = pieces(build({ columns: 2, face: "down" }).models)[0];
    const b = meshBounds(m.parts.filter((q) => q.name === "Arte").map((q) => q.mesh))!;
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.max[2]).toBeCloseTo(D.inlay);
    for (const q of m.parts) expect(volume(q.mesh)).toBeGreaterThan(0); // triângulos continuam para fora
  });

  test("contornos: círculo e coração cortam a grade (pedaço pequeno gruda na vizinha); contorno do desenho precisa do desenho", () => {
    const circle = pieces(build({ outline: "circle", columns: 5, layout: "assembled", numbers: false }, false).models);
    const area = circle.reduce((s, m) => s + vol(m), 0) / D.thickness;
    expect(area).toBeLessThan(Math.PI * 60 * 60);
    expect(area).toBeGreaterThan(Math.PI * 60 * 60 * 0.95);
    expect(circle.length).toBeLessThan(25); // os cantos fora do círculo somem
    for (const m of circle) expect(vol(m)).toBeGreaterThan(0.15 * 24 * 24 * D.thickness * 0.9); // nada de lasquinha
    expect(pieces(build({ outline: "heart", columns: 5 }, false).models).length).toBeGreaterThan(10);
    expect(() => build({ outline: "art" }, false)).toThrow("Envie o desenho");
  });

  test("peça de teste: 4 peças sem arte, com a mesma peça e folga, e o aviso de como ajustar", () => {
    const { models, warnings } = build({ output: "test", frame: true });
    expect(models.map((m) => m.name)).toEqual(["Peça 1", "Peça 2", "Peça 3", "Peça 4"]);
    expect(models.every((m) => m.parts.every((q) => q.name !== "Arte"))).toBe(true);
    expect(warnings!.join(" ")).toMatch(/Peça de teste.*folga \(agora 0,25 mm\)/);
  });

  test("mesma semente refaz igual; outra semente muda as peças", () => {
    const a = pieces(build({ numbers: false }).models).map(vol);
    expect(pieces(build({ numbers: false }).models).map(vol)).toEqual(a);
    expect(pieces(build({ numbers: false, seed: 2 }).models).map(vol)).not.toEqual(a);
  });

  test("moldura acompanha o contorno; suporte à parte; sem desenho dá peças lisas", () => {
    const { models } = build({ frame: true, stand: true });
    expect(models.slice(-2).map((m) => m.name)).toEqual(["Moldura", "Suporte"]);
    const fr = box(models.at(-2)!);
    expect(fr.max[0] - fr.min[0]).toBeCloseTo(D.width + D.clearance + 12, 0);
    expect(build({ columns: 8 }).warnings!.join(" ")).toMatch(/menores de 3 anos/);
    expect(build({ columns: 8 }).warnings!.join(" ")).toMatch(/Pescoço do encaixe fino/); // peça de 15 mm
    expect(build({ columns: 4 }).warnings!.join(" ")).not.toMatch(/Pescoço/);
    const lisas = pieces(build({}, false).models);
    expect(lisas).toHaveLength(16); // sem desenho: grade quadrada
    expect(lisas.every((m) => m.parts.every((q) => q.name !== "Arte"))).toBe(true);
  });
});
