import { bedMm } from "../bed";
import type { CS } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { plateStand, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

export type GoalBoardParams = {
  title: string;
  target: number;
  step: number;
  prefix: string;
  suffix: string;
  countdown: boolean;
  width: number;
  thickness: number;
  relief: number;
  grid: boolean;
  stand: boolean;
  plateColor: string;
  textColor: string;
};

export const DEFAULT_GOAL_BOARD: GoalBoardParams = {
  title: "Viagem 2027",
  target: 1000,
  step: 50,
  prefix: "R$ ",
  suffix: "",
  countdown: false,
  width: 150,
  thickness: 3,
  relief: 0.8,
  grid: true,
  stand: true,
  plateColor: "#f8fafc",
  textColor: "#0f766e",
};

export const MAX_NUMBERS = 100;
const MARGIN = 6;
const CELL_RATIO = 0.55; // altura ÷ largura da célula
const TEXT_FILL_W = 0.82;
const TEXT_FILL_H = 0.5;
const LINE = 0.8;
const NOMINAL = 10;

/** Números do quadro: do passo até a meta (a meta entra mesmo sem ser múltipla), no máximo 100; regressiva inverte. */
export function goalLabels(p: Pick<GoalBoardParams, "target" | "step" | "prefix" | "suffix" | "countdown">): { labels: string[]; clamped: boolean } {
  const step = p.step > 0 ? p.step : 1;
  const values: number[] = [];
  for (let v = step; v <= p.target + 1e-9 && values.length <= MAX_NUMBERS; v += step) values.push(Math.round(v * 100) / 100);
  if (values.length && values[values.length - 1] < p.target && values.length <= MAX_NUMBERS) values.push(p.target);
  const clamped = values.length > MAX_NUMBERS;
  const kept = values.slice(0, MAX_NUMBERS);
  if (p.countdown) kept.reverse();
  return { labels: kept.map((v) => `${p.prefix}${v.toLocaleString("pt-BR")}${p.suffix}`), clamped };
}

/**
 * Quadro de metas (#75): placa de mesa com título e uma grade de números em relevo para riscar ou raspar conforme
 * a meta avança (economia, dias até um evento). A grade se arruma sozinha pela quantidade de números.
 */
export function buildGoalBoard({ M, text }: ModelCtx, p: GoalBoardParams): ModelOutput {
  return scoped((k) => {
    const warnings: string[] = [];
    const { labels, clamped } = goalLabels(p);
    if (clamped) warnings.push(`Passo pequeno para a meta: o quadro mostra só os primeiros ${MAX_NUMBERS} números. Aumente o passo.`);
    const n = Math.max(1, labels.length);
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
    const rows = Math.ceil(n / cols);
    const cellW = (p.width - 2 * MARGIN) / cols;
    const cellH = cellW * CELL_RATIO;
    const titleH = p.title.trim() ? Math.min(14, p.width * 0.09) : 0;
    const gridH = rows * cellH;
    const H = 2 * MARGIN + gridH + (titleH ? titleH + MARGIN : 0);
    const plate = k(roundedRect(M, p.width, H, 5));
    const gridTop = H / 2 - MARGIN - (titleH ? titleH + MARGIN : 0);
    const left = -p.width / 2 + MARGIN;
    const raised: CS[] = [];
    // números com a mesma altura em todas as células: a que for mais larga manda
    const raw = labels.map((s) => text(s, NOMINAL));
    raw.forEach((c) => c && k(c));
    const widest = Math.max(...raw.map((c) => (c ? c.bounds().max[0] - c.bounds().min[0] : 0)), 1e-6);
    const s = Math.min((cellW * TEXT_FILL_W) / widest, (cellH * TEXT_FILL_H) / NOMINAL);
    raw.forEach((c, i) => {
      if (!c) return;
      const b = c.bounds();
      const col = i % cols, row = Math.floor(i / cols);
      const cx = left + (col + 0.5) * cellW, cy = gridTop - (row + 0.5) * cellH;
      raised.push(k(k(k(c.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2])).scale(s)).translate([cx, cy])));
    });
    if (p.grid) {
      // moldura só das células com número (sem caixas vazias no fim)
      const cell = k(k(M.CrossSection.square([cellW + LINE, cellH + LINE], true)).subtract(k(M.CrossSection.square([cellW - LINE, cellH - LINE], true))));
      for (let i = 0; i < n; i++) raised.push(k(cell.translate([left + ((i % cols) + 0.5) * cellW, gridTop - (Math.floor(i / cols) + 0.5) * cellH])));
    }
    if (titleH) {
      const t = text(p.title, titleH);
      if (t) raised.push(k(fitInto(k(t), p.width - 2 * MARGIN, titleH, H / 2 - MARGIN - titleH / 2)));
    }
    const models = [
      {
        name: "Quadro",
        parts: [
          { name: "Placa", color: p.plateColor, mesh: slab(plate, p.thickness) },
          { name: "Números e título", color: p.textColor, mesh: slab(k(k(M.CrossSection.union(raised)).intersect(plate)), p.relief, p.thickness) },
        ],
      },
    ];
    if (p.stand) models.push(plateStand(M, p.width, p.thickness, p.plateColor, -H / 2 - 30));
    if (Math.max(p.width, H) > bedMm()) warnings.push(`O quadro tem ${Math.round(p.width)} × ${Math.round(H)} mm: passa da mesa de ${bedMm()} mm.`);
    return { models, warnings };
  });
}
