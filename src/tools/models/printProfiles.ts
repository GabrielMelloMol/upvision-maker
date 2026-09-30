import { DEFAULT_PROFILE, mergeProfiles, type PrintProfile } from "../../geometry/printProfile";
import type { Params } from "./fields";


/** Configuração recomendada por modelo pronto (#86), por cima do padrão (0,2 mm · 3 paredes · 15% · sem suporte). */
export const MODEL_PROFILES: Record<string, PrintProfile> = {
  cutterStamp: { walls: 2, notes: ["Lâmina fina: deixe ligado \"Detectar paredes finas\" no fatiador para ela não sumir."] },
  ejector: { walls: 3, infill: 20 },
  bagClip: { walls: 4, infill: 30, notes: ["Imprima deitado, como sai no arquivo: as hastes flexionam sem quebrar."] },
  opener: { walls: 4, infill: 40, notes: ["Faz força: PETG aguenta mais que PLA."] },
  clicker: { walls: 3, infill: 30 },
  articulatedName: { walls: 2, brim: false, notes: ["Dobradiça já montada: sem brim nem suporte. Depois de esfriar, gire as letras para soltar."] },
  spinner: { walls: 2, notes: ["Gira já montado: sem suporte."] },
  keyHolder: { walls: 4, infill: 25 },
  lamp: { walls: 2, notes: ["Difusor em filamento branco (1ª camada)."] },
  lineArt: { walls: 3, infill: 20 },
  coloring: { layerHeight: 0.16 },
  snowflake: { walls: 2 },
};

/** Modelo com campo "Altura de camada" (pausa para inserir tag/ímã): o fatiador usa a mesma camada. */
export function profileFor(id: string, p: Params): PrintProfile {
  const base = mergeProfiles(DEFAULT_PROFILE, MODEL_PROFILES[id]);
  const layer = Number(p.layerHeight);
  return layer > 0 ? { ...base, layerHeight: layer } : base;
}
