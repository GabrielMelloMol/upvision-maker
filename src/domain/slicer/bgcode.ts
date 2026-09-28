import { unzlibSync } from "fflate";
import { fromPrusaKeys, keyValues } from "./gcodeText";
import type { SlicerReport } from "./types";

const MAGIC = "GCDE";
const BLOCK_GCODE = 1;
const BLOCK_THUMBNAIL = 5;
const COMPRESSION_NONE = 0;
const COMPRESSION_DEFLATE = 1;

/** G-code binário v1 da Prusa: lê os blocos de metadados (INI) e ignora G-code e miniaturas. */
export function parseBgcode(bytes: Uint8Array): SlicerReport {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error("Arquivo .bgcode inválido.");
  const checksum = v.getUint16(8, true) === 1 ? 4 : 0;
  let o = 10;
  let ini = "";
  while (o + 8 <= bytes.length) {
    const type = v.getUint16(o, true);
    const compression = v.getUint16(o + 2, true);
    const size = v.getUint32(o + 4, true);
    let h = o + 8;
    let dataSize = size;
    if (compression !== COMPRESSION_NONE) {
      dataSize = v.getUint32(h, true);
      h += 4;
    }
    const params = type === BLOCK_THUMBNAIL ? 6 : 2;
    const data = bytes.subarray(h + params, h + params + dataSize);
    if (type !== BLOCK_GCODE && type !== BLOCK_THUMBNAIL) {
      if (compression === COMPRESSION_NONE) ini += new TextDecoder().decode(data) + "\n";
      else if (compression === COMPRESSION_DEFLATE) ini += new TextDecoder().decode(unzlibSync(data)) + "\n";
      // heatshrink só é usado em blocos de G-code
    }
    o = h + params + dataSize + checksum;
  }
  return { ...fromPrusaKeys(keyValues(ini), "PrusaSlicer (G-code binário)") };
}
