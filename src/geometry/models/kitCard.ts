import { bedMm, nozzleMm, nozzleText } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { fitInto, fitWidth, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { MissingInput, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type CardSize = "credit" | "medium" | "large" | "xlarge";
export type RibProfile = "oval" | "boxy";
/** Como as peças se montam: figura/animal (placas laterais + costelas) ou veículo (laterais + chassi + 4 rodas). */
export type KitMode = "figure" | "vehicle";

export type KitCardParams = {
  mode: KitMode;
  title: string; // gravado na moldura
  cardSize: CardSize;
  thickness: number; // do cartão e das peças (1,2 a 2 mm)
  fit: number; // folga somada à espessura nas fendas
  ribs: number; // figura: costelas transversais ao longo do comprimento
  maxWidth: number; // figura: largura máxima das costelas, em % do comprimento
  spines: number; // figura: 1 ou 2 placas laterais
  profile: RibProfile; // figura: forma da seção das costelas
  wheel: number; // veículo: diâmetro das rodas, em % do comprimento
  track: number; // veículo: distância entre as laterais, em % do comprimento
  tire: number; // veículo: espessura do pneu (outra cor); 0 = sem pneu
  axleFit: number; // veículo: folga do furo da lateral sobre o eixo (encaixe por pressão)
  copies: number; // quantos cartões iguais na mesa
  close: number; // fecha frestas de até 2× isto (mm) na silhueta
  gap: number; // comprimento dos pontos de corte (peça → galho)
  frame: number; // largura da moldura
  runner: number; // largura dos galhos
  engrave: number; // profundidade do nome e dos números gravados na moldura
  showAssembled: boolean; // modelo montado ao lado do cartão (só na prévia)
  frameColor: string; // cartão (moldura, galhos, pontos de corte)
  pieceColor: string;
  wheelColor: string; // rodas (cubo)
  tireColor: string;
  titleColor: string; // nome e números gravados
};

export const DEFAULT_KIT_CARD: KitCardParams = {
  mode: "figure", title: "Caça", cardSize: "large", thickness: 1.6, fit: 0.2, ribs: 6, maxWidth: 45, spines: 2, profile: "oval",
  wheel: 22, track: 35, tire: 2, axleFit: 0.15, copies: 1, close: 1, gap: 2.5, frame: 2.5, runner: 3.5, engrave: 0.6, showAssembled: true,
  frameColor: "#f4f4f2", pieceColor: "#c9cdd2", wheelColor: "#1c1c1e", tireColor: "#1c1c1e", titleColor: "#1c1c1e",
};

/** Cartão de crédito (ISO 7810 ID-1) e tamanhos maiores, em mm (largura × altura). */
export const CARD_MM: Record<CardSize, [number, number]> = { credit: [85.6, 54], medium: [120, 85], large: [180, 120], xlarge: [240, 160] };

const UNIT_W = 100; // largura de referência da silhueta (escala 1)
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const CORNER_MM = 3;
const TAB_FRAC = 0.3; // largura da lingueta, em fração do comprimento
const TAB_MAX_MM = 40;
const BASE_W_FRAC = 0.6;
const BASE_MIN_MM = 10; // sobra da base em volta das janelas
const GATE_OVERLAP = 0.3; // o ponto de corte entra um pouco no galho e na peça, para não ficar fresta
const MIN_PIECE_MM = 24; // silhueta menor que isso não vale a pena
const THIN_LOSS = 0.04; // fração da área que some ao abrir com o bico
const MIN_RIB_H = 5; // costela mais baixa que isso (nas pontas) é descartada
const MIN_RIB_A = 3; // e mais estreita (meia largura)
const HOLE_FILL_MM2 = 8; // buracos menores que isso são preenchidos
const ISLAND_DROP_MM2 = 6; // ilhas menores que isso, depois do fechamento, são descartadas
const SAFETY_SHRINK = 0.96;
const CARD_GAP = 3; // espaço entre cartões na mesa

type Pt = [number, number];
type K = <D extends { delete(): void }>(o: D) => D;

/** Ponto de corte: fino, mas firme para o bico (2 filetes). */
export const gateWidth = () => Math.max(2 * nozzleMm(), 0.8);
/** Espessura do ponto de corte: o bico (2 camadas de 0,2), nunca mais que metade da placa. */
export const gateHeight = (t: number) => Math.min(nozzleMm(), t * 0.5);

// ---- limpeza da silhueta: cada peça vira UM sólido -------------------------------------------------------------

const ringArea = (r: Pt[]) => r.reduce((s, [x, y], i) => s + (x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y), 0) / 2;

export type CleanOpts = { close: number; minIsland: number; minHole: number; bridgeW: number };
export type CleanReport = { bridged: number; dropped: number; filled: number; /** o desenho era só contorno: o miolo foi preenchido */ hollowFilled: boolean; /** pedaços perdidos porque as fendas os separaram da peça */ trimmed: number };
const HOLLOW_RATIO = 0.35; // se o material é menos que isso da área dentro do contorno, o desenho é só uma linha de contorno

const vertices = (rings: Pt[][], cap = 500): Pt[] => {
  const all = rings.flat();
  const step = Math.max(1, Math.ceil(all.length / cap));
  return all.filter((_, i) => i % step === 0);
};

function nearestPair(a: Pt[], b: Pt[]): [Pt, Pt] {
  let best: [Pt, Pt] = [a[0], b[0]], d = Infinity;
  for (const p of a)
    for (const q of b) {
      const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (dd < d) [d, best] = [dd, [p, q]];
    }
  return best;
}

/**
 * Silhueta de UM sólido só: fecha frestas de até 2 × `close` (fechamento morfológico: engrossa e afina de volta),
 * preenche buracos pequenos, descarta ilhas minúsculas e liga as demais ao corpo por pontes (da borda mais próxima).
 * Buracos grandes (janelas, vãos) ficam: a peça continua sendo um sólido, só que vazado.
 */
export function cleanSilhouette(M: ManifoldToplevel, cs: CS, o: CleanOpts, k: K): { cs: CS; report: CleanReport } {
  const report: CleanReport = { bridged: 0, dropped: 0, filled: 0, hollowFilled: false, trimmed: 0 };
  report.filled = (cs.toPolygons() as Pt[][]).filter((r) => ringArea(r) < 0 && -ringArea(r) < o.minHole).length; // buracos pequenos que a imagem tinha
  const closed = o.close > 0 ? k(k(cs.offset(o.close, "Round")).offset(-o.close, "Round")) : cs;
  let rings = (closed.toPolygons() as Pt[][]).filter((r) => !(ringArea(r) < 0 && -ringArea(r) < o.minHole));
  // desenho só de contorno (traço fechado pelo fechamento, miolo vazio): preenche o miolo para a peça ser maciça
  const outerArea = rings.filter((r) => ringArea(r) > 0).reduce((a, r) => a + ringArea(r), 0);
  const solidArea = outerArea + rings.filter((r) => ringArea(r) < 0).reduce((a, r) => a + ringArea(r), 0);
  if (outerArea > 0 && solidArea / outerArea < HOLLOW_RATIO) {
    rings = rings.filter((r) => ringArea(r) > 0);
    report.hollowFilled = true;
  }
  const cleaned = k(new M.CrossSection(rings, "NonZero"));
  const comps = cleaned.decompose().map(k).sort((a, b) => b.area() - a.area());
  if (!comps.length) return { cs: cleaned, report };
  let main = comps[0];
  for (const c of comps.slice(1)) {
    if (c.area() < o.minIsland) {
      report.dropped++;
      continue;
    }
    const [p, q] = nearestPair(vertices(c.toPolygons() as Pt[][]), vertices(main.toPolygons() as Pt[][]));
    const dot = (at: Pt) => k(k(M.CrossSection.circle(o.bridgeW / 2, 24)).translate(at));
    const bridge = k(M.CrossSection.hull([dot(p), dot(q)]));
    main = k(M.CrossSection.union([main, c, bridge]));
    report.bridged++;
  }
  return { cs: main, report };
}

/** Quantas peças soltas (componentes) a região tem. */
export const componentCount = (cs: CS) => {
  const parts = cs.decompose();
  const n = parts.length;
  parts.forEach((p) => p.delete());
  return n;
};

// ---- geometria das peças ----------------------------------------------------------------------------------------

const rect = (M: ManifoldToplevel, x0: number, y0: number, x1: number, y1: number, k: K): CS => k(k(M.CrossSection.square([x1 - x0, y1 - y0], false)).translate([x0, y0]));

/** Extensão vertical (mín., máx. de y) do material de `cs` na coluna x, ou null. */
function columnExtent(M: ManifoldToplevel, cs: CS, x: number, k: K): [number, number] | null {
  const b = cs.bounds();
  const hit = k(cs.intersect(rect(M, x - 0.2, b.min[1] - 1, x + 0.2, b.max[1] + 1, k)));
  if (hit.isEmpty()) return null;
  const hb = hit.bounds();
  return [hb.min[1], hb.max[1]];
}

export type RibPlan = { x: number; zmin: number; zmax: number; zc: number; a: number };

/** Silhueta na largura `len`, centrada em x = 0 e com a base em y = 0. */
function placeSilhouette(src: CS, len: number, k: K): { cs: CS; h: number } {
  const fitted = k(fitWidth(src, len));
  const b = fitted.bounds();
  return { cs: k(fitted.translate([0, -b.min[1]])), h: b.max[1] - b.min[1] };
}

/**
 * Onde ficam as costelas: N posições igualmente espaçadas ao longo do comprimento (sem as pontas), altura pela silhueta
 * em cada uma e meia largura `a` pelo perfil oval ou, com a vista de cima, pela largura dela naquela posição.
 */
export function planRibs(M: ManifoldToplevel, side: CS, top: CS | null, len: number, p: Pick<KitCardParams, "ribs" | "maxWidth">, k: K): RibPlan[] {
  const aMax = (p.maxWidth / 100) * len / 2;
  const topH = top ? top.bounds().max[1] - top.bounds().min[1] : 0;
  const out: RibPlan[] = [];
  for (let i = 1; i <= p.ribs; i++) {
    const u = i / (p.ribs + 1);
    const x = -len / 2 + u * len;
    const ext = columnExtent(M, side, x, k);
    if (!ext) continue;
    let a: number;
    if (top && topH > 0) {
      const te = columnExtent(M, top, x, k);
      a = te ? ((te[1] - te[0]) / topH) * aMax : 0;
    } else a = aMax * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
    if (ext[1] - ext[0] < MIN_RIB_H || a < MIN_RIB_A) continue;
    out.push({ x, zmin: ext[0], zmax: ext[1], zc: (ext[0] + ext[1]) / 2, a });
  }
  return out;
}

/** Seção da costela (v = altura da silhueta, u = lateral): oval ou "caixa" (superelipse), centrada na altura do corte. */
function ribShape(M: ManifoldToplevel, r: RibPlan, profile: RibProfile, k: K): CS {
  const n = profile === "oval" ? 2 : 4;
  const pts: Pt[] = [];
  for (let i = 0; i < 72; i++) {
    const th = (2 * Math.PI * i) / 72;
    const c = Math.cos(th), s = Math.sin(th);
    pts.push([r.a * Math.sign(c) * Math.abs(c) ** (2 / n), r.zc + ((r.zmax - r.zmin) / 2) * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return k(new M.CrossSection([pts], "NonZero"));
}

export type PieceKind = "spine" | "base" | "rib" | "wheel";
/** `cs` é o contorno inteiro (para arrumar e prender); `body` é o que vai no corpo da peça (a roda sem o pneu) e `tire` o anel do pneu. */
export type KitPiece = { kind: PieceKind; cs: CS; number: number; body?: CS; tire?: CS; pinR?: number; pinLen?: number };
export type VehiclePlan = { xw: number; yh: number; rw: number; rd: number; pinR: number; pinLen: number; yw: number };
export type KitPieces = { pieces: KitPiece[]; ribs: RibPlan[]; slotW: number; len: number; hSide: number; tw: number; d: number; spines: number; report: CleanReport; split: number; vehicle: VehiclePlan | null };

/**
 * As peças na escala `s`: a(s) placa(s) lateral(is) (silhueta limpa, lingueta embaixo e uma fenda do topo até o meio em
 * cada costela), a base (placa com janela(s) para a lingueta) e as costelas (seções com a fenda de baixo até o meio).
 * Fendas = espessura + folga; cortes meia a meia: a costela desce sobre a lateral de cima.
 */
export function buildPieces(M: ManifoldToplevel, art: CS, art2: CS | null, p: KitCardParams, s: number, k: K): KitPieces {
  const t = p.thickness;
  const slotW = t + p.fit;
  const len = UNIT_W * s;
  const clean: CleanOpts = { close: p.close, minIsland: ISLAND_DROP_MM2, minHole: HOLE_FILL_MM2, bridgeW: Math.max(2 * nozzleMm(), 1.2) };
  const a1 = cleanSilhouette(M, placeSilhouette(art, len, k).cs, clean, k);
  const side = placeSilhouette(a1.cs, len, k);
  const report = { ...a1.report };
  let top: CS | null = null;
  if (art2 && !art2.isEmpty()) {
    const a2 = cleanSilhouette(M, placeSilhouette(art2, len, k).cs, clean, k);
    top = placeSilhouette(a2.cs, len, k).cs;
    report.bridged += a2.report.bridged;
    report.dropped += a2.report.dropped;
    report.filled += a2.report.filled;
    report.hollowFilled ||= a2.report.hollowFilled;
  }
  if (p.mode === "vehicle") return vehiclePieces(M, side, report, p, len, k);
  const ribs = planRibs(M, side.cs, top, len, p, k);
  const minA = ribs.length ? Math.min(...ribs.map((r) => r.a)) : 0;
  const d2 = p.spines === 2 ? Math.max(0, minA - slotW / 2 - 2) : 0;
  const spines = d2 >= 3 ? 2 : 1;
  const d = spines === 2 ? d2 : 0;
  // lingueta: onde a silhueta tem material perto do meio, de baixo da lateral até entrar nela
  const tw = Math.min(TAB_FRAC * len, TAB_MAX_MM);
  let tabTop = 1;
  for (let off = 0; off <= len / 4; off += 1) {
    const e = columnExtent(M, side.cs, off, k) ?? columnExtent(M, side.cs, -off, k);
    if (e) {
      tabTop = e[0] + 1;
      break;
    }
  }
  const tab = rect(M, -tw / 2, -t, tw / 2, Math.max(tabTop, 0.5), k);
  const slits = ribs.map((r) => rect(M, r.x - slotW / 2, r.zc, r.x + slotW / 2, side.h + 1, k));
  const spine = k(k(M.CrossSection.union([side.cs, tab])).subtract(slits.length ? k(M.CrossSection.union(slits)) : k(M.CrossSection.square([0.001, 0.001]))));
  const pieces: KitPiece[] = [];
  let n = 1;
  for (let i = 0; i < spines; i++) pieces.push({ kind: "spine", cs: spine, number: n++ });
  const bw = Math.max(BASE_W_FRAC * len, tw + p.fit + BASE_MIN_MM);
  const bd = Math.max(0.35 * len, 2 * d + slotW + 2 * BASE_MIN_MM);
  const windows = (spines === 2 ? [-d, d] : [0]).map((y) => rect(M, -(tw + p.fit) / 2, y - slotW / 2, (tw + p.fit) / 2, y + slotW / 2, k));
  pieces.push({ kind: "base", cs: k(k(roundedRect(M, bw, bd, Math.min(3, bd / 4))).subtract(k(M.CrossSection.union(windows)))), number: n++ });
  for (const r of ribs) {
    const slotsU = spines === 2 ? [-d, d] : [0];
    const cuts = slotsU.map((u) => rect(M, u - slotW / 2, r.zmin - 1, u + slotW / 2, r.zc, k));
    pieces.push({ kind: "rib", cs: k(ribShape(M, r, p.profile, k).subtract(k(M.CrossSection.union(cuts)))), number: n++ });
  }
  // as fendas podem separar um pedaço da peça: fica o maior (cada peça é UM sólido) e conta o que se perdeu
  for (const q of pieces) {
    const comps = q.cs.decompose().map(k);
    if (comps.length > 1) {
      comps.sort((a, b) => b.area() - a.area());
      report.trimmed += comps.length - 1;
      q.cs = comps[0];
    }
  }
  return { pieces, ribs, slotW, len, hSide: side.h, tw, d, spines, report, split: 0, vehicle: null };
}


const EDGE_MM = 1.6; // borda do chassi além das janelas
const WHEEL_GAP = 0.3; // folga entre a roda e o chassi

/** Quanto o chassi, as janelas e as rodas ocupam, a partir de `len` e dos ajustes (usado para prever e para montar). */
export function vehiclePlan(p: KitCardParams, len: number): VehiclePlan & { d: number; tw: number } {
  const t = p.thickness, slotW = t + p.fit;
  const d = Math.max(((p.track / 100) * len) / 2, slotW / 2 + 3);
  const rw = ((p.wheel / 100) * len) / 2;
  const tt = Math.min(p.tire, Math.max(0, rw - 5));
  const pinR = Math.max(1.5, 2 * nozzleMm());
  const yw = d + slotW / 2 + EDGE_MM + WHEEL_GAP;
  return { xw: 0.28 * len, yh: Math.max(rw - t, pinR + p.axleFit / 2 + 2.7), rw, rd: rw - tt, pinR, pinLen: yw - (d - t / 2) + 0.4, yw, d, tw: Math.min(TAB_FRAC * len, TAB_MAX_MM) };
}

/** Veículo: duas laterais iguais (lingueta, furos dos eixos com reforço), chassi com duas janelas e 4 rodas com eixo e pneu. */
function vehiclePieces(M: ManifoldToplevel, side: { cs: CS; h: number }, report: CleanReport, p: KitCardParams, len: number, k: K): KitPieces {
  const t = p.thickness, slotW = t + p.fit;
  const v = vehiclePlan(p, len);
  const holeR = v.pinR + p.axleFit / 2;
  let tabTop = 1;
  for (let off = 0; off <= len / 4; off += 1) {
    const e = columnExtent(M, side.cs, off, k) ?? columnExtent(M, side.cs, -off, k);
    if (e) {
      tabTop = e[0] + 1;
      break;
    }
  }
  const circ = (r: number, x: number, y: number) => k(k(M.CrossSection.circle(r, 48)).translate([x, y]));
  const tab = rect(M, -v.tw / 2, -t, v.tw / 2, Math.max(tabTop, 0.5), k);
  const pads = [circ(holeR + 2.2, -v.xw, v.yh), circ(holeR + 2.2, v.xw, v.yh)];
  const holes = [circ(holeR, -v.xw, v.yh), circ(holeR, v.xw, v.yh)];
  // os reforços dos furos precisam encostar na silhueta (senão viram ilhas): une e liga o que ficou solto por pontes
  const body = cleanSilhouette(M, k(M.CrossSection.union([side.cs, tab, ...pads])), { close: 0, minIsland: 0, minHole: 0, bridgeW: Math.max(2 * nozzleMm(), 1.2) }, k);
  report.bridged += body.report.bridged;
  const lateral = k(body.cs.subtract(k(M.CrossSection.union(holes))));
  const bw = Math.max(BASE_W_FRAC * len, v.tw + p.fit + BASE_MIN_MM);
  const bd = 2 * (v.d + slotW / 2 + EDGE_MM);
  const windows = [-v.d, v.d].map((y) => rect(M, -(v.tw + p.fit) / 2, y - slotW / 2, (v.tw + p.fit) / 2, y + slotW / 2, k));
  const chassis = k(k(roundedRect(M, bw, bd, Math.min(3, bd / 4))).subtract(k(M.CrossSection.union(windows))));
  const tt = v.rw - v.rd;
  const outline = circ(v.rw, 0, 0), disc = tt > 0.1 ? circ(v.rd, 0, 0) : outline;
  const tire = tt > 0.1 ? k(outline.subtract(disc)) : undefined;
  const pieces: KitPiece[] = [
    { kind: "spine", cs: lateral, number: 1 },
    { kind: "spine", cs: lateral, number: 2 },
    { kind: "base", cs: chassis, number: 3 },
    ...[0, 1, 2, 3].map((i): KitPiece => ({ kind: "wheel", cs: outline, body: disc, tire, number: 4 + i, pinR: v.pinR, pinLen: v.pinLen })),
  ];
  for (const q of pieces) {
    if (q.kind === "wheel") continue;
    const comps = q.cs.decompose().map(k);
    if (comps.length > 1) {
      comps.sort((a, b) => b.area() - a.area());
      report.trimmed += comps.length - 1;
      q.cs = comps[0];
    }
  }
  return { pieces, ribs: [], slotW, len, hSide: side.h, tw: v.tw, d: v.d, spines: 2, report, split: 0, vehicle: v };
}

// ---- arrumação em grade com galhos --------------------------------------------------------------------------------

export type Dim = { id: number; w: number; h: number };

/**
 * Arruma as peças em fileiras (da mais alta à mais baixa) com galhos de largura `rw` entre elas e entre as fileiras, e
 * `gap` (comprimento do ponto de corte) entre cada peça e o galho. Devolve também a sobra de cada fileira, que alarga os galhos.
 */
export function packRows(dims: Dim[], innerW: number, innerH: number, gap: number, rw: number): { rows: Dim[][]; extraW: number[]; extraH: number } | null {
  const sorted = [...dims].sort((a, b) => b.h - a.h);
  const need = (row: Dim[]) => row.reduce((s, d) => s + d.w, 0) + (row.length - 1) * (rw + 2 * gap) + 2 * gap;
  const rows: Dim[][] = [[]];
  for (const d of sorted) {
    if (d.w + 2 * gap > innerW) return null;
    const cur = rows[rows.length - 1];
    if (cur.length && need([...cur, d]) > innerW) rows.push([d]);
    else cur.push(d);
  }
  const heights = rows.map((r) => Math.max(...r.map((d) => d.h)));
  const needH = heights.reduce((a, b) => a + b, 0) + (rows.length - 1) * (rw + 2 * gap) + 2 * gap;
  if (needH > innerH) return null;
  return { rows, extraW: rows.map((r) => (innerW - need(r)) / (r.length + 1)), extraH: (innerH - needH) / (rows.length + 1) };
}

/** A maior escala em que tudo cabe no vão do cartão. `unit` = medidas das peças na escala 1; `fixed` = o que não escala. */
export function bestScale(unit: Dim[], fixed: { w: number; h: number }[], innerW: number, innerH: number, gap: number, rw: number): number {
  const at = (s: number): Dim[] => unit.map((d, i) => ({ id: d.id, w: d.w * s + fixed[i].w, h: d.h * s + fixed[i].h }));
  const fits = (s: number) => packRows(at(s), innerW, innerH, gap, rw) !== null;
  if (!fits(MIN_SCALE)) return 0;
  let [lo, hi] = [MIN_SCALE, MAX_SCALE];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Borda extrema (mínimo ou máximo de x) do material de `cs` na altura y, ou null se não há material ali. */
function edgeAt(M: ManifoldToplevel, cs: CS, y: number, side: "min" | "max", k: K): number | null {
  const b = cs.bounds();
  const hit = k(cs.intersect(rect(M, b.min[0] - 1, y - 0.15, b.max[0] + 1, y + 0.15, k)));
  if (hit.isEmpty()) return null;
  const hb = hit.bounds();
  return side === "min" ? hb.min[0] : hb.max[0];
}

export type Gate = { x0: number; x1: number; y: number };

/**
 * Pontos de corte de uma peça até o galho: os 2 mais curtos (e separados) onde a peça tem material na borda do lado do
 * galho. `edgeX` = a borda do galho; `side` = de que lado da peça ele está.
 */
export function pieceGates(M: ManifoldToplevel, piece: CS, edgeX: number, side: "left" | "right", minSep: number, k: K): Gate[] {
  const b = piece.bounds();
  const cand: { y: number; len: number; x: number }[] = [];
  const mid = (b.min[1] + b.max[1]) / 2;
  for (let y = b.min[1] + 0.8; y <= b.max[1] - 0.8; y += 0.5) {
    const e = edgeAt(M, piece, y, side === "left" ? "min" : "max", k);
    if (e === null) continue;
    const len = side === "left" ? e - edgeX : edgeX - e;
    if (len > 0) cand.push({ y, len, x: e });
  }
  cand.sort((a, c) => a.len - c.len || Math.abs(a.y - mid) - Math.abs(c.y - mid));
  const gates: Gate[] = [];
  for (const c of cand) {
    if (gates.some((g) => Math.abs(g.y - c.y) < minSep)) continue;
    gates.push(side === "left" ? { x0: edgeX, x1: c.x, y: c.y } : { x0: c.x, x1: edgeX, y: c.y });
    if (gates.length === 2) break;
  }
  return gates;
}

export type KitMeta = { scale: number; pieces: number; gatesPerPiece: number[]; split: number; report: CleanReport; ribs: number; spines: number };

/**
 * Kit card (#193): a silhueta de uma imagem vira o esqueleto lateral de um modelo de costelas ("slice-form"): 1 ou 2
 * placas laterais, N costelas transversais com a altura da silhueta e a largura de um perfil (oval, ou a vista de cima
 * se houver segunda imagem), fendas cruzadas meia a meia e uma base com janela. Cada peça é um sólido só; todas vêm
 * num cartão com moldura e galhos em grade, presas por pontos de corte finos (≥ 2), cada uma com seu número no galho.
 * A prévia mostra o modelo montado ao lado.
 */
export function buildKitCard(ctx: ModelCtx, p: KitCardParams): ModelOutput & { meta?: KitMeta } {
  const { M, art, art2, text } = ctx;
  if (!art || art.isEmpty()) throw new MissingInput("Envie a imagem (uma silhueta) para ver o kit card.");
  const t = p.thickness;
  const [W, H] = CARD_MM[p.cardSize];
  const title = p.title.trim();
  const band = title ? Math.min(12, Math.max(6, H * 0.12)) : 0;
  const innerW = W - 2 * p.frame, innerH = H - 2 * p.frame - band;
  if (innerW < 30 || innerH < 20) throw new Error("A moldura é larga demais para este cartão.");
  const nozzle = nozzleMm();
  const rw = p.runner;
  return scoped((k) => {
    const second = art2 && !art2.isEmpty() ? art2 : null;
    // medidas na escala 1 (silhueta bruta) para achar a escala que cabe; depois confere com as peças prontas
    const unitSide = placeSilhouette(art, UNIT_W, k);
    const unitTop = second ? placeSilhouette(second, UNIT_W, k).cs : null;
    const unitRibs = p.mode === "vehicle" ? [] : planRibs(M, unitSide.cs, unitTop, UNIT_W, p, k);
    const tw1 = Math.min(TAB_FRAC * UNIT_W, TAB_MAX_MM);
    const unit: Dim[] = [], fixed: { w: number; h: number }[] = [];
    const add = (w: number, h: number, fw = 0, fh = 0) => (unit.push({ id: unit.length, w, h }), fixed.push({ w: fw, h: fh }));
    if (p.mode === "vehicle") {
      const v = vehiclePlan(p, UNIT_W);
      add(UNIT_W, unitSide.h, 0, t);
      add(UNIT_W, unitSide.h, 0, t);
      add(Math.max(BASE_W_FRAC * UNIT_W, tw1), 2 * v.d, BASE_MIN_MM * 0.5, 2 * (t + p.fit) / 2 + 2 * EDGE_MM);
      for (let i = 0; i < 4; i++) add(2 * v.rw, 2 * v.rw);
    } else {
      const spinesGuess = p.spines === 2 && unitRibs.length ? 2 : 1;
      for (let i = 0; i < spinesGuess; i++) add(UNIT_W, unitSide.h, 0, t);
      add(Math.max(BASE_W_FRAC * UNIT_W, tw1), Math.max(0.35 * UNIT_W, 0), BASE_MIN_MM * 0.5, spinesGuess === 2 ? 2 * BASE_MIN_MM : BASE_MIN_MM + t);
      for (const r of unitRibs) add(2 * r.a, r.zmax - r.zmin);
    }
    let s = bestScale(unit, fixed, innerW, innerH, p.gap, rw);
    if (UNIT_W * s < MIN_PIECE_MM) throw new Error(`As peças não cabem neste cartão com tamanho útil (ficariam com menos de ${MIN_PIECE_MM} mm): escolha um cartão maior, menos costelas ou uma imagem menos alta.`);
    // peças prontas; se alguma ficou maior que o previsto, encolhe um pouco e refaz
    let built: KitPieces | null = null, plan: ReturnType<typeof packRows> = null;
    for (let tries = 0; tries < 10; tries++) {
      built = buildPieces(M, art, second, p, s, k);
      const dims = built.pieces.map((q, i) => {
        const b = q.cs.bounds();
        return { id: i, w: b.max[0] - b.min[0], h: b.max[1] - b.min[1] };
      });
      plan = packRows(dims, innerW, innerH, p.gap, rw);
      if (plan) break;
      s *= SAFETY_SHRINK;
    }
    if (!built || !plan) throw new Error("Não consegui arrumar as peças neste cartão: use um cartão maior ou menos costelas.");
    if (UNIT_W * s < MIN_PIECE_MM) throw new Error(`As peças não cabem neste cartão com tamanho útil (ficariam com menos de ${MIN_PIECE_MM} mm): escolha um cartão maior, menos costelas ou uma imagem menos alta.`);

    // ---- posições: fileiras de cima para baixo, galhos entre peças e entre fileiras
    const cy0 = -band / 2; // o vão fica abaixo da faixa do título
    const gw = gateWidth();
    const gh = gateHeight(t);
    const runnersCs: CS[] = [];
    const placed: { cs: CS; piece: KitPiece; dx: number; dy: number; number: number; leftEdge: number; rightEdge: number; runnerSpan: [number, number]; row: number; cy: number }[] = [];
    const innerTop = cy0 + innerH / 2;
    let yCursor = innerTop - plan.extraH;
    plan.rows.forEach((row, ri) => {
      const rowH = Math.max(...row.map((d) => d.h));
      const cellTop = yCursor, cellBottom = yCursor - rowH - 2 * p.gap;
      const cy = (cellTop + cellBottom) / 2;
      const ex = plan!.extraW[ri];
      let x = -innerW / 2 + ex; // fim da parede (já alargada)
      runnersCs.push(rect(M, -innerW / 2 - 0.2, cellBottom - 0.2, -innerW / 2 + ex, cellTop + 0.2, k)); // parede esquerda alargada
      let leftRunner: [number, number] = [-innerW / 2 - p.frame, -innerW / 2 + ex];
      row.forEach((d, i) => {
        const piece = built!.pieces[d.id];
        const b = piece.cs.bounds();
        const x0 = x + p.gap;
        const dx = x0 - b.min[0], dy = cy - (b.min[1] + b.max[1]) / 2;
        const moved = k(piece.cs.translate([dx, dy]));
        const x1 = x0 + (b.max[0] - b.min[0]);
        const lastInRow = i === row.length - 1;
        const rightRunnerStart = x1 + p.gap;
        const rightRunner: [number, number] = lastInRow ? [innerW / 2 - ex, innerW / 2 + p.frame] : [rightRunnerStart, rightRunnerStart + rw + ex];
        placed.push({ cs: moved, piece, dx, dy, number: piece.number, leftEdge: leftRunner[1], rightEdge: rightRunner[0], runnerSpan: leftRunner, row: ri, cy });
        if (lastInRow) runnersCs.push(rect(M, innerW / 2 - ex, cellBottom - 0.2, innerW / 2 + 0.2, cellTop + 0.2, k));
        else runnersCs.push(rect(M, rightRunner[0], cellBottom - 0.2, rightRunner[1], cellTop + 0.2, k)); // galho vertical entre peças
        x = lastInRow ? x1 : rightRunner[1];
        leftRunner = rightRunner;
      });
      // separador horizontal depois da fileira (e a parede de cima/baixo alargada nas pontas)
      const last = ri === plan!.rows.length - 1;
      if (!last) runnersCs.push(rect(M, -innerW / 2 - 0.2, cellBottom - rw - plan!.extraH - 0.2, innerW / 2 + 0.2, cellBottom + 0.2, k));
      yCursor = cellBottom - (last ? 0 : rw + plan!.extraH);
    });
    runnersCs.push(rect(M, -innerW / 2 - 0.2, innerTop - plan.extraH - 0.2, innerW / 2 + 0.2, innerTop + 0.2, k)); // parede de cima alargada
    runnersCs.push(rect(M, -innerW / 2 - 0.2, cy0 - innerH / 2 - 0.2, innerW / 2 + 0.2, yCursor + 0.2, k)); // parede de baixo alargada

    // ---- pontos de corte: cada peça, ≥ 2, no galho da esquerda (ou da direita se a esquerda não der)
    const bars: CS[] = [];
    const gatesPer: number[] = [];
    for (const q of placed) {
      let gates = pieceGates(M, q.cs, q.leftEdge, "left", Math.max(3 * gw, 3), k);
      if (gates.length < 2) {
        const alt = pieceGates(M, q.cs, q.rightEdge, "right", Math.max(3 * gw, 3), k);
        if (alt.length > gates.length) gates = alt;
      }
      gatesPer.push(gates.length);
      for (const g of gates) bars.push(rect(M, g.x0 - GATE_OVERLAP, g.y - gw / 2, g.x1 + GATE_OVERLAP, g.y + gw / 2, k));
    }
    const allPieces = k(M.CrossSection.union(placed.map((q) => q.cs)));
    const gateCs = bars.length ? k(k(M.CrossSection.union(bars)).subtract(allPieces)) : null;

    // ---- moldura + galhos (uma região), pontos de corte (mais finos), peças e números
    const outer = k(roundedRect(M, W, H, Math.min(CORNER_MM, p.frame)));
    const innerRect = k(k(M.CrossSection.square([innerW, innerH], true)).translate([0, cy0]));
    const frame = k(M.CrossSection.union([k(outer.subtract(innerRect)), ...runnersCs]));
    const frameSolid = k(frame.extrude(t));
    const gateSolid = gateCs ? k(gateCs.extrude(gh)) : null;
    // nome e números GRAVADOS na moldura e nos galhos (rente: a cor entra no lugar do material tirado)
    const engrave = Math.min(p.engrave, t * 0.6);
    const marks: CS[] = [];
    for (const q of placed) {
      const raw = text(String(q.number), 100);
      if (!raw) continue;
      const b = q.cs.bounds();
      const [xa, xb] = q.runnerSpan;
      const h = Math.min(3, Math.max(1.6, xb - xa) * 0.9);
      marks.push(k(fitInto(k(raw), Math.max(1, xb - xa - 0.8), h, b.max[1] - h / 2 - 0.5).translate([(xa + xb) / 2, 0])));
    }
    if (title) {
      const raw = text(title, 100);
      if (raw) {
        const topBand = p.frame + band;
        marks.push(k(fitInto(k(raw), W - 2 * p.frame - 4, topBand * 0.6, H / 2 - topBand / 2)));
      }
    }
    const inlayPrism = marks.length ? k(k(k(M.CrossSection.union(marks)).extrude(engrave + 0.2)).translate([0, 0, t - engrave])) : null;
    const frameWithMarks: Solid = inlayPrism ? k(frameSolid.subtract(inlayPrism)) : frameSolid;
    const inlay = inlayPrism ? k(frameSolid.intersect(inlayPrism)) : null;
    const card: Solid = gateSolid ? k(M.Manifold.union([frameWithMarks, gateSolid])) : frameWithMarks;
    const bodyPieces = placed.filter((q) => q.piece.kind !== "wheel");
    const wheels = placed.filter((q) => q.piece.kind === "wheel");
    const parts: Part[] = [
      { name: "Cartão", color: p.frameColor, mesh: solidMesh(card) },
      { name: "Peças", color: p.pieceColor, mesh: solidMesh(k(M.Manifold.union(bodyPieces.map((q) => k(q.cs.extrude(t)))))) },
    ];
    if (wheels.length) {
      const hubs = wheels.map((q) => {
        const body = q.piece.body ?? q.piece.cs;
        const b = q.cs.bounds();
        const hub = k(k(body.translate([q.dx, q.dy])).extrude(t));
        const pin = k(k(M.Manifold.cylinder(q.piece.pinLen ?? 3, q.piece.pinR ?? 1.5, q.piece.pinR ?? 1.5, 32, false)).translate([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, t - 0.01]));
        return k(M.Manifold.union([hub, pin]));
      });
      parts.push({ name: "Rodas", color: p.wheelColor, mesh: solidMesh(k(M.Manifold.union(hubs))) });
      const tires = wheels.filter((q) => q.piece.tire).map((q) => k(k(q.piece.tire!.translate([q.dx, q.dy])).extrude(t)));
      if (tires.length) parts.push({ name: "Pneus", color: p.tireColor, mesh: solidMesh(k(M.Manifold.union(tires))) });
    }
    if (inlay && !inlay.isEmpty()) parts.push({ name: "Título", color: p.titleColor, mesh: solidMesh(inlay) });

    // ---- avisos
    const warnings: string[] = [];
    const r = built.report;
    if (r.dropped) warnings.push(`${r.dropped} pedaço(s) minúsculo(s) da imagem foram descartados (menos de ${ISLAND_DROP_MM2} mm²).`);
    if (r.bridged) warnings.push(`${r.bridged} pedaço(s) separado(s) da imagem foram ligados ao corpo por pontes, para a peça sair inteira.`);
    if (r.trimmed) warnings.push(`${r.trimmed} pedaço(s) ficaram separados pelas fendas e foram descartados para cada peça sair inteira: use menos costelas ou uma imagem mais cheia.`);
    if (r.hollowFilled) warnings.push("O desenho era só contorno: o miolo foi preenchido para a peça sair maciça.");
    if (p.mode === "figure" && p.spines === 2 && built.spines === 1) warnings.push("As costelas ficaram estreitas demais para duas placas laterais: saiu só uma. Aumente a largura máxima.");
    if (p.mode === "figure" && built.ribs.length < p.ribs) warnings.push(`${p.ribs - built.ribs.length} costela(s) das pontas foram descartadas por ficarem muito baixas ou estreitas (menos de ${MIN_RIB_H} mm de altura ou ${MIN_RIB_A * 2} mm de largura).`);
    const few = gatesPer.filter((n) => n < 2).length;
    if (few) warnings.push(`${few} peça(s) ficaram com menos de 2 pontos de corte (a borda delas é fina ou irregular perto do galho): diminua o espaço entre as peças.`);
    for (const [name, cs] of [["lateral", built.pieces[0].cs]] as const) {
      const opened = k(k(cs.offset(-nozzle / 2, "Round")).offset(nozzle / 2, "Round"));
      if (cs.area() - opened.area() > cs.area() * THIN_LOSS) warnings.push(`A ${name} tem partes mais finas que o bico (${nozzleText()} mm): elas somem na impressão. Use uma imagem mais cheia ou um cartão maior.`);
    }
    if (p.frame < 4 * nozzle) warnings.push(`Moldura de ${String(p.frame).replace(".", ",")} mm é fina para o bico de ${nozzleText()} mm: alargue para o cartão ficar firme.`);
    if (UNIT_W * s < 45) warnings.push(`As peças ficaram com ${Math.round(UNIT_W * s)} mm de comprimento neste cartão: um cartão maior deixa o modelo mais bonito.`);
    warnings.push(
      p.mode === "vehicle"
        ? "Para montar: destaque as peças dobrando os pontos de corte, encaixe as duas laterais nas janelas do chassi e prenda as 4 rodas apertando o eixo no furo da lateral (de fora para dentro)."
        : "Para montar: destaque as peças dobrando os pontos de corte, encaixe a(s) lateral(is) na base e desça cada costela (pelo número) sobre a(s) lateral(is) pelas fendas.",
    );
    // vários cartões iguais na mesa (os pequenos cabem vários)
    const bed = bedMm();
    const fitCols = Math.max(1, Math.floor((bed + CARD_GAP) / (W + CARD_GAP)));
    const fitRows = Math.max(1, Math.floor((bed + CARD_GAP) / (H + CARD_GAP)));
    const asked = Math.max(1, Math.round(p.copies));
    const copies = Math.min(asked, fitCols * fitRows); // só os que cabem na mesa
    if (copies < asked) warnings.push(`Só ${copies} cartão(ões) de ${W} × ${H} mm cabem juntos numa mesa de ${bed} mm (você pediu ${asked}): escolha um cartão menor para caber mais.`);
    const cols = Math.min(copies, fitCols);
    const rowsN = Math.ceil(copies / cols);
    const models: Model[] = Array.from({ length: copies }, (_, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const dx = (c - (cols - 1) / 2) * (W + CARD_GAP), dy = ((rowsN - 1) / 2 - r) * (H + CARD_GAP);
      return { name: copies > 1 ? `Kit card ${i + 1}` : "Kit card", parts: parts.map((q) => ({ ...q, mesh: moveXY(q.mesh, dx, dy) })) };
    });
    if (p.showAssembled) models.push(assembled(M, built, p, cols * (W + CARD_GAP) - CARD_GAP, k));
    const meta: KitMeta = { scale: s, pieces: placed.length, gatesPerPiece: gatesPer, split: built.split, report: built.report, ribs: built.ribs.length, spines: built.spines };
    return { models, warnings, meta };
  });
}

/** Modelo montado (só prévia), ao lado do cartão: lateral(is) de pé na base e as costelas descidas pelas fendas. */
export function assembled(M: ManifoldToplevel, b: KitPieces, p: KitCardParams, cardW: number, k: K): Model {
  const t = p.thickness;
  if (b.vehicle) return assembledVehicle(M, b, b.vehicle, p, cardW, k);
  const base = b.pieces.find((q) => q.kind === "base")!;
  const spine = b.pieces.find((q) => q.kind === "spine")!;
  const base3 = k(base.cs.extrude(t));
  const ys = b.spines === 2 ? [-b.d, b.d] : [0];
  const parts: Part[] = [{ name: "Montado: base", color: p.pieceColor, mesh: solidMesh(base3) }];
  ys.forEach((y, i) => {
    const s3 = k(k(k(spine.cs.extrude(t)).rotate([90, 0, 0])).translate([0, y + t / 2, t]));
    parts.push({ name: ys.length > 1 ? `Montado: lateral ${i + 1}` : "Montado: lateral", color: p.pieceColor, mesh: solidMesh(s3) });
  });
  b.pieces.filter((q) => q.kind === "rib").forEach((q, i) => {
    const r = b.ribs[i];
    // costela em (u, v): vira o plano YZ, na posição x da costela, com v = altura + espessura da base
    const r3 = k(k(k(q.cs.extrude(t)).rotate([90, 0, 90])).translate([r.x - t / 2, 0, t]));
    parts.push({ name: `Montado: costela ${i + 1}`, color: p.pieceColor, mesh: solidMesh(r3) });
  });
  const shift = cardW / 2 + 12 + b.len / 2;
  return { name: "Montado", previewOnly: true, parts: parts.map((q) => ({ ...q, mesh: moveXY(q.mesh, shift) })) };
}

function moveXY(m: { positions: Float32Array; indices: Uint32Array }, dx: number, dy = 0) {
  const pos = m.positions.slice();
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] += dx;
    pos[i + 1] += dy;
  }
  return { positions: pos, indices: m.indices };
}

/** Veículo montado: duas laterais nas janelas do chassi e 4 rodas com o eixo entrando no furo, por fora. */
function assembledVehicle(M: ManifoldToplevel, b: KitPieces, v: VehiclePlan, p: KitCardParams, cardW: number, k: K): Model {
  const t = p.thickness;
  const chassis = b.pieces.find((q) => q.kind === "base")!;
  const lateral = b.pieces.find((q) => q.kind === "spine")!;
  const wheel = b.pieces.find((q) => q.kind === "wheel")!;
  const parts: Part[] = [{ name: "Montado: chassi", color: p.pieceColor, mesh: solidMesh(k(chassis.cs.extrude(t))) }];
  [-1, 1].forEach((sg, i) => {
    parts.push({ name: `Montado: lateral ${i + 1}`, color: p.pieceColor, mesh: solidMesh(k(k(k(lateral.cs.extrude(t)).rotate([90, 0, 0])).translate([0, sg * b.d + t / 2, t]))) });
  });
  const hubCs = wheel.body ?? wheel.cs;
  let n = 1;
  for (const sg of [-1, 1])
    for (const x of [-v.xw, v.xw]) {
      // roda no plano XZ, do lado de fora (a face de dentro em |Y| = yw), e o eixo entrando para a lateral
      const yDisc = sg === 1 ? v.yw + t : -v.yw; // a placa da roda ocupa [yw, yw + t] (ou o espelho)
      const place = (s3: Solid) => k(k(s3.rotate([90, 0, 0])).translate([x, yDisc, v.yh + t]));
      const hub = place(k(hubCs.extrude(t)));
      const cyl = k(M.Manifold.cylinder(v.pinLen, v.pinR, v.pinR, 32, false));
      const pin = sg === 1 ? k(k(cyl.rotate([90, 0, 0])).translate([x, v.yw, v.yh + t])) : k(k(cyl.rotate([-90, 0, 0])).translate([x, -v.yw, v.yh + t]));
      parts.push({ name: `Montado: roda ${n}`, color: p.wheelColor, mesh: solidMesh(k(hub.add(pin))) });
      if (wheel.tire) parts.push({ name: `Montado: pneu ${n}`, color: p.tireColor, mesh: solidMesh(place(k(wheel.tire.extrude(t)))) });
      n++;
    }
  const shift = cardW / 2 + 12 + b.len / 2;
  return { name: "Montado", previewOnly: true, parts: parts.map((q) => ({ ...q, mesh: moveXY(q.mesh, shift) })) };
}
