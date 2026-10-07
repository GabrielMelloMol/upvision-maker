import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, strToU8, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { featureGrams } from "./features";
import { parseSlicerFile } from "./index";

const fixture = (f: string) => new Uint8Array(readFileSync(resolve(__dirname, "../../../tests/fixtures/slicer", f)));
// 1 mm de fio de 1,75 mm = 2,405 mm³
const MM3_PER_MM = Math.PI * 0.875 ** 2;

describe("gramas de suporte e torre pelo G-code (#147)", () => {
  test("E relativo: soma só as extrusões com movimento de cada tipo, com a densidade do filamento da vez", () => {
    const g = [
      "M83",
      "; FEATURE: Outer wall",
      "G1 X10 Y10 E100",
      "; FEATURE: Support",
      "G1 X20 E100",
      "G1 E-0.8 ; retração não conta",
      "G1 E0.8 ; volta da retração sem movimento não conta",
      "; FEATURE: Support interface",
      "G1 Y5 E100",
      "M620 S1A",
      "; FEATURE: Prime tower",
      "G1 X1 Y1 E100",
    ].join("\n");
    const r = featureGrams([g], (t) => (t === 1 ? 2 : 1));
    expect(r.support).toBeCloseTo((200 * MM3_PER_MM) / 1000, 2);
    expect(r.tower).toBeCloseTo((100 * MM3_PER_MM * 2) / 1000, 2);
  });

  test("E absoluto (M82) conta a diferença entre linhas e respeita o G92 E0; tipo cortado entre pedaços continua", () => {
    const a = ["M82", "G92 E0", "; FEATURE: Support", "G1 X1 E100"].join("\n");
    const b = ["G1 X2 E300", "G92 E0", "G1 X3 E50"].join("\n");
    expect(featureGrams([a, b], () => 1).support).toBeCloseTo((350 * MM3_PER_MM) / 1000, 2);
  });

  test("G-code real da A1 (peça em T, suporte normal): 3,67 g de suporte nas 7,04 g do fatiador", () => {
    const bytes = gunzipSync(fixture("bambu-a1-suporte-normal.gcode.gz"));
    const r = parseSlicerFile("bambu-a1-suporte-normal.gcode", bytes);
    expect(r.filaments.map((f) => f.grams)).toEqual([7.04]); // o suporte já está nas gramas
    expect(r.support?.grams).toBeCloseTo(3.67, 1);
    expect(r.support?.tree).toBe(false);
    expect(r.tower).toBeUndefined();
  });

  test("3MF fatiado com o G-code dentro: suporte lido das mesas e o tipo (árvore) pelas configurações do projeto", () => {
    const zip = zipSync({
      "Metadata/slice_info.config": strToU8('<config><plate><metadata key="prediction" value="600"/><filament id="1" type="PLA" color="#FFFFFF" used_m="2.3" used_g="7.04"/></plate></config>'),
      "Metadata/project_settings.config": strToU8(JSON.stringify({ support_type: "tree(auto)", filament_density: ["1.26"] })),
      "Metadata/plate_1.gcode": gunzipSync(fixture("bambu-a1-suporte-normal.gcode.gz")),
    });
    const r = parseSlicerFile("peca.gcode.3mf", zip);
    expect(r.support?.grams).toBeCloseTo(3.67, 1);
    expect(r.support?.tree).toBe(true);
  });

  test("3MF com a configuração do projeto ilegível avisa que a purga e a impressora ficaram de fora (B12)", () => {
    const slice = '<config><plate><metadata key="prediction" value="600"/><filament id="1" type="PLA" color="#FFFFFF" used_m="2.3" used_g="7.04"/></plate></config>';
    const broken = parseSlicerFile("peca.3mf", zipSync({ "Metadata/slice_info.config": strToU8(slice), "Metadata/project_settings.config": strToU8("{ isto não é json") }));
    expect(broken.warnings.join()).toMatch(/configuração do projeto/);
    expect(broken.warnings.join()).toMatch(/purga/);
    const ok = parseSlicerFile("peca.3mf", zipSync({ "Metadata/slice_info.config": strToU8(slice), "Metadata/project_settings.config": strToU8("{}") }));
    expect(ok.warnings).toEqual([]);
    const missing = parseSlicerFile("peca.3mf", zipSync({ "Metadata/slice_info.config": strToU8(slice) })); // sem o arquivo: nada a avisar
    expect(missing.warnings).toEqual([]);
  });
});
