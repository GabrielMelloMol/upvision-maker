import { numList, parseDuration, round2, splitList, type SlicerFilament, type SlicerReport } from "./types";

const HEAD_TAIL = 256 * 1024; // estatísticas ficam no começo (Bambu/Cura) ou no fim (Prusa)
/** Densidade típica (g/cm³) de cada material, para estimar gramas de quem só informa metros (#47). Varia ±3% por marca. */
export const DENSITY: Record<string, number> = { PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, TPU: 1.21, PC: 1.2, NYLON: 1.14 };
const DEFAULT_DIAMETER_MM = 1.75;

/** Gramas a partir dos metros de filamento: área do fio × comprimento × densidade do material (PLA se não souber). */
export function gramsFromMeters(meters: number, material?: string, diameterMm = DEFAULT_DIAMETER_MM): { grams: number; density: number; material: string } {
  const key = (material ?? "").trim().toUpperCase();
  const known = key in DENSITY ? key : "PLA";
  const density = DENSITY[known];
  const areaCm2 = Math.PI * (diameterMm / 20) ** 2;
  return { grams: round2(areaCm2 * meters * 100 * density), density, material: known === "NYLON" ? "Nylon" : known };
}

const dec = (n: number) => n.toLocaleString("pt-BR");

/** Chaves "; chave = valor" ou "; chave : valor" do G-code (e INI do .bgcode). */
export function keyValues(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^;?\s*([A-Za-z][\w .[\]()/-]*?)\s*[=:]\s*(.*)$/.exec(line);
    if (m && !map.has(m[1].toLowerCase())) map.set(m[1].toLowerCase(), m[2].trim());
  }
  return map;
}

function objectsCount(json: string | undefined): number | undefined {
  if (!json) return undefined;
  try {
    return (JSON.parse(json) as { objects?: unknown[] }).objects?.length;
  } catch {
    return undefined;
  }
}

/** Filamentos a partir das listas (gramas, mm, tipo, cor) de um fatiador estilo Prusa/Bambu. */
function filamentsFrom(grams: number[], mm: number[], types: string[], colors: string[]): SlicerFilament[] {
  const n = Math.max(grams.length, mm.length);
  return Array.from({ length: n }, (_, i) => ({
    index: i + 1,
    ...(types[i] && { type: types[i] }),
    ...(colors[i] && { color: colors[i].toUpperCase() }),
    ...(grams[i] !== undefined && { grams: round2(grams[i]) }),
    ...(mm[i] !== undefined && { meters: round2(mm[i] / 1000) }),
  })).filter((f) => (f.grams ?? 0) > 0 || (f.meters ?? 0) > 0);
}

/** Relatório no formato de metadados do PrusaSlicer (G-code texto ou .bgcode). */
export function fromPrusaKeys(kv: Map<string, string>, source: string): SlicerReport {
  const filaments = filamentsFrom(numList(kv.get("filament used [g]")), numList(kv.get("filament used [mm]")), splitList(kv.get("filament_type")), splitList(kv.get("filament_colour")));
  if (!filaments.length) throw new Error("Não encontrei o consumo de filamento neste arquivo.");
  return {
    source,
    printer: kv.get("printer_model") || undefined,
    seconds: parseDuration(kv.get("estimated printing time (normal mode)") ?? ""),
    pieces: objectsCount(kv.get("objects_info")),
    filaments,
    warnings: [],
  };
}

function fromBambu(text: string, kv: Map<string, string>): SlicerReport {
  const time = /total estimated time:\s*([^;\n]+)/.exec(text)?.[1];
  const labels = kv.get("model label id");
  const filaments = filamentsFrom(numList(kv.get("total filament weight [g]")), numList(kv.get("total filament length [mm]")), splitList(kv.get("filament_type")), splitList(kv.get("filament_colour")));
  if (!filaments.length || filaments.every((f) => !f.grams)) throw new Error("Não encontrei o peso do filamento neste G-code. Confira a densidade do filamento no fatiador.");
  return { source: "Bambu Studio / OrcaSlicer (G-code)", printer: kv.get("printer_model") || undefined, seconds: time ? parseDuration(time) : undefined, pieces: labels ? splitList(labels).length : undefined, filaments, warnings: [] };
}

function fromCura(text: string, kv: Map<string, string>): SlicerReport {
  const meters = numList(kv.get("filament used")?.replace(/m\b/g, ""));
  if (!meters.length) throw new Error("Não encontrei o consumo de filamento neste G-code.");
  const diameter = Number(/material_diameter\s*=\s*(\d+(?:\.\d+)?)/.exec(text)?.[1]) || DEFAULT_DIAMETER_MM;
  const meshes = new Set([...text.matchAll(/^;MESH:(.+)$/gm)].map((m) => m[1].trim()).filter((m) => m !== "NONMESH"));
  return {
    source: "Cura (G-code)",
    printer: kv.get("target_machine.name") || undefined,
    seconds: kv.has("time") ? Math.round(Number(kv.get("time"))) : undefined,
    pieces: meshes.size || undefined,
    // sem o tipo do material no arquivo: estima como PLA; a tela refaz com o filamento escolhido em cada linha
    filaments: meters.map((m, i) => ({ index: i + 1, meters: m, grams: gramsFromMeters(m, undefined, diameter).grams, estimatedDiameterMm: diameter })), // metros sem arredondar: as gramas são refeitas deles
    warnings: [`O Cura só informa metros: as gramas são estimadas pela densidade do material escolhido em cada linha (PLA 1,24 g/cm³ se não souber) e fio de ${dec(diameter)} mm. Confira.`],
  };
}

export function parseGcodeText(bytes: Uint8Array): SlicerReport {
  const dec = new TextDecoder();
  const text = bytes.length > 2 * HEAD_TAIL ? dec.decode(bytes.subarray(0, HEAD_TAIL)) + "\n" + dec.decode(bytes.subarray(bytes.length - HEAD_TAIL)) : dec.decode(bytes);
  const kv = keyValues(text);
  if (/BambuStudio|OrcaSlicer/i.test(text.slice(0, 4096))) return fromBambu(text, kv);
  if (/PrusaSlicer|SuperSlicer/i.test(text)) return fromPrusaKeys(kv, "PrusaSlicer (G-code)");
  if (/^;FLAVOR:|Cura_SteamEngine/m.test(text)) return fromCura(text, kv);
  throw new Error("Não encontrei os dados do fatiador neste G-code (use Bambu Studio, OrcaSlicer, PrusaSlicer ou Cura).");
}
