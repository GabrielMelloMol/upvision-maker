import { numList, parseDuration, round2, splitList, type SlicerFilament, type SlicerReport } from "./types";
import { flushMatrix, purgeWaste, toolSequence, type SlicerWaste } from "./waste";

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
  // PrusaSlicer/Orca: a torre de limpeza já está dentro do "filament used"; só informa (#147)
  const tower = Number(kv.get("total filament used for wipe tower [g]"));
  const waste: SlicerWaste | undefined = tower > 0 ? { byFilament: [], grams: round2(tower), swaps: 0, included: true, from: "torre" } : undefined;
  return {
    source,
    ...(waste && { waste }),
    printer: kv.get("printer_model") || undefined,
    seconds: parseDuration(kv.get("estimated printing time (normal mode)") ?? ""),
    pieces: objectsCount(kv.get("objects_info")),
    filaments,
    warnings: [],
  };
}

function fromBambu(text: string, kv: Map<string, string>, full: () => string[]): SlicerReport {
  const time = /total estimated time:\s*([^;\n]+)/.exec(text)?.[1];
  const labels = kv.get("model label id");
  const filaments = filamentsFrom(numList(kv.get("total filament weight [g]")), numList(kv.get("total filament length [mm]")), splitList(kv.get("filament_type")), splitList(kv.get("filament_colour")));
  if (!filaments.length || filaments.every((f) => !f.grams)) throw new Error("Não encontrei o peso do filamento neste G-code. Confira a densidade do filamento no fatiador.");
  const matrix = flushMatrix(numList(kv.get("flush_volumes_matrix")));
  const density = numList(kv.get("filament_density"));
  const seq = matrix ? full().flatMap(toolSequence).filter((t, i, a) => i === 0 || a[i - 1] !== t) : [];
  const waste = matrix ? purgeWaste(seq, matrix, Number(kv.get("flush_multiplier")) || 1, (i) => density[i] || DENSITY.PLA, "gcode") : null;
  return { source: "Bambu Studio / OrcaSlicer (G-code)", printer: kv.get("printer_model") || undefined, seconds: time ? parseDuration(time) : undefined, pieces: labels ? splitList(labels).length : undefined, filaments, ...(waste && { waste }), warnings: [] };
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

/** Simplify3D: "Build Summary" no fim (tempo em texto, comprimento em mm e peso em g). */
function fromSimplify3d(text: string): SlicerReport {
  const grams = Number(/Plastic weight:\s*([\d.]+)\s*g/i.exec(text)?.[1]);
  const mm = Number(/Filament length:\s*([\d.]+)\s*mm/i.exec(text)?.[1]);
  if (!(grams > 0) && !(mm > 0)) throw new Error("Não encontrei o resumo de impressão (Build Summary) neste G-code do Simplify3D.");
  const type = /printMaterial,\s*([A-Za-z]+)/.exec(text)?.[1]?.toUpperCase();
  return {
    source: "Simplify3D (G-code)",
    seconds: parseDuration(/Build time:\s*([^\n]+)/i.exec(text)?.[1] ?? ""),
    filaments: [{ index: 1, ...(type && { type }), ...(grams > 0 && { grams: round2(grams) }), ...(mm > 0 && { meters: round2(mm / 1000) }) }],
    warnings: [],
  };
}

const num = (m: RegExpExecArray | null) => (m ? Number(m[1]) : NaN);

/**
 * Fatiador desconhecido: procura tempo e consumo pelos nomes mais comuns nos comentários (#42). Peso direto quando
 * houver; senão comprimento ou volume convertidos com a densidade do PLA. Sempre com aviso de "estimado".
 */
export function fromGeneric(text: string): SlicerReport {
  const tSec = num(/^;\s*TIME:\s*(\d+)/im.exec(text));
  const tText = /(?:estimated printing time|print(?:ing)? time|build time)[^:=\n]*[:=]\s*([^\n;]+)/i.exec(text)?.[1];
  const seconds = tSec > 0 ? tSec : parseDuration(tText ?? "");
  const g = num(/(?:weight|filament used)[^:=\n]*[:=]\s*([\d.]+)\s*g\b/i.exec(text));
  const len = /(?:filament (?:used|length)|material#?\d* used)[^:=\n]*[:=]\s*([\d.]+)\s*(mm|m)\b/i.exec(text);
  const meters = len ? Number(len[1]) / (len[2].toLowerCase() === "mm" ? 1000 : 1) : NaN;
  const cm3 = num(/volume[^:=\n]*[:=]\s*([\d.]+)\s*(?:cm3|cm³|cc)\b/i.exec(text));
  const grams = g > 0 ? g : meters > 0 ? gramsFromMeters(meters).grams : cm3 > 0 ? cm3 * DENSITY.PLA : NaN;
  if (!(grams > 0)) throw new Error("Não encontrei os dados do fatiador neste G-code (tempo e consumo de filamento). Importe o 3MF do projeto ou digite os valores.");
  const byWeight = g > 0;
  return {
    source: "Fatiador não reconhecido (G-code)",
    seconds,
    filaments: [{ index: 1, grams: round2(grams), ...(meters > 0 && { meters: round2(meters) }), ...(!byWeight && meters > 0 && { estimatedDiameterMm: DEFAULT_DIAMETER_MM }) }],
    warnings: [
      byWeight
        ? "Fatiador não reconhecido: tempo e peso foram lidos dos comentários do arquivo. Confira."
        : "Fatiador não reconhecido: as gramas foram estimadas pelo comprimento (ou volume) do filamento, como PLA. Confira.",
    ],
  };
}

/** Derivados do OrcaSlicer/PrusaSlicer com as mesmas chaves de estatística ("filament used [g]", "estimated printing time"). */
const ORCA_FAMILY: [RegExp, string][] = [
  [/Creality_Print|CrealityPrint/i, "Creality Print"],
  [/AnycubicSlicer/i, "Anycubic Slicer Next"],
  [/ElegooSlicer/i, "Elegoo Slicer"],
];

/** O arquivo inteiro em pedaços de 8 MB (as trocas de cor ficam espalhadas; o cabeçalho só lê o começo e o fim). */
function chunks(bytes: Uint8Array): string[] {
  const dec = new TextDecoder();
  const out: string[] = [];
  const size = 8 * 1024 * 1024;
  // cada pedaço começa numa quebra de linha: nenhuma linha fica cortada entre dois pedaços
  for (let start = 0; start < bytes.length; ) {
    let end = Math.min(bytes.length, start + size);
    while (end < bytes.length && bytes[end - 1] !== 10) end++;
    out.push(dec.decode(bytes.subarray(start, end)));
    start = end;
  }
  return out;
}

export function parseGcodeText(bytes: Uint8Array): SlicerReport {
  const dec = new TextDecoder();
  const text = bytes.length > 2 * HEAD_TAIL ? dec.decode(bytes.subarray(0, HEAD_TAIL)) + "\n" + dec.decode(bytes.subarray(bytes.length - HEAD_TAIL)) : dec.decode(bytes);
  const kv = keyValues(text);
  const head = text.slice(0, 4096);
  if (/BambuStudio|OrcaSlicer/i.test(head)) return fromBambu(text, kv, () => chunks(bytes));
  const family = ORCA_FAMILY.find(([re]) => re.test(head));
  if (family) return fromPrusaKeys(kv, `${family[1]} (G-code)`);
  if (/PrusaSlicer|SuperSlicer/i.test(text)) return fromPrusaKeys(kv, "PrusaSlicer (G-code)");
  if (/^;FLAVOR:|Cura_SteamEngine/m.test(text)) return fromCura(text, kv);
  if (/Simplify3D/i.test(head)) return fromSimplify3d(text);
  return fromGeneric(text);
}
