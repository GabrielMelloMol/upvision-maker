import { parseBgcode } from "./bgcode";
import { parseGcodeText } from "./gcodeText";
import { parse3mf } from "./threemf";
import type { SlicerReport } from "./types";

export type { SlicerFilament, SlicerReport } from "./types";
export const SLICER_ACCEPT = ".3mf,.gcode,.gco,.g,.bgcode";
const MAX_BYTES = 200 * 1024 * 1024;

/** Lê o consumo e o tempo de um arquivo de fatiador (.3mf fatiado, .gcode, .bgcode). */
export function parseSlicerFile(name: string, bytes: Uint8Array): SlicerReport {
  if (bytes.length > MAX_BYTES) throw new Error("Arquivo maior que 200 MB.");
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "3mf") return parse3mf(bytes);
  if (ext === "bgcode") return parseBgcode(bytes);
  if (ext === "gcode" || ext === "gco" || ext === "g") return parseGcodeText(bytes);
  throw new Error("Use um arquivo 3MF, G-code ou G-code binário (.bgcode) do fatiador.");
}
