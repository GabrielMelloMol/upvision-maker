import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { roundedRect, type ModelCtx } from "../models/common";
import { CARD_MM, gateHeight, gateWidth, packRows, pieceGates, type CardSize, type Dim } from "../models/kitCard";
import { fitInto } from "../shape2d";
import { rect } from "./joints";
import type { K } from "./types";

/**
 * Cartão genérico: arruma contornos 2D em fileiras com galhos em grade, prende cada um com ≥ 2 pontos de corte finos e grava o
 * número da peça no galho dela e o nome na moldura. É a mesma arrumação do Kit card por imagem, para qualquer lista de peças.
 */
export type SheetOpts = {
  cardSize: CardSize;
  compact: boolean;
  /** comprimento do ponto de corte (peça → galho) */
  gap: number;
  frame: number;
  runner: number;
  engrave: number;
  /** espessura do cartão (das peças, em geral) */
  t: number;
  title: string;
  /** número gravado de cada peça (mesma ordem de `outlines`) */
  numbers: number[];
  text: ModelCtx["text"];
};

export type SheetResult = {
  W: number;
  H: number;
  cardSize: CardSize;
  /** moldura + galhos + pontos de corte, com o nome e os números gravados (rente) */
  card: Solid;
  /** o que foi tirado da moldura para a cor do nome e dos números */
  inlay: Solid | null;
  /** quanto cada contorno andou para chegar ao lugar dele no cartão */
  offsets: { dx: number; dy: number }[];
  gatesPerPiece: number[];
};

const CORNER_MM = 3;
const GATE_BITE = 0.15;
const GATE_OVERLAP = 0.3;
const MIN_CARD_W = 56; // o nome precisa caber legível
const SIZES: CardSize[] = ["credit", "medium", "large", "xlarge"];

export function layoutSheet(M: ManifoldToplevel, k: K, outlines: CS[], o: SheetOpts): SheetResult {
  const dims: Dim[] = outlines.map((cs, id) => {
    const b = cs.bounds();
    return { id, w: b.max[0] - b.min[0], h: b.max[1] - b.min[1] };
  });
  const title = o.title.trim();
  const geometry = (size: CardSize) => {
    const [W, H] = CARD_MM[size];
    const band = title ? Math.min(12, Math.max(6, H * 0.12)) : 0;
    const innerW = W - 2 * o.frame, innerH = H - 2 * o.frame - band;
    return { W, H, band, innerW, innerH, plan: packRows(dims, innerW, innerH, o.gap, o.runner) };
  };
  // o menor cartão (a partir do pedido) em que tudo cabe
  let size = o.cardSize;
  let g = geometry(size);
  while (!g.plan && SIZES.indexOf(size) < SIZES.length - 1) {
    size = SIZES[SIZES.indexOf(size) + 1];
    g = geometry(size);
  }
  if (!g.plan) throw new Error("As peças não cabem nem no maior cartão: diminua o tamanho do modelo.");
  let { W, H, innerW, innerH, plan } = g;
  const band = g.band;
  if (o.compact) {
    const w2 = Math.max(Math.max(...plan.needW), MIN_CARD_W - 2 * o.frame), h2 = plan.needH;
    const tight = packRows(dims, w2, h2, o.gap, o.runner);
    if (tight) {
      plan = tight;
      innerW = w2;
      innerH = h2;
      W = innerW + 2 * o.frame;
      H = innerH + 2 * o.frame + band;
    }
  }
  const { t, gap, frame, runner: rw } = o;
  const cy0 = -band / 2;
  const gw = gateWidth();
  const runners: CS[] = [];
  const placed: { cs: CS; dx: number; dy: number; number: number; leftEdge: number; rightEdge: number; runnerSpan: [number, number] }[] = [];
  const innerTop = cy0 + innerH / 2;
  let yCursor = innerTop - plan.extraH;
  plan.rows.forEach((row, ri) => {
    const rowH = Math.max(...row.map((d) => d.h));
    const cellTop = yCursor, cellBottom = yCursor - rowH - 2 * gap;
    const cy = (cellTop + cellBottom) / 2;
    const ex = plan!.extraW[ri];
    let x = -innerW / 2 + ex;
    runners.push(rect(M, k, -innerW / 2 - 0.2, cellBottom - 0.2, -innerW / 2 + ex, cellTop + 0.2));
    let leftRunner: [number, number] = [-innerW / 2 - frame, -innerW / 2 + ex];
    row.forEach((d, i) => {
      const cs = outlines[d.id];
      const b = cs.bounds();
      const x0 = x + gap;
      const dx = x0 - b.min[0], dy = cy - (b.min[1] + b.max[1]) / 2;
      const x1 = x0 + (b.max[0] - b.min[0]);
      const lastInRow = i === row.length - 1;
      const rightRunner: [number, number] = lastInRow ? [innerW / 2 - ex, innerW / 2 + frame] : [x1 + gap, x1 + gap + rw + ex];
      placed[d.id] = { cs: k(cs.translate([dx, dy])), dx, dy, number: o.numbers[d.id], leftEdge: leftRunner[1], rightEdge: rightRunner[0], runnerSpan: leftRunner };
      runners.push(lastInRow ? rect(M, k, innerW / 2 - ex, cellBottom - 0.2, innerW / 2 + 0.2, cellTop + 0.2) : rect(M, k, rightRunner[0], cellBottom - 0.2, rightRunner[1], cellTop + 0.2));
      x = lastInRow ? x1 : rightRunner[1];
      leftRunner = rightRunner;
    });
    const last = ri === plan!.rows.length - 1;
    if (!last) runners.push(rect(M, k, -innerW / 2 - 0.2, cellBottom - rw - plan!.extraH - 0.2, innerW / 2 + 0.2, cellBottom + 0.2));
    yCursor = cellBottom - (last ? 0 : rw + plan!.extraH);
  });
  runners.push(rect(M, k, -innerW / 2 - 0.2, innerTop - plan.extraH - 0.2, innerW / 2 + 0.2, innerTop + 0.2));
  runners.push(rect(M, k, -innerW / 2 - 0.2, cy0 - innerH / 2 - 0.2, innerW / 2 + 0.2, yCursor + 0.2));

  // pontos de corte: ≥ 2 por peça, no galho da esquerda (ou da direita, ou um de cada lado)
  const bars: CS[] = [];
  const gatesPerPiece: number[] = [];
  for (const q of placed) {
    let gates = pieceGates(M, q.cs, q.leftEdge, "left", Math.max(3 * gw, 3), k);
    if (gates.length < 2) {
      const alt = pieceGates(M, q.cs, q.rightEdge, "right", Math.max(3 * gw, 3), k);
      if (alt.length > gates.length) gates = alt;
      else if (alt.length && gates.length === 1) gates = [...gates, ...alt];
    }
    gatesPerPiece.push(gates.length);
    for (const gt of gates) bars.push(rect(M, k, gt.x0 - GATE_OVERLAP, gt.y - gw / 2, gt.x1 + GATE_OVERLAP, gt.y + gw / 2));
  }
  const allPieces = k(M.CrossSection.union(placed.map((q) => q.cs)));
  const barsCs = bars.length ? k(M.CrossSection.union(bars)) : null;
  const gateOut = barsCs ? k(barsCs.subtract(allPieces)) : null;
  const gateBite = barsCs && gateOut ? k(k(barsCs.intersect(allPieces)).intersect(k(gateOut.offset(GATE_BITE + 0.01, "Square")))) : null;
  const gateCs = gateOut && gateBite ? k(M.CrossSection.union([gateOut, gateBite])) : gateOut;

  const outer = k(roundedRect(M, W, H, Math.min(CORNER_MM, frame)));
  const innerRect = k(k(M.CrossSection.square([innerW, innerH], true)).translate([0, cy0]));
  const frameSolid = k(k(M.CrossSection.union([k(outer.subtract(innerRect)), ...runners])).extrude(t));
  const gateSolid = gateCs ? k(gateCs.extrude(gateHeight(t))) : null;

  // nome e números gravados rente: a cor entra no lugar do material tirado
  const engrave = Math.min(o.engrave, t * 0.6);
  const marks: CS[] = [];
  for (const q of placed) {
    const raw = o.text(String(q.number), 100);
    if (!raw) continue;
    const b = q.cs.bounds();
    const [xa, xb] = q.runnerSpan;
    const h = Math.min(3.8, Math.max(1.6, xb - xa) * 0.9);
    const fitted = k(fitInto(k(raw), Math.max(1, xb - xa - 1), h, b.max[1] - h / 2 - 0.5));
    marks.push(k(fitted.translate([xb - 0.5 - fitted.bounds().max[0], 0])));
  }
  if (title) {
    const raw = o.text(title, 100);
    if (raw) {
      const topBand = frame + band;
      marks.push(k(fitInto(k(raw), W - 2 * frame - 4, topBand * 0.6, H / 2 - topBand / 2)));
    }
  }
  const prism = marks.length ? k(k(k(M.CrossSection.union(marks)).extrude(engrave + 0.2)).translate([0, 0, t - engrave])) : null;
  const framed: Solid = prism ? k(frameSolid.subtract(prism)) : frameSolid;
  const inlay = prism ? k(frameSolid.intersect(prism)) : null;
  const card: Solid = gateSolid ? k(M.Manifold.union([framed, gateSolid])) : framed;
  return { W, H, cardSize: size, card, inlay: inlay && !inlay.isEmpty() ? inlay : null, offsets: placed.map((q) => ({ dx: q.dx, dy: q.dy })), gatesPerPiece };
}
