import type { CS, ManifoldToplevel } from "../manifold";
import { medalOutline } from "../medal";
import { fitInto, scoped } from "../shape2d";
import { moveModel, roundedRect, slab, MissingInput, type ModelCtx, type ModelOutput } from "./common";
import { trophyBase } from "./trophy";

/** Desenho de exemplo (coração em linha), como no "Desenho em pé", quando ainda não há arte. */
function sampleArt(M: ManifoldToplevel, k: (c: CS) => CS): CS {
  const heart = k(medalOutline(M, "heart", 100));
  return k(heart.subtract(k(heart.offset(-6, "Round"))));
}

export type TieSide = "top" | "bottom" | "left" | "right";
const SIDES: TieSide[] = ["top", "bottom", "left", "right"];

export type CutoutFrameParams = {
  width: number; // moldura por fora
  height: number;
  border: number; // largura da moldura
  thickness: number;
  gap: number; // folga entre a moldura e a arte
  stroke: number; // engrossa o traço (mm de cada lado)
  tieTop: boolean;
  tieBottom: boolean;
  tieLeft: boolean;
  tieRight: boolean;
  tieWidth: number; // largura mínima de cada ponte
  frameColor: string;
  artColor: string;
};

export const DEFAULT_CUTOUT_FRAME: CutoutFrameParams = { width: 180, height: 250, border: 12, thickness: 3, gap: 4, stroke: 0.4, tieTop: true, tieBottom: true, tieLeft: false, tieRight: false, tieWidth: 4, frameColor: "#1c1c1e", artColor: "#f8f8f6" };

const MIN_ISLAND = 4; // mm²: pontinhos menores somem
const EDGE_BAND = 0.8; // faixa da borda da arte onde ela "toca" o lado
const MIN_BLOB_W = 0.4;

const tiedSides = (p: CutoutFrameParams): TieSide[] => SIDES.filter((s) => ({ top: p.tieTop, bottom: p.tieBottom, left: p.tieLeft, right: p.tieRight })[s]);

/**
 * Quadro vazado (#191): moldura retangular com o desenho de linhas dentro, preso à moldura nos lados escolhidos. Em cada
 * lado, uma ponte sai de cada ponto onde o traço encosta na borda do desenho e vai reta até a moldura (largura mínima
 * `tieWidth`), para a arte não soltar. Moldura e desenho saem em partes (cores) separadas, na mesma espessura.
 */
export function buildCutoutFrame(ctx: ModelCtx, p: CutoutFrameParams): ModelOutput {
  const { M } = ctx;
  const innerW = p.width - 2 * p.border, innerH = p.height - 2 * p.border;
  if (innerW < 20 || innerH < 20) throw new Error("A moldura é larga demais para o tamanho: diminua a largura da moldura.");
  return scoped((k) => {
    const src = ctx.art && !ctx.art.isEmpty() ? ctx.art : sampleArt(M, k);
    const fit = k(fitInto(src, innerW - 2 * p.gap, innerH - 2 * p.gap, 0));
    const art = p.stroke > 0 ? k(fit.offset(p.stroke, "Round")) : fit;
    const ab = art.bounds();
    const inner = k(M.CrossSection.square([innerW, innerH], true));
    const frame = k(k(roundedRect(M, p.width, p.height, Math.min(p.border / 2, 8))).subtract(inner));
    const ties: CS[] = [];
    for (const side of tiedSides(p)) {
      const horizontal = side === "top" || side === "bottom";
      const sign = side === "top" || side === "right" ? 1 : -1;
      const edge = horizontal ? (sign > 0 ? ab.max[1] : ab.min[1]) : sign > 0 ? ab.max[0] : ab.min[0];
      const limit = (horizontal ? innerH : innerW) / 2 * sign; // onde a moldura começa
      // faixa da arte junto ao lado: onde o traço encosta
      const band = horizontal
        ? k(k(M.CrossSection.square([ab.max[0] - ab.min[0] + 2, EDGE_BAND], false)).translate([ab.min[0] - 1, sign > 0 ? edge - EDGE_BAND : edge]))
        : k(k(M.CrossSection.square([EDGE_BAND, ab.max[1] - ab.min[1] + 2], false)).translate([sign > 0 ? edge - EDGE_BAND : edge, ab.min[1] - 1]));
      for (const blob of k(art.intersect(band)).decompose().map(k)) {
        const b = blob.bounds();
        const [lo, hi] = horizontal ? [b.min[0], b.max[0]] : [b.min[1], b.max[1]];
        if (hi - lo < MIN_BLOB_W && blob.area() < MIN_BLOB_W * EDGE_BAND) continue;
        const mid = (lo + hi) / 2, w = Math.max(hi - lo, p.tieWidth);
        const [from, to] = sign > 0 ? [edge - EDGE_BAND, limit] : [limit, edge + EDGE_BAND];
        const bar = horizontal ? k(M.CrossSection.square([w, to - from], false)).translate([mid - w / 2, from]) : k(M.CrossSection.square([to - from, w], false)).translate([from, mid - w / 2]);
        ties.push(k(bar));
      }
    }
    const drawing = k(M.CrossSection.union([art, ...ties]));
    const warnings: string[] = [];
    if (!tiedSides(p).length) warnings.push("Nenhum lado preso: o desenho fica solto dentro da moldura. Marque ao menos um lado.");
    else if (!ties.length) warnings.push("O desenho não encosta nos lados escolhidos: nada o prende à moldura. Escolha outro lado, ou diminua a folga.");
    // o que não encosta na moldura (nem pelas pontes) cairia
    const whole = k(M.CrossSection.union([drawing, frame]));
    const pieces = whole.decompose().map(k).filter((c) => c.area() >= MIN_ISLAND);
    if (pieces.length > 1) warnings.push(`${pieces.length - 1} parte(s) do desenho não estão presas à moldura e cairiam: escolha mais lados, aumente o traço ou ligue-as no desenho.`);
    const kept = k(drawing.intersect(inner));
    return {
      models: [{ name: "Quadro vazado", parts: [{ name: "Moldura", color: p.frameColor, mesh: slab(frame, p.thickness) }, { name: "Desenho", color: p.artColor, mesh: slab(kept, p.thickness) }] }],
      warnings,
    };
  });
}

export type CutoutStandParams = {
  text: string; // sem desenho, o vazado é o texto
  height: number; // da placa
  margin: number;
  thickness: number;
  baseText: string;
  plateColor: string;
  baseColor: string;
  textColor: string;
};

export const DEFAULT_CUTOUT_STAND: CutoutStandParams = { text: "Amor", height: 100, margin: 8, thickness: 4, baseText: "Para você", plateColor: "#f8f8f6", baseColor: "#1c1c1e", textColor: "#f8f8f6" };

const TAB_H = 8;

/**
 * Placa vazada em pé (#191): placa retangular com o desenho ou o texto recortado (a luz e o fundo passam), lingueta
 * embaixo que encaixa numa base com texto. Miolo de letras como O, A ou B cairia: o app avisa e tira esses pedaços.
 */
export function buildCutoutStand(ctx: ModelCtx, p: CutoutStandParams): ModelOutput {
  const { M, art, text } = ctx;
  const warnings: string[] = [];
  let tabW = 0, plateW = 0;
  const plate = scoped((k) => {
    const src = art && !art.isEmpty() ? art : (() => { const t = text(p.text, 100); return t && k(t); })();
    if (!src || src.isEmpty()) throw new MissingInput("Digite o texto ou envie um desenho.");
    const inside = k(fitInto(src, 1e6, p.height - 2 * p.margin, 0));
    const ib = inside.bounds();
    plateW = ib.max[0] - ib.min[0] + 2 * p.margin;
    const body = k(k(roundedRect(M, plateW, p.height, Math.min(p.margin, 8))).translate([(ib.min[0] + ib.max[0]) / 2, 0]));
    tabW = Math.min(plateW * 0.5, 50);
    const tab = k(k(M.CrossSection.square([tabW, TAB_H + 1], true)).translate([0, -p.height / 2 - TAB_H / 2 + 0.5]));
    const whole = k(k(M.CrossSection.union([body, tab])).subtract(inside));
    const pieces = whole.decompose().map(k);
    const main = pieces.reduce((a, c) => (c.area() > a.area() ? c : a));
    const dropped = pieces.filter((c) => c !== main && c.area() >= MIN_ISLAND).length;
    if (dropped) warnings.push(`${dropped} miolo(s) do desenho (como o centro de O, A ou B) cairiam: ficaram de fora. Use uma fonte de estêncil ou um desenho sem miolos.`);
    return { name: "Placa", parts: [{ name: "Placa", color: p.plateColor, mesh: slab(main, p.thickness) }] };
  });
  const base = trophyBase(ctx, { width: Math.max(plateW * 0.8, tabW + 20), tabW, thickness: p.thickness, relief: 0.8, lines: [p.baseText], compact: false, baseColor: p.baseColor, textColor: p.textColor });
  return { models: [plate, moveModel(base, 0, -(p.height / 2 + TAB_H + 30))], warnings };
}
