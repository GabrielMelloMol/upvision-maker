import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseSlicerFile } from "./index";
import { pieceName } from "./types";

const fx = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, "../../../tests/fixtures/slicer", name)));
const parse = (name: string) => parseSlicerFile(name, fx(name));

describe("importar arquivo do fatiador", () => {
  test("3MF fatiado do Bambu Studio (real): gramas por filamento, cor, tipo, tempo, peças e impressora", () => {
    const r = parse("bambu-a1-2cores-fatiado.3mf");
    expect(r.source).toBe("Bambu Studio / OrcaSlicer (3MF)");
    expect(r.printer).toBe("Bambu Lab A1");
    expect(r.seconds).toBe(1243);
    expect(r.pieces).toBe(3);
    expect(r.filaments).toEqual([
      { index: 1, type: "PLA", color: "#0A2CA5", grams: 3.79, meters: 1.25 },
      { index: 2, type: "PLA", color: "#FFFFFF", grams: 0.55, meters: 0.18 },
    ]);
  });

  test("G-code do Bambu Studio (real)", () => {
    const r = parse("bambu-a1-2cores.gcode");
    expect(r.printer).toBe("Bambu Lab A1");
    expect(r.seconds).toBe(20 * 60 + 43);
    expect(r.pieces).toBe(3);
    expect(r.filaments.map((f) => [f.type, f.color, f.grams])).toEqual([
      ["PLA", "#0A2CA5", 3.79],
      ["PLA", "#FFFFFF", 0.55],
    ]);
  });

  test("G-code do PrusaSlicer: estatísticas no fim do arquivo", () => {
    const r = parse("prusa-mk4-2cores.gcode");
    expect(r.source).toBe("PrusaSlicer (G-code)");
    expect(r.printer).toBe("MK4");
    expect(r.seconds).toBe(3723);
    expect(r.pieces).toBe(2);
    expect(r.filaments).toEqual([
      { index: 1, type: "PETG", color: "#FF8000", grams: 6.95, meters: 2.31 },
      { index: 2, type: "PLA", color: "#FFFFFF", grams: 1.22, meters: 0.41 },
    ]);
  });

  test("G-code do Cura: só metros → gramas estimadas (PLA 1,75 mm, 1,24 g/cm³) com aviso", () => {
    const r = parse("cura-1cor.gcode");
    expect(r.source).toBe("Cura (G-code)");
    expect(r.printer).toBe("Creality Ender-3 V3 SE");
    expect(r.seconds).toBe(5025);
    expect(r.pieces).toBe(2);
    // π × 0,0875² cm² × 312,345 cm × 1,24 g/cm³ ≈ 9,32 g
    expect(r.filaments[0].grams).toBeCloseTo(9.32, 1);
    expect(r.warnings.join()).toMatch(/estimad/i);
  });

  test("densidade por material (#47): metros → gramas pelo tipo e diâmetro; sem tipo conhecido, PLA", async () => {
    const { gramsFromMeters } = await import("./gcodeText");
    expect(gramsFromMeters(3.12345, "PLA")).toMatchObject({ grams: 9.32, density: 1.24, material: "PLA" });
    expect(gramsFromMeters(3.12345, "PETG")).toMatchObject({ grams: 9.54, density: 1.27 }); // 7,513 cm³ × 1,27
    expect(gramsFromMeters(3.12345, "petg")).toMatchObject({ density: 1.27 }); // o fatiador escreve de vários jeitos
    expect(gramsFromMeters(1, "Madeira")).toMatchObject({ density: 1.24, material: "PLA" });
    expect(gramsFromMeters(1, undefined, 2.85).grams).toBe(7.91); // π × 0,1425² × 100 × 1,24
  });

  test("Cura com diâmetro 2,85 mm nas configurações: estima com ele e marca as gramas como estimadas", () => {
    const gcode = ";FLAVOR:Marlin\n;TIME:600\n;Filament used: 1m\n;Generated with Cura_SteamEngine 5.8.0\n;SETTING_3 {\"global_quality\": \"[values]\\nmaterial_diameter = 2.85\\n\"}\n";
    const r = parseSlicerFile("peca.gcode", new TextEncoder().encode(gcode));
    expect(r.filaments[0]).toMatchObject({ grams: 7.91, meters: 1, estimatedDiameterMm: 2.85 });
    expect(r.warnings.join()).toMatch(/2,85 mm/);
  });

  test("G-code binário da Prusa (.bgcode), com bloco comprimido", () => {
    const r = parse("prusa-coreone.bgcode");
    expect(r.printer).toBe("COREONE");
    expect(r.seconds).toBe(45 * 60 + 12);
    expect(r.pieces).toBe(3);
    expect(r.filaments).toEqual([{ index: 1, type: "PLA", color: "#E0E0E0", grams: 4.53, meters: 1.52 }]);
  });

  test("3MF sem fatiar dá erro que explica o que fazer", () => {
    expect(() => parse("projeto-nao-fatiado.3mf")).toThrow(/fatie/i);
  });

  test("arquivo desconhecido ou corrompido dá erro amigável", () => {
    expect(() => parseSlicerFile("x.stl", new Uint8Array([1, 2, 3]))).toThrow(/3MF, G-code/);
    expect(() => parseSlicerFile("x.3mf", new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => parseSlicerFile("x.gcode", new TextEncoder().encode("G1 X1\nG1 X2\n"))).toThrow(/não encontrei/i);
  });
});

describe("nome da peça", () => {
  test("nome do arquivo sem extensões de fatiador, com _ e - viram espaço", () => {
    expect(pieceName("chaveiro_coracao-v2.gcode.3mf")).toBe("chaveiro coracao v2");
    expect(pieceName("C:\\\\Downloads\\\\Topo__de-bolo.bgcode")).toBe("Topo de bolo");
    expect(pieceName("vaso.stl.gcode")).toBe("vaso");
  });

  test("3MF com vários objetos de nomes diferentes usa o nome do arquivo", () => {
    expect(parse("bambu-a1-2cores-fatiado.3mf").name).toBe("bambu a1 2cores fatiado");
  });

  test("3MF com um objeto só usa o nome do objeto", () => {
    const zip = unzipSync(fx("bambu-a1-2cores-fatiado.3mf"));
    const info = strFromU8(zip["Metadata/slice_info.config"]).replace(/name="(Ana|Bia|Caio)"/g, 'name="Chaveiro_Ana.stl"');
    const one = zipSync({ ...zip, "Metadata/slice_info.config": strToU8(info) });
    expect(parseSlicerFile("projeto.3mf", one).name).toBe("Chaveiro Ana");
  });
});
