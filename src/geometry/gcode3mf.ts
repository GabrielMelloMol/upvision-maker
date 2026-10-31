/**
 * G-code da caneta dentro de um .gcode.3mf (#311): as Bambu imprimem pela tela/cartão o formato "plate sliced" do
 * Bambu Studio (Metadata/plate_1.gcode + MD5 + configs da mesa), e um .gcode solto às vezes nem aparece na lista.
 * Estrutura mínima seguindo o bambox (github.com/estampo/bambox, docs/gcode-3mf-format.md).
 */
import { strToU8, zipSync } from "fflate";

/** Código do modelo que o Bambu Studio grava no arquivo; desconhecido = vazio. */
export function bambuModelId(printerName = ""): string {
  const n = printerName.toLowerCase();
  const ids: [RegExp, string][] = [[/a1\s*mini/, "N1"], [/\ba1\b/, "N2S"], [/p1s/, "C12"], [/p1p/, "C11"], [/x1\s*e\b/, "C13"], [/x1/, "BL-P001"], [/h2d/, "O1D"]];
  return ids.find(([re]) => re.test(n))?.[1] ?? "";
}

const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;

export function gcode3mf(gcode: string, opts: { printerName?: string; minutes: number }): Uint8Array {
  const g = strToU8(gcode);
  const seconds = Math.round(opts.minutes * 60);
  const plate = (extra: string) => `  <plate>\n${extra}  </plate>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`),
    ),
    "_rels/.rels": strToU8(xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>`)),
    "3D/3dmodel.model": strToU8(xml(`<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n <metadata name="Application">UpVision Maker</metadata>\n <resources/>\n <build/>\n</model>`)),
    "Metadata/plate_1.gcode": g,
    "Metadata/plate_1.gcode.md5": strToU8(md5(g).toUpperCase()),
    "Metadata/model_settings.config": strToU8(
      xml(`<config>\n${plate(
        ["plater_id\" value=\"1", "plater_name\" value=\"", "locked\" value=\"false", "gcode_file\" value=\"Metadata/plate_1.gcode", "thumbnail_file\" value=\"Metadata/plate_1.png", "pattern_bbox_file\" value=\"Metadata/plate_1.json"]
          .map((kv) => `    <metadata key="${kv}"/>\n`)
          .join(""),
      )}\n</config>`),
    ),
    "Metadata/_rels/model_settings.config.rels": strToU8(xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/Metadata/plate_1.gcode" Id="rel-1" Type="http://schemas.bambulab.com/package/2021/gcode"/>\n</Relationships>`)),
    "Metadata/slice_info.config": strToU8(
      xml(`<config>\n  <header>\n    <header_item key="X-BBL-Client-Type" value="slicer"/>\n    <header_item key="X-BBL-Client-Version" value="02.05.00.66"/>\n  </header>\n${plate(
        [["index", "1"], ["extruder_type", "0"], ["nozzle_volume_type", "0"], ["printer_model_id", bambuModelId(opts.printerName)], ["nozzle_diameters", "0.4"], ["timelapse_type", "0"], ["prediction", String(seconds)], ["weight", "0"], ["outside", "false"], ["support_used", "false"], ["label_object_enabled", "false"]]
          .map(([k, v]) => `    <metadata key="${k}" value="${v}"/>\n`)
          .join(""),
      )}\n</config>`),
    ),
    "Metadata/plate_1.json": strToU8(JSON.stringify({ bed_type: "textured_plate", version: 2 })),
  });
}

/** MD5 (RFC 1321) em hexa minúsculo; o Bambu confere o G-code por ele. */
export function md5(bytes: Uint8Array): string {
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const len = bytes.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (len * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(len / 2 ** 29), true);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let off = 0; off < padded.length; off += 64) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      const r = i >> 4;
      const fn = r === 0 ? (b & c) | (~b & d) : r === 1 ? (d & b) | (~d & c) : r === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = r === 0 ? i : r === 1 ? (5 * i + 1) % 16 : r === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const t = (a + fn + K[i] + view.getUint32(off + g * 4, true)) | 0;
      const sh = S[r * 4 + (i % 4)];
      [a, d, c] = [d, c, b];
      b = (b + ((t << sh) | (t >>> (32 - sh)))) | 0;
    }
    [a0, b0, c0, d0] = [(a0 + a) | 0, (b0 + b) | 0, (c0 + c) | 0, (d0 + d) | 0];
  }
  return [a0, b0, c0, d0].map((w) => Array.from({ length: 4 }, (_, i) => ((w >>> (8 * i)) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}
