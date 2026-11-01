import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "vitest";
import { bambuModelId, gcode3mf, md5 } from "./gcode3mf";

const enc = (s: string) => new TextEncoder().encode(s);

test("md5 confere com o do Node (vazio, curto, bloco exato e texto grande)", () => {
  expect(md5(enc(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
  expect(md5(enc("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
  for (const s of ["a".repeat(55), "b".repeat(56), "c".repeat(64), "G1 X1.00 Y2.00 F1500\n".repeat(5000)]) expect(md5(enc(s))).toBe(createHash("md5").update(s).digest("hex"));
});

test(".gcode.3mf: zip abre, traz o G-code intacto com MD5 maiúsculo e o modelo da impressora", () => {
  const g = "; UpVision\nG28\nG1 Z5\n";
  const files = unzipSync(gcode3mf(g, { printerName: "Bambu Lab A1", minutes: 3.5 }));
  expect(Object.keys(files).sort()).toEqual(
    ["3D/3dmodel.model", "Metadata/_rels/model_settings.config.rels", "Metadata/model_settings.config", "Metadata/plate_1.gcode", "Metadata/plate_1.gcode.md5", "Metadata/plate_1.json", "Metadata/slice_info.config", "[Content_Types].xml", "_rels/.rels"].sort(),
  );
  expect(strFromU8(files["Metadata/plate_1.gcode"])).toBe(g);
  expect(strFromU8(files["Metadata/plate_1.gcode.md5"])).toBe(createHash("md5").update(g).digest("hex").toUpperCase());
  const info = strFromU8(files["Metadata/slice_info.config"]);
  expect(info).toContain('key="printer_model_id" value="N2S"');
  expect(info).toContain('key="prediction" value="210"');
  expect(info.indexOf("extruder_type")).toBeLessThan(info.indexOf("printer_model_id"));
  expect(strFromU8(files["Metadata/model_settings.config"])).toContain('value="Metadata/plate_1.gcode"');
});

test("modelo da Bambu pelo nome; outra marca fica vazio", () => {
  expect(bambuModelId("Bambu Lab A1 mini")).toBe("N1");
  expect(bambuModelId("A1")).toBe("N2S");
  expect(bambuModelId("Bambu Lab P1S")).toBe("C12");
  expect(bambuModelId("Bambu Lab X1 Carbon")).toBe("BL-P001");
  expect(bambuModelId("Ender 3")).toBe("");
});
