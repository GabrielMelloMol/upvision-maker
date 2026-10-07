import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../db";
import { loadSettings } from "../db/repo";
import type { SlicerId } from "../domain/settings";
import { bambuProject } from "../geometry/bambuProject";
import type { PrintProfile } from "../geometry/printProfile";
import { write3mf } from "../geometry/threemf";
import type { Model } from "../geometry/types";
import { loadAms } from "../tools/amsSlots";

/**
 * Abrir no fatiador com 1 clique (#160): monta o arquivo e abre no fatiador instalado (comandos Rust em
 * src-tauri/src/slicer.rs). No Bambu Studio vai como projeto, com a impressora e os presets dele, as cores dos
 * slots do AMS e as pausas (#11, #98); no OrcaSlicer e no PrusaSlicer, o 3MF com as configurações por objeto (#86).
 */
export type InstalledSlicer = { id: SlicerId; name: string; path: string };

/** Ordem de preferência quando a pessoa não escolheu um em Ajustes. */
const ORDER: SlicerId[] = ["bambu", "orca", "prusa"];

export const SLICER_DOWNLOADS: Record<SlicerId, { name: string; url: string }> = {
  bambu: { name: "Bambu Studio", url: "https://bambulab.com/pt/download/studio" },
  orca: { name: "OrcaSlicer", url: "https://github.com/SoftFever/OrcaSlicer/releases/latest" },
  prusa: { name: "PrusaSlicer", url: "https://www.prusa3d.com/page/prusaslicer_424/" },
};

export class OpenSlicerError extends Error {}

/** Fatiadores instalados (lista vazia se o app não roda no Tauri ou a busca falha). */
export async function listSlicers(): Promise<InstalledSlicer[]> {
  try {
    return await invoke<InstalledSlicer[]>("slicers_installed");
  } catch (e) {
    console.warn("Não deu para procurar os fatiadores instalados:", e);
    return [];
  }
}

/** O escolhido em Ajustes, se estiver instalado; senão o primeiro instalado na ordem Bambu, Orca, Prusa. */
export function pickSlicer(installed: InstalledSlicer[], preferred: SlicerId | null): InstalledSlicer | null {
  return installed.find((s) => s.id === preferred) ?? ORDER.map((id) => installed.find((s) => s.id === id)).find(Boolean) ?? null;
}

/** `slots`: cor de cada slot do AMS já decidida pela tela (null = sem AMS); ausente = lê o Meu AMS. */
export type OpenOptions = { pauses?: number[]; profile?: PrintProfile; slicer?: InstalledSlicer; slots?: (string | null)[] | null };

/** Arquivo para o fatiador: projeto do Bambu (se der) ou o 3MF. `project` diz qual saiu. */
export async function slicerFile(models: Model[], slicer: SlicerId, { pauses = [], profile }: OpenOptions, slots?: (string | null)[]): Promise<{ bytes: Uint8Array; project: boolean }> {
  if (slicer === "bambu") {
    try {
      return { bytes: await bambuProject(models, pauses, profile, slots), project: true };
    } catch (e) {
      // sem o CLI do Bambu (ou falhou): o 3MF abre do mesmo jeito, só sem os presets do projeto
      console.warn("Projeto do Bambu Studio indisponível, abrindo o 3MF:", e);
    }
  }
  return { bytes: write3mf(models, { pauses, profile, slots }), project: false };
}

/** O projeto do Bambu usou a impressora e o filamento padrão porque o BambuStudio.conf não deu para ler (B13). */
async function usedDefaultPresets(): Promise<boolean> {
  return invoke<boolean>("bambu_presets_found").then((found) => !found, () => false);
}

export async function openInSlicer(models: Model[], name: string, opts: OpenOptions = {}): Promise<{ path: string; slicer: InstalledSlicer; project: boolean; defaultPresets: boolean }> {
  if (!models.length) throw new OpenSlicerError("Nada para abrir: gere o modelo primeiro.");
  const db = await getDb();
  const [settings, ams] = await Promise.all([loadSettings(db), loadAms(db)]);
  const slicer = opts.slicer ?? pickSlicer(await listSlicers(), settings.slicer);
  if (!slicer) throw new OpenSlicerError("Nenhum fatiador encontrado neste computador. Instale o Bambu Studio, o OrcaSlicer ou o PrusaSlicer, ou use Salvar 3MF.");
  const multi = new Set(models.flatMap((m) => m.parts.map((p) => p.color.toLowerCase()))).size > 1;
  const slots = opts.slots !== undefined ? (opts.slots ?? undefined) : multi && ams.some((s) => s.hex) ? ams.map((s) => s.hex) : undefined;
  const { bytes, project } = await slicerFile(models, slicer.id, opts, slots);
  const path = await invoke<string>("open_in_slicer", { model: Array.from(bytes), name, slicer: slicer.id });
  return { path, slicer, project, defaultPresets: project && (await usedDefaultPresets()) };
}
