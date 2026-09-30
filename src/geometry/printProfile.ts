/**
 * Configuração de impressão recomendada para uma peça (#86). Vai para o 3MF por objeto no formato do Bambu Studio /
 * OrcaSlicer (Metadata/model_settings.config) e aparece na tela para quem usa outro fatiador.
 * Valores pensados para bico 0,4 (Bambu A1 e similares).
 */
export type PrintProfile = {
  layerHeight?: number;
  walls?: number;
  infill?: number; // %
  support?: boolean;
  brim?: boolean;
  topLayers?: number;
  bottomLayers?: number;
  /** Modo vaso (espiral): uma parede contínua subindo, sem topo (#92). */
  spiral?: boolean;
  notes?: string[];
};

/** Padrão de peça pequena decorativa. */
export const DEFAULT_PROFILE: PrintProfile = { layerHeight: 0.2, walls: 3, infill: 15, support: false, brim: false };

/** Ferramentas (#86). Litofania em pé, maciça (a luz passa pela espessura) e com brim para não tombar. */
export const LITHO_PROFILE: PrintProfile = { layerHeight: 0.12, walls: 4, infill: 100, support: false, brim: true, notes: ["Imprima em pé, como sai no arquivo, e devagar nas camadas finas."] };
/** Quadro por camadas: a altura de camada vem do campo da tela. */
export const LAYERED_PROFILE: PrintProfile = { walls: 3, infill: 100, support: false, brim: false, notes: ["A 1ª camada também com essa altura: as trocas de cor contam camadas."] };
/** Cortador: a lâmina tem 2 filetes de bico 0,4; sem suporte, deitado com a borda de apoio na mesa. */
export const CUTTER_PROFILE: PrintProfile = { ...DEFAULT_PROFILE, walls: 2, notes: ["Lâmina fina: deixe ligado \"Detectar paredes finas\" no fatiador para ela não sumir."] };

const BRIM_MM = 5;
const r2 = (n: number) => String(Math.round(n * 100) / 100);

/** Chaves por objeto do Bambu Studio / OrcaSlicer (só as que o perfil define). */
export function bambuObjectSettings(p: PrintProfile): [string, string][] {
  const out: [string, string][] = [];
  if (p.layerHeight) out.push(["layer_height", r2(p.layerHeight)]);
  if (p.walls) out.push(["wall_loops", String(p.walls)]);
  if (p.infill !== undefined) out.push(["sparse_infill_density", `${Math.round(p.infill)}%`]);
  if (p.support !== undefined) out.push(["enable_support", p.support ? "1" : "0"]);
  if (p.brim !== undefined) out.push(["brim_type", p.brim ? "outer_only" : "no_brim"]);
  if (p.brim) out.push(["brim_width", String(BRIM_MM)]); // o processo do A1 vem com largura 0: sem ela o brim não sai
  if (p.topLayers) out.push(["top_shell_layers", String(p.topLayers)]);
  if (p.bottomLayers) out.push(["bottom_shell_layers", String(p.bottomLayers)]);
  if (p.spiral) out.push(["spiral_mode", "1"]);
  return out;
}

const mm = (n: number) => `${r2(n).replace(".", ",")} mm`;

/** "0,2 mm · 3 paredes · 15% · sem suporte" (para a tela). */
export function profileSummary(p: PrintProfile): string {
  const parts: string[] = [];
  if (p.spiral) parts.push("modo vaso (espiral)");
  if (p.layerHeight) parts.push(`camada ${mm(p.layerHeight)}`);
  if (p.walls) parts.push(`${p.walls} ${p.walls === 1 ? "parede" : "paredes"}`);
  if (p.infill !== undefined) parts.push(`${Math.round(p.infill)}% de preenchimento`);
  if (p.support !== undefined) parts.push(p.support ? "com suporte" : "sem suporte");
  if (p.brim) parts.push("com brim");
  return parts.join(" · ");
}

/** Junta perfis: o segundo sobrescreve o primeiro (notas se somam). */
export function mergeProfiles(a: PrintProfile, b: PrintProfile | undefined): PrintProfile {
  if (!b) return a;
  return { ...a, ...b, notes: [...(a.notes ?? []), ...(b.notes ?? [])] };
}
