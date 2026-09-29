import { strFromU8, unzipSync } from "fflate";
import { pieceName, round2, type SlicerFilament, type SlicerReport } from "./types";

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

/** 3MF de projeto fatiado do Bambu Studio / OrcaSlicer (Metadata/slice_info.config). Várias mesas são somadas. */
export function parse3mf(bytes: Uint8Array): SlicerReport {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.startsWith("Metadata/") && /\.(config|json)$/.test(f.name) });
  } catch {
    throw new Error("Não consegui abrir este 3MF (arquivo corrompido?).");
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
  let printer: string | undefined;
  try {
    const settings = files["Metadata/project_settings.config"];
    printer = settings ? (JSON.parse(strFromU8(settings)) as { printer_model?: string }).printer_model || undefined : undefined;
  } catch {
    printer = undefined;
  }
  const [only] = names;
  return { source: "Bambu Studio / OrcaSlicer (3MF)", name: names.size === 1 && only ? only : undefined, printer, seconds: seconds || undefined, pieces: pieces || undefined, filaments, warnings: plates.length > 1 ? [`O projeto tem ${plates.length} mesas: os valores foram somados.`] : [] };
}
