import { stripsOf, type LayoutMode } from "./layout";

/** Parâmetros da caixa organizadora (#204). Medidas em mm. */
export type OrganizerParams = {
  /** `outer`: outerW/D/H são as medidas de fora (caixa fechada); `inner`: são as de dentro (vão e profundidade). */
  measure: "outer" | "inner";
  outerW: number;
  outerD: number;
  outerH: number;
  layoutMode: LayoutMode;
  cols: number;
  rows: number;
  /** Faixa por faixa ("6:1, 3:1.5" = nichos:proporção, da frente para o fundo). */
  strips: string;
  wall: number;
  divider: number;
  floor: number;
  outerRadius: number;
  cellRadius: number;
  lid: "hinge" | "snap" | "slide" | "none";
  lidT: number;
  latchClearance: number;
  material: Material;
  handle: boolean;
  stackable: boolean;
  labelSlot: boolean;
  labelPlace: "none" | "lid" | "sideLong" | "sideShort";
  text: string;
  textMode: "inlay" | "raised" | "engraved";
  textSize: number;
  relief: number;
  artSize: number;
  boxColor: string;
  lidColor: string;
  decorColor: string;
};

export type Material = "pla" | "petg" | "abs" | "asa" | "nylon";
export const MATERIALS = [["pla", "PLA"], ["petg", "PETG"], ["abs", "ABS"], ["asa", "ASA"], ["nylon", "Nylon"]] as const;
/** Folga padrão da trava por material (mm): materiais que encolhem mais pedem folga maior. */
export const LATCH_BY_MATERIAL: Record<Material, number> = { pla: 0.35, petg: 0.4, abs: 0.45, asa: 0.45, nylon: 0.5 };

export const DEFAULT_ORGANIZER: OrganizerParams = {
  measure: "outer",
  outerW: 180,
  outerD: 120,
  outerH: 40,
  layoutMode: "equal",
  cols: 5,
  rows: 4,
  strips: "5:1, 5:1, 5:1, 5:1",
  wall: 2.4,
  divider: 2,
  floor: 2.4,
  outerRadius: 4,
  cellRadius: 3,
  lid: "hinge",
  lidT: 2.4,
  latchClearance: LATCH_BY_MATERIAL.petg,
  material: "petg",
  handle: false,
  stackable: false,
  labelSlot: false,
  labelPlace: "lid",
  text: "Parafusos",
  textMode: "inlay",
  textSize: 12,
  relief: 0.6,
  artSize: 25,
  boxColor: "#2563eb",
  lidColor: "#2563eb",
  decorColor: "#f8f8f6",
};

export type Dims = {
  outerW: number;
  outerD: number;
  /** Altura da caixa fechada, com a tampa. */
  totalH: number;
  innerW: number;
  innerD: number;
  /** Fundo até a borda da caixa (sem a tampa). */
  bodyH: number;
  /** Profundidade útil dos nichos. */
  depth: number;
};

/** As duas leituras da mesma caixa: o que a pessoa digitou (por fora ou por dentro) e o que fica do outro lado. */
export function dimsOf(p: OrganizerParams): Dims {
  const lidH = p.lid === "none" ? 0 : p.lidT;
  const inner = p.measure === "inner";
  const innerW = inner ? p.outerW : p.outerW - 2 * p.wall;
  const innerD = inner ? p.outerD : p.outerD - 2 * p.wall;
  const bodyH = inner ? p.outerH + p.floor : p.outerH - lidH;
  return { outerW: innerW + 2 * p.wall, outerD: innerD + 2 * p.wall, totalH: bodyH + lidH, innerW, innerD, bodyH, depth: bodyH - p.floor };
}

/** Escolhas que dependem de outra: ao mudar o material, a folga da trava vai para a padrão dele. */
export function deriveOrganizer(changed: string, value: string | number | boolean): Record<string, string | number | boolean> | undefined {
  return changed === "material" && typeof value === "string" && value in LATCH_BY_MATERIAL ? { latchClearance: LATCH_BY_MATERIAL[value as Material] } : undefined;
}

/** Quantos nichos a caixa tem agora (para o resumo e as dicas). */
export const cellCount = (p: OrganizerParams) => stripsOf(p).reduce((a, s) => a + s.n, 0);
