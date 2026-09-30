/*
 * Organizador de talheres em 2 andares (#140, entrega extra): em cima a bandeja dos talheres (os mais usados), embaixo a
 * base Gridfinity com caixinhas (uso raro). A bandeja corre em trilhos nas laterais; desliza na profundidade quando a
 * gaveta tem ~2× a bandeja, senão fica removível (levanta para chegar embaixo).
 */
export const TRAY_DEPTH = 250; // talher comum tem ~23 cm
export const TRAY_HEIGHT = 45; // talher deitado + fundo + folga
export const TRAY_MAX_WIDTH = 250; // cabe na mesa da A1
export const MIN_TWO_LEVELS = 80;
export const RAIL_WIDTH = 12; // pé do trilho encostado na lateral
const TRAY_GAP = 3; // entre a bandeja e o obstáculo de cima
const SIDE_CLEAR = 1; // folga da bandeja para os trilhos, de cada lado
const SLIDE_FACTOR = 1.8; // profundidade ≥ 1,8 × bandeja: dá para empurrar e chegar no andar de baixo
/** Divisões da bandeja de talheres (mm de largura útil): colherzinha, garfo, faca, colher. */
export const CUTLERY_LANES = [
  { label: "Colherzinha", width: 55 },
  { label: "Garfo", width: 75 },
  { label: "Faca", width: 60 },
  { label: "Colher", width: 75 },
];
export const LANES_MIN = CUTLERY_LANES.reduce((s, l) => s + l.width, 0) * 0.8;

export type CutleryInput = { width: number; depth: number; height: number; sideObstacle?: number };
export type TrayPlan = { width: number; lanes: { label: string; width: number }[] };
export type CutleryPlan = {
  levels: 1 | 2;
  innerWidth: number;
  railWidth: number;
  baseWidth: number; // largura que sobra para a base Gridfinity (entre os trilhos)
  lowerHeight: number; // altura livre do andar de baixo (até o apoio da bandeja)
  trayHeight: number;
  trayDepth: number;
  trays: TrayPlan[];
  slide: "depth" | "none";
  notes: string[];
};

const split = (total: number, max: number) => {
  const n = Math.max(1, Math.ceil(total / max));
  return Array.from({ length: n }, () => total / n);
};

/** Divisões de uma bandeja: a 1ª leva os talheres (encolhidos para caber); as outras, 3 divisões iguais para utensílios. */
function lanesFor(width: number, cutlery: boolean) {
  if (!cutlery) return Array.from({ length: 3 }, (_, i) => ({ label: `Utensílios ${i + 1}`, width: width / 3 }));
  const k = width / CUTLERY_LANES.reduce((s, l) => s + l.width, 0);
  return CUTLERY_LANES.map((l) => ({ label: l.label, width: l.width * k }));
}

export function cutleryPlan({ width, depth, height, sideObstacle = 0 }: CutleryInput): CutleryPlan {
  const notes: string[] = [];
  const innerWidth = width - 2 * sideObstacle;
  const levels: 1 | 2 = height >= MIN_TWO_LEVELS ? 2 : 1;
  if (levels === 1) {
    notes.push(`Altura útil de ${Math.round(height)} mm: para 2 andares precisa de ${MIN_TWO_LEVELS} mm ou mais. Fica em 1 andar (só a bandeja ou só as caixinhas).`);
    return { levels, innerWidth, railWidth: 0, baseWidth: innerWidth, lowerHeight: 0, trayHeight: Math.min(TRAY_HEIGHT, height - TRAY_GAP), trayDepth: Math.min(TRAY_DEPTH, depth), trays: [{ width: Math.min(TRAY_MAX_WIDTH, innerWidth), lanes: lanesFor(Math.min(TRAY_MAX_WIDTH, innerWidth), true) }], slide: "none", notes };
  }
  const baseWidth = innerWidth - 2 * RAIL_WIDTH;
  const trayRoom = baseWidth - 2 * SIDE_CLEAR;
  const widths = split(trayRoom, TRAY_MAX_WIDTH);
  const trays = widths.map((w, i) => ({ width: w, lanes: lanesFor(w, i === 0) }));
  if (widths[0] < LANES_MIN) notes.push(`Gaveta estreita: as 4 divisões de talheres ficam apertadas (${Math.round(widths[0])} mm para ${Math.round(LANES_MIN / 0.8)} mm ideais).`);
  const trayDepth = Math.min(TRAY_DEPTH, depth);
  if (depth < TRAY_DEPTH) notes.push(`Gaveta com ${Math.round(depth)} mm de fundo: talheres grandes (~23 cm) podem não caber deitados.`);
  const slide = depth >= trayDepth * SLIDE_FACTOR ? "depth" : "none";
  notes.push(
    slide === "depth"
      ? "A bandeja desliza para o fundo nos trilhos: empurre para chegar nas caixinhas da frente."
      : `A gaveta não tem fundo para a bandeja deslizar (precisaria de ${Math.round(trayDepth * SLIDE_FACTOR)} mm): ela fica apoiada nos trilhos e levanta pelas alças para chegar embaixo.`,
  );
  const lowerHeight = height - TRAY_HEIGHT - TRAY_GAP;
  return { levels, innerWidth, railWidth: RAIL_WIDTH, baseWidth, lowerHeight, trayHeight: TRAY_HEIGHT, trayDepth, trays, slide, notes };
}
