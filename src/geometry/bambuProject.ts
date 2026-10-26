import { invoke } from "@tauri-apps/api/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { PrintProfile } from "./printProfile";
import { filamentPlan, plateOrigin, write3mf } from "./threemf";
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
  return withPlates(withFilamentColors(new Uint8Array(out), colors), platesOf(models));
}

/** Mesa de cada modelo pelo nome, quando o modelo pede mais de uma (#293); vazio = tudo na mesa 1. */
export const platesOf = (models: Model[]): Record<string, number> => (models.some((m) => (m.plate ?? 1) > 1) ? Object.fromEntries(models.map((m) => [m.name, m.plate ?? 1])) : {});

/**
 * Leva os objetos de cada mesa para a mesa dela no projeto exportado pelo CLI (#293). O CLI só lê mesas de projeto do
 * Bambu Studio e põe tudo na mesa 1; aqui cada objeto (achado pelo nome) sai da mesa 1 e anda até o canto da mesa dele.
 */
export function withPlates(project: Uint8Array, plateOf: Record<string, number>): Uint8Array {
  const total = Math.max(1, ...Object.values(plateOf));
  if (total < 2) return project;
  const files = unzipSync(project);
  const cfgFile = "Metadata/model_settings.config";
  const modelFile = "3D/3dmodel.model";
  let cfg = strFromU8(files[cfgFile]);
  const plateOfId = new Map([...cfg.matchAll(/<object id="(\d+)">\s*<metadata key="name" value="([^"]*)"/g)].map((m) => [m[1], plateOf[m[2]] ?? 1]));
  const first = cfg.match(/<plate>[\s\S]*?<\/plate>/)?.[0];
  if (!first) return project;
  const moved = new Map<number, string[]>();
  let kept = first;
  for (const inst of first.match(/\s*<model_instance>[\s\S]*?<\/model_instance>/g) ?? []) {
    const n = plateOfId.get(inst.match(/key="object_id" value="(\d+)"/)?.[1] ?? "") ?? 1;
    if (n === 1) continue;
    kept = kept.replace(inst, "");
    moved.set(n, [...(moved.get(n) ?? []), inst]);
  }
  const extra = [...moved].sort((a, b) => a[0] - b[0]).map(([n, insts]) => `\n  <plate>\n    <metadata key="plater_id" value="${n}"/>\n    <metadata key="locked" value="false"/>${insts.join("")}\n  </plate>`);
  cfg = cfg.replace(first, kept + extra.join(""));
  const model = strFromU8(files[modelFile]).replace(/(<item objectid="(\d+)"[^>]*transform=")([^"]+)"/g, (all, head: string, id: string, t: string) => {
    const n = plateOfId.get(id) ?? 1;
    if (n === 1) return all;
    const [ox, oy] = plateOrigin(n, total);
    const v = t.split(" ").map(Number);
    v[9] += ox;
    v[10] += oy;
    return `${head}${v.join(" ")}"`;
  });
  return zipSync({ ...files, [cfgFile]: strToU8(cfg), [modelFile]: strToU8(model) });
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
