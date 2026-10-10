import { nozzleMm, nozzleText } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { fitInto, fitWidth, outerOnly, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { MissingInput, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type CardSize = "credit" | "medium" | "large" | "xlarge";

export type KitCardParams = {
  title: string; // em relevo na moldura
  cardSize: CardSize;
  thickness: number; // do cartão e das peças (1,2 a 2 mm)
  fit: number; // folga somada à espessura nas fendas
  crossPct: number; // altura (em % da silhueta) onde a vista de cima cruza a lateral
  gap: number; // espaço mínimo entre peças e moldura
  frame: number; // largura da moldura
  relief: number; // altura do título
  showAssembled: boolean; // modelo montado ao lado do cartão (só na prévia)
  frameColor: string;
  pieceColor: string;
  titleColor: string;
};

export const DEFAULT_KIT_CARD: KitCardParams = { title: "Caça", cardSize: "medium", thickness: 1.6, fit: 0.2, crossPct: 50, gap: 4, frame: 3.5, relief: 0.6, showAssembled: true, frameColor: "#1c1c1e", pieceColor: "#c9cdd2", titleColor: "#f5c542" };

/** Cartão de crédito (ISO 7810 ID-1) e tamanhos maiores, em mm (largura × altura). */
export const CARD_MM: Record<CardSize, [number, number]> = { credit: [85.6, 54], medium: [120, 85], large: [180, 120], xlarge: [240, 160] };

const UNIT_W = 100; // largura de referência das silhuetas (escala 1)
const MIN_SCALE = 0.12;
const MAX_SCALE = 4;
const CORNER_MM = 3;
const TAB_FRAC = 0.3; // largura da lingueta, em fração da largura da silhueta
const TAB_MAX_MM = 40;
const BASE_W_FRAC = 0.6;
const BASE_D_FRAC = 0.35;
const BASE_MIN_MM = 10; // sobra da base em volta da fenda
const GATE_OVERLAP = 0.3; // o ponto de corte entra um pouco na moldura e na peça, para não ficar fresta
const GATE_H = 0.4; // ponto de corte: fino, para quebrar com a mão (2 camadas de 0,2)
const MIN_PIECE_MM = 28; // silhueta menor que isso não vale a pena
const THIN_LOSS = 0.04; // fração da área que some ao abrir com o bico

type K = <D extends { delete(): void }>(o: D) => D;

/** Largura do ponto de corte: fino, mas firme para o bico (2 filetes). */
export const gateWidth = () => Math.max(2 * nozzleMm(), 0.8);

export type PieceKind = "side" | "top" | "base";
export type Dim = { kind: PieceKind; w: number; h: number };
export type Placed = { kind: PieceKind; x: number; y: number; w: number; h: number; row: number };

/** Medidas de cada peça na escala `s` (silhuetas de largura 100·s). `aspect` = altura ÷ largura da silhueta. */
export function pieceDims(s: number, t: number, fit: number, aspectA: number, aspectB: number | null): Dim[] {
  const w = UNIT_W * s;
  const tw = Math.min(TAB_FRAC * w, TAB_MAX_MM);
  const dims: Dim[] = [{ kind: "side", w, h: w * aspectA + t }];
  if (aspectB !== null) dims.push({ kind: "top", w, h: w * aspectB });
  dims.push({ kind: "base", w: Math.max(BASE_W_FRAC * w, tw + fit + BASE_MIN_MM), h: Math.max(BASE_D_FRAC * w, t + fit + BASE_MIN_MM) });
  return dims;
}

/** Arruma as peças em fileiras dentro do vão, com `gap` mínimo; null se não couber. Devolve também a folga real de cada fileira. */
export function packRows(dims: Dim[], innerW: number, innerH: number, gap: number): { rows: Dim[][]; gapH: number[]; gapV: number } | null {
  const rows: Dim[][] = [[]];
  let used = gap;
  for (const d of dims) {
    if (d.w + 2 * gap > innerW) return null;
    if (used + d.w + gap > innerW && rows[rows.length - 1].length) {
      rows.push([]);
      used = gap;
    }
    rows[rows.length - 1].push(d);
    used += d.w + gap;
  }
  const heights = rows.map((r) => Math.max(...r.map((d) => d.h)));
  const free = innerH - heights.reduce((a, b) => a + b, 0);
  if (free < gap * (rows.length + 1)) return null;
  const gapH = rows.map((r) => (innerW - r.reduce((a, d) => a + d.w, 0)) / (r.length + 1));
  return { rows, gapH, gapV: free / (rows.length + 1) };
}

/** A maior escala em que tudo cabe no vão do cartão. */
export function bestScale(t: number, fit: number, aspectA: number, aspectB: number | null, innerW: number, innerH: number, gap: number): number {
  const fits = (s: number) => packRows(pieceDims(s, t, fit, aspectA, aspectB), innerW, innerH, gap) !== null;
  if (!fits(MIN_SCALE)) return 0;
  let [lo, hi] = [MIN_SCALE, MAX_SCALE];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

const rect = (M: ManifoldToplevel, x0: number, y0: number, x1: number, y1: number, k: K): CS => k(k(M.CrossSection.square([x1 - x0, y1 - y0], false)).translate([x0, y0]));

/** Silhueta cheia (sem miolos) na largura `w`, com o centro em x = 0 e a base em y = 0. */
function solidSilhouette(M: ManifoldToplevel, src: CS, w: number, k: K): { cs: CS; h: number } {
  const full = k(outerOnly(M, src));
  const fitted = k(fitWidth(full, w));
  const b = fitted.bounds();
  return { cs: k(fitted.translate([0, -b.min[1]])), h: b.max[1] - b.min[1] };
}

export type KitPieces = { side: CS; top: CS | null; base: CS; z0: number; slotW: number; tw: number; w: number; hSide: number };

/**
 * As peças na escala `s`, cada uma no seu sistema: a lateral (de pé: base em y = 0, com lingueta embaixo e fenda
 * horizontal do centro até a direita na altura do cruzamento), a vista de cima (centrada, fenda do lado esquerdo até o
 * centro) e a base (placa com a janela da lingueta). Fendas = espessura + folga.
 */
export function buildPieces(M: ManifoldToplevel, art: CS, art2: CS | null, p: Pick<KitCardParams, "thickness" | "fit" | "crossPct">, s: number, k: K): KitPieces {
  const t = p.thickness;
  const slotW = t + p.fit;
  const w = UNIT_W * s;
  const sa = solidSilhouette(M, art, w, k);
  const z0 = (p.crossPct / 100) * sa.h;
  const tw = Math.min(TAB_FRAC * w, TAB_MAX_MM);
  const tab = rect(M, -tw / 2, -t, tw / 2, 0.01, k);
  const slitA = rect(M, 0, z0 - slotW / 2, w / 2 + 1, z0 + slotW / 2, k);
  const side = k(k(M.CrossSection.union([sa.cs, tab])).subtract(slitA));
  let top: CS | null = null;
  if (art2) {
    const sb = solidSilhouette(M, art2, w, k);
    const centered = k(sb.cs.translate([0, -sb.h / 2]));
    top = k(centered.subtract(rect(M, -w / 2 - 1, -slotW / 2, 0, slotW / 2, k)));
  }
  const bw = Math.max(BASE_W_FRAC * w, tw + p.fit + BASE_MIN_MM), bd = Math.max(BASE_D_FRAC * w, slotW + BASE_MIN_MM);
  const window = rect(M, -(tw + p.fit) / 2, -slotW / 2, (tw + p.fit) / 2, slotW / 2, k);
  const base = k(k(roundedRect(M, bw, bd, Math.min(3, bd / 4))).subtract(window));
  return { side, top, base, z0, slotW, tw, w, hSide: sa.h };
}

/** Borda extrema (mínimo ou máximo de x) do material de `cs` na altura y, ou null se não há material ali. */
function edgeAt(M: ManifoldToplevel, cs: CS, y: number, side: "min" | "max", k: K): number | null {
  const b = cs.bounds();
  const strip = rect(M, b.min[0] - 1, y - 0.15, b.max[0] + 1, y + 0.15, k);
  const hit = k(cs.intersect(strip));
  if (hit.isEmpty()) return null;
  const hb = hit.bounds();
  return side === "min" ? hb.min[0] : hb.max[0];
}

export type Gate = { x0: number; x1: number; y: number };

/**
 * Pontos de corte de uma fileira: de cada peça à vizinha (e às laterais da moldura nas pontas), dois por junção, nas
 * alturas mais perto do meio da fileira em que as duas bordas têm material.
 */
export function rowGates(M: ManifoldToplevel, row: CS[], leftX: number, rightX: number, centerY: number, rowH: number, minSep: number, k: K): { gates: Gate[]; loose: number } {
  const gates: Gate[] = [];
  let loose = 0;
  const ys: number[] = [0];
  for (let d = 0.5; d <= rowH / 2; d += 0.5) ys.push(d, -d);
  const junctions: { from: (y: number) => number | null; to: (y: number) => number | null }[] = [];
  for (let i = 0; i <= row.length; i++) {
    const a = i === 0 ? null : row[i - 1], b = i === row.length ? null : row[i];
    junctions.push({
      from: (y) => (a ? edgeAt(M, a, y, "max", k) : leftX),
      to: (y) => (b ? edgeAt(M, b, y, "min", k) : rightX),
    });
  }
  for (const j of junctions) {
    const found: number[] = [];
    for (const dy of ys) {
      const y = centerY + dy;
      if (j.from(y) === null || j.to(y) === null) continue;
      if (found.some((f) => Math.abs(f - y) < minSep)) continue;
      found.push(y);
      gates.push({ x0: j.from(y)!, x1: j.to(y)!, y });
      if (found.length === 2) break;
    }
    if (!found.length) loose++;
  }
  return { gates, loose };
}

/**
 * Kit card (#193): a silhueta de uma imagem vira a vista de lado de um modelo de encaixe; uma segunda imagem opcional
 * é a vista de cima, que cruza a primeira por fendas, e uma base com janela segura tudo em pé. As peças vêm num
 * cartão com moldura (título em relevo) presas por pontos de corte finos, e a prévia mostra o modelo montado ao lado.
 */
export function buildKitCard(ctx: ModelCtx, p: KitCardParams): ModelOutput {
  const { M, art, art2, text } = ctx;
  if (!art || art.isEmpty()) throw new MissingInput("Envie a imagem (uma silhueta) para ver o kit card.");
  const t = p.thickness;
  const [W, H] = CARD_MM[p.cardSize];
  const title = p.title.trim();
  const band = title ? Math.min(12, Math.max(6, H * 0.12)) : 0;
  const innerW = W - 2 * p.frame, innerH = H - 2 * p.frame - band;
  if (innerW < 30 || innerH < 20) throw new Error("A moldura é larga demais para este cartão.");
  const nozzle = nozzleMm();
  return scoped((k) => {
    const second = art2 && !art2.isEmpty() ? art2 : null;
    const probeA = solidSilhouette(M, art, UNIT_W, k);
    const probeB = second ? solidSilhouette(M, second, UNIT_W, k) : null;
    const s = bestScale(t, p.fit, probeA.h / UNIT_W, probeB ? probeB.h / UNIT_W : null, innerW, innerH, p.gap);
    if (UNIT_W * s < MIN_PIECE_MM) throw new Error(`As peças não cabem neste cartão com tamanho útil (ficariam com menos de ${MIN_PIECE_MM} mm): escolha um cartão maior${second ? "" : " ou uma imagem menos alta"}.`);
    const pcs = buildPieces(M, art, second, p, s, k);
    const dims = pieceDims(s, t, p.fit, probeA.h / UNIT_W, probeB ? probeB.h / UNIT_W : null);
    const plan = packRows(dims, innerW, innerH, p.gap)!;
    const local: Record<PieceKind, CS | null> = { side: pcs.side, top: pcs.top, base: pcs.base };
    // posiciona: fileiras de cima para baixo, peças espalhadas com a folga que sobrou
    const cy0 = -band / 2; // o vão fica abaixo da faixa do título
    const rowsCs: { cs: CS[]; centerY: number; h: number }[] = [];
    let yTop = cy0 + innerH / 2 - plan.gapV;
    plan.rows.forEach((row, ri) => {
      const rh = Math.max(...row.map((d) => d.h));
      const centerY = yTop - rh / 2;
      let x = -innerW / 2 + plan.gapH[ri];
      const placed: CS[] = [];
      for (const d of row) {
        const piece = local[d.kind]!;
        const b = piece.bounds();
        const moved = k(piece.translate([x + d.w / 2 - (b.min[0] + b.max[0]) / 2, centerY - (b.min[1] + b.max[1]) / 2]));
        placed.push(moved);
        x += d.w + plan.gapH[ri];
      }
      rowsCs.push({ cs: placed, centerY, h: rh });
      yTop -= rh + plan.gapV;
    });
    // pontos de corte
    const gw = gateWidth();
    const bars: CS[] = [];
    let loose = 0;
    for (const r of rowsCs) {
      const g = rowGates(M, r.cs, -innerW / 2, innerW / 2, r.centerY, r.h, Math.max(3 * gw, 3), k);
      loose += g.loose;
      for (const gate of g.gates) bars.push(rect(M, gate.x0 - GATE_OVERLAP, gate.y - gw / 2, gate.x1 + GATE_OVERLAP, gate.y + gw / 2, k));
    }
    const allPieces = k(M.CrossSection.union(rowsCs.flatMap((r) => r.cs)));
    const gateCs = k(bars.length ? k(M.CrossSection.union(bars)).subtract(allPieces) : M.CrossSection.square([0.001, 0.001]));
    // moldura
    const outer = k(roundedRect(M, W, H, Math.min(CORNER_MM, p.frame)));
    const innerRect = k(k(M.CrossSection.square([innerW, innerH], true)).translate([0, cy0]));
    const frame = k(outer.subtract(innerRect));
    const frameSolid = k(frame.extrude(t));
    const gateSolid = bars.length ? k(gateCs.extrude(Math.min(GATE_H, t * 0.5))) : null;
    const card: Solid = gateSolid ? k(M.Manifold.union([frameSolid, gateSolid])) : frameSolid;
    const parts: Part[] = [
      { name: "Cartão", color: p.frameColor, mesh: solidMesh(card) },
      { name: "Peças", color: p.pieceColor, mesh: solidMesh(k(M.Manifold.union(rowsCs.flatMap((r) => r.cs).map((c) => k(c.extrude(t)))))) },
    ];
    if (title) {
      const raw = text(title, 100);
      if (raw) {
        const topBand = p.frame + band;
        const fitted = k(fitInto(k(raw), W - 2 * p.frame - 4, topBand * 0.6, H / 2 - topBand / 2));
        parts.push({ name: "Título", color: p.titleColor, mesh: solidMesh(k(k(fitted.extrude(p.relief)).translate([0, 0, t]))) });
      }
    }
    // avisos
    const warnings: string[] = [];
    if (loose) warnings.push(`${loose} ponto(s) de corte não acharam onde prender (a silhueta não encosta ali): aumente a folga ou use uma silhueta mais cheia.`);
    for (const [name, cs] of [["lateral", pcs.side], ["vista de cima", pcs.top]] as const) {
      if (!cs) continue;
      const opened = k(k(cs.offset(-nozzle / 2, "Round")).offset(nozzle / 2, "Round"));
      if (cs.area() - opened.area() > cs.area() * THIN_LOSS) warnings.push(`A ${name} tem partes mais finas que o bico (${nozzleText()} mm): elas somem na impressão. Use uma imagem mais cheia ou um cartão maior.`);
    }
    if (p.frame < 4 * nozzle) warnings.push(`Moldura de ${String(p.frame).replace(".", ",")} mm é fina para o bico de ${nozzleText()} mm: alargue para o cartão ficar firme.`);
    if (UNIT_W * s < 45) warnings.push(`As peças ficaram com ${Math.round(UNIT_W * s)} mm de largura neste cartão: um cartão maior deixa o modelo mais bonito.`);
    warnings.push(`Para montar: destaque as peças dobrando os pontos de corte, encaixe a lateral na base e cruze ${second ? "a vista de cima na lateral pelas fendas" : "(sem vista de cima)"}.`);
    const models: Model[] = [{ name: "Kit card", parts }];
    if (p.showAssembled) models.push(assembled(pcs, p, W, k));
    return { models, warnings };
  });
}

/** Modelo montado (só prévia), ao lado do cartão: lateral de pé na base, vista de cima cruzando pela fenda. */
function assembled(pcs: KitPieces, p: KitCardParams, cardW: number, k: K): Model {
  const t = p.thickness;
  const base3 = k(pcs.base.extrude(t));
  const side3 = k(k(k(pcs.side.extrude(t)).rotate([90, 0, 0])).translate([0, t / 2, t]));
  const parts: Part[] = [
    { name: "Montado: base", color: p.pieceColor, mesh: solidMesh(base3) },
    { name: "Montado: lateral", color: p.pieceColor, mesh: solidMesh(side3) },
  ];
  if (pcs.top) parts.push({ name: "Montado: vista de cima", color: p.pieceColor, mesh: solidMesh(k(k(pcs.top.extrude(t)).translate([0, 0, t + pcs.z0 - t / 2]))) });
  const shift = cardW / 2 + 12 + Math.max(pcs.w, base3.boundingBox().max[0] * 2) / 2;
  const model: Model = { name: "Montado", previewOnly: true, parts: parts.map((q) => ({ ...q, mesh: moveX(q.mesh, shift) })) };
  return model;
}

function moveX(m: { positions: Float32Array; indices: Uint32Array }, dx: number) {
  const pos = m.positions.slice();
  for (let i = 0; i < pos.length; i += 3) pos[i] += dx;
  return { positions: pos, indices: m.indices };
}
