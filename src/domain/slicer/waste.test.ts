import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { parseSlicerFile } from "./index";
import { flushMatrix, purgeWaste, sequenceFromLayers, toolSequence } from "./waste";

const fixture = (f: string) => new Uint8Array(readFileSync(resolve(__dirname, "../../../tests/fixtures/slicer", f)));
const enc = (s: string) => new TextEncoder().encode(s);

describe("desperdício multicor (#147)", () => {
  test("3MF real da A1 (2 cores), sem G-code dentro: 1 troca azul → branco purga 616 mm³ ≈ 0,78 g, mais que o branco inteiro (0,55 g): fica fora do used_g", () => {
    const r = parseSlicerFile("bambu-a1-2cores-fatiado.3mf", fixture("bambu-a1-2cores-fatiado.3mf"));
    expect(r.filaments.map((f) => f.grams)).toEqual([3.79, 0.55]); // o consumo do fatiador fica como está
    expect(r.waste).toEqual({ byFilament: [{ index: 2, grams: 0.78 }], grams: 0.78, swaps: 1, included: false, from: "camadas" });
  });

  // Bambu Studio 2.8.2, A1, 4 cubos de 15 mm em 4 cores, 30 camadas. Somando a extrusão do G-code por filamento, a
  // purga (FLUSH_START…END) e a torre dão o used_g de cada um (±2%): o Bambu já conta as duas, não se soma de novo.
  test("Bambu 4 cores com torre: purga e torre já estão no used_g, só informa", () => {
    const r = parseSlicerFile("x.3mf", fixture("bambu-a1-4cores-torre-fatiado.3mf"));
    expect(r.filaments.map((f) => f.grams)).toEqual([6.12, 11.47, 9.47, 8.94]);
    expect(r.waste).toMatchObject({ swaps: 89, included: true, from: "gcode" });
    expect(r.waste!.grams).toBeCloseTo(32, 0); // a purga real no G-code: 28,1 g
    expect(r.tower).toBeCloseTo(4.3, 1); // 36,00 g com torre − 31,70 g sem torre
  });

  test("Bambu 4 cores sem torre: a peça pesa ~3 g e o used_g dá 31,7 g, porque a purga está dentro", () => {
    const r = parseSlicerFile("x.3mf", fixture("bambu-a1-4cores-fatiado.3mf"));
    expect(r.filaments.reduce((s, f) => s + (f.grams ?? 0), 0)).toBeCloseTo(31.7, 1);
    expect(r.waste).toMatchObject({ included: true });
    expect(r.tower).toBeUndefined();
  });

  test("OrcaSlicer: o used_g e o 'filament used' NÃO têm a purga (branco: 0,19 g, purga ~0,18 g), então ela é somada", () => {
    const tmf = parseSlicerFile("x.3mf", fixture("orca-a1-2cores-fatiado.3mf"));
    expect(tmf.filaments.map((f) => f.grams)).toEqual([2.37, 0.19]);
    // 3MF: matriz crua (616) × flush_multiplier 0,3 = 185 mm³
    expect(tmf.waste).toEqual({ byFilament: [{ index: 2, grams: 0.23 }], grams: 0.23, swaps: 1, included: false, from: "gcode" });
    const gcode = parseSlicerFile("x.gcode", gunzipSync(fixture("orca-a1-2cores.gcode.gz")));
    expect(gcode.filaments.map((f) => f.grams)).toEqual([2.37, 0.19]);
    // G-code: a matriz já vem multiplicada (185) e não se multiplica de novo
    expect(gcode.waste).toEqual({ byFilament: [{ index: 2, grams: 0.23 }], grams: 0.23, swaps: 1, included: false, from: "gcode" });
  });

  test("matriz n×n: linha = de, coluna = para; lista que não é quadrada é ignorada", () => {
    expect(flushMatrix([0, 616, 229, 0])).toEqual([
      [0, 616],
      [229, 0],
    ]);
    expect(flushMatrix([1, 2, 3])).toBeNull();
    expect(flushMatrix([])).toBeNull();
  });

  test("sequência pelo G-code: M620 S<n>A e T<n>, sem repetir e sem o descarregar (255)", () => {
    const g = ["M620 S0A", "T0", "G1 X1", "M620 S1A ; troca", "T1", "M620 S2A", "M620 S0A", "M620 S255", "T255"].join("\n");
    expect(toolSequence(g)).toEqual([0, 1, 2, 0]);
  });

  test("sequência pelas camadas (4 cores): cada camada começa na cor em que a anterior terminou", () => {
    const seq = sequenceFromLayers([
      { filaments: [0], from: 0, to: 4 },
      { filaments: [0, 1], from: 5, to: 6 },
      { filaments: [2, 3], from: 7, to: 7 },
    ]);
    // camada 5: 0 → 1; camada 6 começa no 1 e troca para o 0; camada 7 (sem o 0): 2 → 3
    expect(seq).toEqual([0, 1, 0, 2, 3]);
  });

  test("purga cobrada do filamento que entra, com a densidade dele e o multiplicador", () => {
    const m = flushMatrix([0, 500, 300, 200, 0, 400, 100, 250, 0])!;
    const w = purgeWaste([0, 1, 2, 0], m, 1.5, (i) => [1.24, 1.27, 1.04][i], "gcode")!;
    // 0→1: 500 mm³ × 1,5 × 1,27; 1→2: 400 × 1,5 × 1,04; 2→0: 100 × 1,5 × 1,24
    expect(w.byFilament).toEqual([
      { index: 1, grams: 0.19 },
      { index: 2, grams: 0.95 },
      { index: 3, grams: 0.62 },
    ]);
    expect(w.swaps).toBe(3);
    expect(purgeWaste([0], m, 1, () => 1.24, "gcode")).toBeNull(); // uma cor só: sem purga
  });

  test("G-code do Bambu com trocas: purga calculada pela matriz do próprio arquivo", () => {
    const g = [
      "; HEADER_BLOCK_START",
      "; BambuStudio 02.08.02.61",
      "; total estimated time: 30m 0s",
      "; total filament weight [g] : 10.00,2.00",
      "; HEADER_BLOCK_END",
      "; flush_volumes_matrix = 0,616,229,0",
      "; flush_multiplier = 1",
      "; filament_density: 1.26,1.26",
      "M620 S0A",
      "M620 S1A",
      "M620 S0A",
      "M620 S1A",
    ].join("\n");
    const r = parseSlicerFile("x.gcode", enc(g));
    // 0→1 (616) + 1→0 (229) + 0→1 (616) = 1461 mm³
    expect(r.waste).toMatchObject({ swaps: 3, included: true, from: "gcode", grams: 1.84 }); // 0,29 ≤ 10 g e 1,55 ≤ 2 g
    expect(r.waste!.byFilament).toEqual([
      { index: 1, grams: 0.29 },
      { index: 2, grams: 1.55 },
    ]);
  });

  test("PrusaSlicer/Orca: a torre já está no consumo; só informa", () => {
    const g = ["; generated by PrusaSlicer 2.8.1", "; filament used [g] = 12.5, 4.0", "; total filament used for wipe tower [g] = 3.20", "; estimated printing time (normal mode) = 1h 2m 3s"].join("\n");
    expect(parseSlicerFile("x.gcode", enc(g)).waste).toEqual({ byFilament: [], grams: 3.2, swaps: 0, included: true, from: "torre" });
  });

  test("uma cor só (G-code real do Cura): sem desperdício", () => {
    expect(parseSlicerFile("cura-1cor.gcode", fixture("cura-1cor.gcode")).waste).toBeUndefined();
  });
});
