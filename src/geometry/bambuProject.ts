import { invoke } from "@tauri-apps/api/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { PrintProfile } from "./printProfile";
import { filamentPlan, write3mf } from "./threemf";
import type { Model } from "./types";

const SETTINGS = "Metadata/project_settings.config";

/**
 * Projeto do Bambu Studio com as pausas já marcadas (o Bambu Studio ignora a pausa de 3MF de terceiros).
 * O CLI do Bambu Studio instalado (comando Rust `bambu_project`) importa o 3MF, aplica as pausas e os
 * presets que o usuário está usando; aqui só trocamos as cores dos filamentos pelas cores das partes.
 */
export async function bambuProject(models: Model[], pauses: number[], profile?: PrintProfile, slots?: (string | null)[]): Promise<Uint8Array> {
  // com AMS (#98): um filamento por slot, na cor do filamento carregado; a extrusora de cada parte é o slot
  const colors = filamentPlan(models, slots).filamentColors;
  // O 3MF vai e volta como bytes crus (um array JSON de números pesava 8 a 12 vezes o arquivo e congelava a tela, M21);
  // as pausas e o número de filamentos vão em cabeçalhos.
  const out = await invoke<ArrayBuffer>("bambu_project", write3mf(models, { pauses, profile, slots }), { headers: { "x-pauses": JSON.stringify(pauses), "x-filaments": String(Math.max(1, colors.length)) } });
  return withFilamentColors(new Uint8Array(out), colors);
}

/** Purga (mm³) entre filamentos diferentes quando o projeto não traz outro valor: o padrão do Bambu Studio. */
const DEFAULT_FLUSH = "280";

/**
 * Troca `filament_colour` do projeto pelas cores das partes (1ª cor = filamento 1, como no write3mf). O CLI exporta o
 * projeto com 1 cor e a matriz de purga 4×4 do perfil; com N cores a matriz e o mapa de filamentos precisam ter N
 * (N×N), senão o Bambu Studio não fatia (código -100, achado na varredura da #90).
 */
export function withFilamentColors(project: Uint8Array, colors: string[]): Uint8Array {
  const files = unzipSync(project);
  const raw = files[SETTINGS];
  if (!raw || !colors.length) return project;
  const cfg = JSON.parse(strFromU8(raw)) as Record<string, unknown>;
  const n = colors.length;
  const flush = (cfg.flush_volumes_matrix as string[] | undefined)?.find((v) => v !== "0") ?? DEFAULT_FLUSH;
  return zipSync({
    ...files,
    [SETTINGS]: strToU8(
      JSON.stringify(
        {
          ...cfg,
          filament_colour: colors.map((c) => c.toUpperCase()),
          flush_volumes_matrix: Array.from({ length: n * n }, (_, i) => (i % (n + 1) === 0 ? "0" : flush)),
          filament_map: Array(n).fill("1"),
        },
        null,
        4,
      ),
    ),
  });
}
