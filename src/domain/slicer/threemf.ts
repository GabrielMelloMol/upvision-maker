import { strFromU8 } from "fflate";
import { safeUnzip, ZipTooBig } from "../safeUnzip";
import { featureGrams } from "./features";
import { pieceName, round2, type SlicerFilament, type SlicerReport } from "./types";
import { flushMatrix, purgeWaste, sequenceFromLayers, toolSequence, type SlicerWaste } from "./waste";

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

/** 3MF de projeto fatiado do Bambu Studio / OrcaSlicer (Metadata/slice_info.config). Várias mesas são somadas. */
export function parse3mf(bytes: Uint8Array): SlicerReport {
  let files: Record<string, Uint8Array>;
  try {
    files = safeUnzip(bytes, (f) => f.name.startsWith("Metadata/") && /\.(config|json|gcode)$/.test(f.name));
  } catch (e) {
    throw e instanceof ZipTooBig ? e : new Error("Não consegui abrir este 3MF (arquivo corrompido?).");
  }
  const info = files["Metadata/slice_info.config"];
  const xml = info ? strFromU8(info) : "";
  const plates = [...xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((m) => m[1]);
  const byId = new Map<number, SlicerFilament>();
  let seconds = 0;
  let pieces = 0;
  const names = new Set<string>();
  for (const plate of plates) {
    const meta = Object.fromEntries([...plate.matchAll(/<metadata\s+key="([^"]+)"\s+value="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    seconds += Number(meta.prediction) || 0;
    const objects = [...plate.matchAll(/<object\b([^>]*)\/?>/g)].map((m) => attrs(m[1])).filter((a) => a.skipped !== "true");
    pieces += objects.length;
    for (const o of objects) if (o.name) names.add(pieceName(o.name));
    for (const m of plate.matchAll(/<filament\b([^>]*)\/?>/g)) {
      const a = attrs(m[1]);
      const id = Number(a.id);
      const cur = byId.get(id) ?? { index: id, type: a.type, color: a.color?.toUpperCase(), grams: 0, meters: 0 };
      byId.set(id, { ...cur, grams: round2((cur.grams ?? 0) + Number(a.used_g || 0)), meters: round2((cur.meters ?? 0) + Number(a.used_m || 0)) });
    }
  }
  const filaments = [...byId.values()].filter((f) => (f.grams ?? 0) > 0).sort((a, b) => a.index - b.index);
  if (!filaments.length) throw new Error("Este 3MF ainda não foi fatiado. Fatie no Bambu Studio/OrcaSlicer e salve o projeto, ou importe o G-code.");
  const read = readSettings(files["Metadata/project_settings.config"]);
  const settings = read.settings;
  const printer = settings.printer_model || undefined;
  const waste = multicolorWaste(files, plates, settings);
  // suporte e torre (#147): só com o G-code das mesas dentro do 3MF ("Exportar 3MF fatiado")
  const gcodes = plates.flatMap((_, p) => files[`Metadata/plate_${p + 1}.gcode`] ?? []).map((g) => strFromU8(g));
  const extra = featureGrams(gcodes, (i) => Number(settings.filament_density?.[i]) || 1.24);
  const [only] = names;
  return {
    source: "Bambu Studio / OrcaSlicer (3MF)",
    name: names.size === 1 && only ? only : undefined,
    printer,
    seconds: seconds || undefined,
    pieces: pieces || undefined,
    filaments,
    ...(waste && { waste }),
    ...(extra.support > 0 && { support: { grams: extra.support, tree: /tree/i.test(String(settings.support_type ?? "")) } }),
    ...(extra.tower > 0 && { tower: extra.tower }),
    warnings: [
      ...(plates.length > 1 ? [`O projeto tem ${plates.length} mesas: os valores foram somados.`] : []),
      ...(read.unreadable ? ["Não consegui ler a configuração do projeto (arquivo corrompido?): a purga das trocas de cor e a impressora ficaram de fora, então as gramas e o custo podem estar abaixo do real."] : []),
    ],
  };
}

/** `unreadable`: o arquivo existe mas não é JSON (segue sem impressora nem purga, e quem chama avisa, B12). */
function readSettings(raw: Uint8Array | undefined): { settings: ProjectSettings; unreadable: boolean } {
  try {
    return { settings: raw ? (JSON.parse(strFromU8(raw)) as ProjectSettings) : {}, unreadable: false };
  } catch {
    return { settings: {}, unreadable: true };
  }
}

type ProjectSettings = { printer_model?: string; flush_volumes_matrix?: string[]; flush_multiplier?: string[] | string; filament_density?: string[]; support_type?: string };

/**
 * Purga das trocas de cor (#147), somando as mesas. Trocas pelo G-code de cada mesa quando o 3MF o traz
 * (Metadata/plate_N.gcode); senão pelas listas de filamentos por camada do slice_info.
 */
function multicolorWaste(files: Record<string, Uint8Array>, plates: string[], s: ProjectSettings): SlicerWaste | undefined {
  const matrix = flushMatrix((s.flush_volumes_matrix ?? []).map(Number));
  if (!matrix) return undefined;
  const multiplier = Number(Array.isArray(s.flush_multiplier) ? s.flush_multiplier[0] : s.flush_multiplier) || 1;
  const density = (i: number) => Number(s.filament_density?.[i]) || 1.24;
  const parts: SlicerWaste[] = [];
  plates.forEach((plate, p) => {
    const gcode = files[`Metadata/plate_${p + 1}.gcode`];
    const seq = gcode
      ? toolSequence(strFromU8(gcode))
      : sequenceFromLayers(
          [...plate.matchAll(/<layer_filament_list\b([^>]*)\/?>/g)].map((m) => {
            const a = attrs(m[1]);
            const [from, to] = (a.layer_ranges ?? "").split(/\s+/).map(Number);
            return { filaments: (a.filament_list ?? "").split(/\s+/).filter(Boolean).map(Number), from, to: to ?? from };
          }),
        );
    const w = purgeWaste(seq, matrix, multiplier, density, gcode ? "gcode" : "camadas");
    if (w) parts.push(w);
  });
  if (!parts.length) return undefined;
  const byIndex = new Map<number, number>();
  for (const w of parts) for (const f of w.byFilament) byIndex.set(f.index, (byIndex.get(f.index) ?? 0) + f.grams);
  const byFilament = [...byIndex].map(([index, grams]) => ({ index, grams: round2(grams) })).sort((a, b) => a.index - b.index);
  return { byFilament, grams: round2(byFilament.reduce((t, f) => t + f.grams, 0)), swaps: parts.reduce((t, w) => t + w.swaps, 0), included: false, from: parts.some((w) => w.from === "camadas") ? "camadas" : "gcode" };
}
