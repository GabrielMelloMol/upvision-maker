import { invoke } from "@tauri-apps/api/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { PrintProfile } from "./printProfile";
import { modelColors, write3mf } from "./threemf";
import type { Model } from "./types";

const SETTINGS = "Metadata/project_settings.config";

/**
 * Projeto do Bambu Studio com as pausas já marcadas (o Bambu Studio ignora a pausa de 3MF de terceiros).
 * O CLI do Bambu Studio instalado (comando Rust `bambu_project`) importa o 3MF, aplica as pausas e os
 * presets que o usuário está usando; aqui só trocamos as cores dos filamentos pelas cores das partes.
 */
export async function bambuProject(models: Model[], pauses: number[], profile?: PrintProfile): Promise<Uint8Array> {
  const colors = modelColors(models);
  const out = await invoke<number[] | Uint8Array>("bambu_project", { model: Array.from(write3mf(models, { pauses, profile })), pauses, filaments: Math.max(1, colors.length) });
  return withFilamentColors(Uint8Array.from(out), colors);
}

/** Troca `filament_colour` do projeto pelas cores das partes (1ª cor = filamento 1, como no write3mf). */
export function withFilamentColors(project: Uint8Array, colors: string[]): Uint8Array {
  const files = unzipSync(project);
  const raw = files[SETTINGS];
  if (!raw || !colors.length) return project;
  const cfg = JSON.parse(strFromU8(raw)) as Record<string, unknown>;
  cfg.filament_colour = colors.map((c) => c.toUpperCase());
  return zipSync({ ...files, [SETTINGS]: strToU8(JSON.stringify(cfg, null, 4)) });
}
