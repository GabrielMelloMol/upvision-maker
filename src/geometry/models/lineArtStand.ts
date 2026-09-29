import type { CS } from "../manifold";
import { medalOutline } from "../medal";
import { fitInto, scoped } from "../shape2d";
import { moveModel, slab, type ModelCtx, type ModelOutput } from "./common";
import { trophyBase } from "./trophy";

export type LineArtParams = {
  height: number;
  stroke: number; // engrossa o traço (mm a mais de cada lado)
  thickness: number;
  baseText: string;
  artColor: string;
  baseColor: string;
  textColor: string;
};

export const DEFAULT_LINE_ART: LineArtParams = { height: 120, stroke: 0.4, thickness: 4, baseText: "Nossa família", artColor: "#1c1c1e", baseColor: "#f8f8f6", textColor: "#1c1c1e" };

const BAR_H = 4; // barra que une o desenho embaixo e entra na base
const TAB_H = 8;
const MIN_ISLAND = 4; // mm²: pontinhos menores somem

/**
 * Desenho em pé (line art): o próprio traço vira a placa, unido por uma barra embaixo que encaixa numa base
 * com texto. Traços que não tocam o resto (ilhas) cairiam da peça: são contados e avisados.
 * Sem desenho enviado, usa um coração vazado de exemplo.
 */
export function buildLineArtStand(ctx: ModelCtx, p: LineArtParams): ModelOutput {
  const { M } = ctx;
  const warnings: string[] = [];
  let tabW = 0, w = 0;
  const plate = scoped((k) => {
    const src: CS = ctx.art && !ctx.art.isEmpty() ? ctx.art : k(k(medalOutline(M, "heart", 100)).subtract(k(k(medalOutline(M, "heart", 100)).offset(-6, "Round"))));
    const art0 = k(fitInto(src, 1e6, p.height, 0));
    const art = p.stroke > 0 ? k(art0.offset(p.stroke, "Round")) : art0;
    const b = art.bounds();
    w = b.max[0] - b.min[0];
    const bar = k(k(M.CrossSection.square([w, BAR_H], true)).translate([(b.min[0] + b.max[0]) / 2, b.min[1] + BAR_H / 2]));
    tabW = Math.min(w * 0.5, 50);
    const tab = k(k(M.CrossSection.square([tabW, TAB_H + 1], true)).translate([0, b.min[1] - TAB_H / 2 + 0.5]));
    const whole = k(M.CrossSection.union([art, bar, tab]));
    const pieces = whole.decompose().map(k).filter((c) => c.area() >= MIN_ISLAND);
    if (pieces.length > 1) warnings.push(`${pieces.length - 1} traço(s) solto(s) não tocam o resto e cairiam: ligue-os no desenho ou engrosse o traço.`);
    const main = pieces.reduce((a, c) => (c.area() > a.area() ? c : a));
    return { name: "Desenho", parts: [{ name: "Desenho", color: p.artColor, mesh: slab(main, p.thickness) }] };
  });
  const base = trophyBase(ctx, { width: Math.max(w * 0.8, tabW + 20), tabW, thickness: p.thickness, relief: 0.8, lines: [p.baseText], compact: false, baseColor: p.baseColor, textColor: p.textColor });
  return { models: [plate, moveModel(base, 0, -(p.height / 2 + TAB_H + 30))], warnings };
}
