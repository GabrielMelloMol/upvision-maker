import type { CS, ManifoldToplevel } from "../manifold";
import { butterfly, flower, leaf, place, rng, scroll, stroke, type K, type Pt } from "./motifs";

export type LacePattern = "floral" | "leaves" | "butterflies" | "arabesque" | "custom";
export const PATTERN_LABELS: readonly (readonly [LacePattern, string])[] = [
  ["floral", "Flores e folhas"],
  ["leaves", "Folhagem"],
  ["butterflies", "Borboletas"],
  ["arabesque", "Arabescos"],
  ["custom", "Meu SVG"],
];

/** Quanto do tule a renda cobre: delicada deixa respirar, cheia fica quase toda coberta de filigrana. */
export type LaceDensity = "light" | "medium" | "full";
export const DENSITY_LABELS: readonly (readonly [LaceDensity, string])[] = [
  ["light", "Delicada"],
  ["medium", "Média"],
  ["full", "Cheia"],
];
/** Cobertura de tule que cada densidade mira (fração da área da renda). */
export const COVERAGE: Record<LaceDensity, number> = { light: 0.38, medium: 0.52, full: 0.66 };

/** A renda separada por função: cada uma pode ter um tom (folhas, flores, hastes e borboletas). Sem sobreposição. */
export type LaceRoles = { leaf: CS; flower: CS; stem: CS };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const OVER = 4; // as hastes passam da área para agarrar na moldura
const STEM_W = 0.9; // haste mais grossa; afina até STEM_TIP perto da ponta (nunca abaixo do mínimo do bico)
const STEM_TIP = 0.6;
const MAX_ROOTS = 90;
const BUD_R = 4.5; // botão de flor na ponta de alguns ramos
const REFINE_ROUNDS = 16;
const GAP_REACH = 1.0;
const STALL = 0.01; // ganho de cobertura por rodada abaixo disto = travou // um buraco só conta se couber mais que isto em volta (mm)

type Acc = { leaves: CS[]; flowers: CS[]; stems: CS[]; all: CS[]; ink: number; marked: number; cover: CS | null };
type Ctx = { M: ManifoldToplevel; k: K; rnd: () => number; acc: Acc; s: number; w: number; h: number; area: Pt[][]; areaSize: number; areaCs: CS; rootN: number; nodes: Pt[] };

const rad = (d: number) => (d * Math.PI) / 180;
const add = (c: Ctx, role: "leaves" | "flowers" | "stems", cs: CS) => {
  c.acc[role].push(cs);
  c.acc.all.push(cs);
  c.acc.ink += cs.area();
};

/** Ponto dentro de algum contorno (par-ímpar). */
function inside(poly: Pt[][], x: number, y: number): boolean {
  let on = false;
  for (const ring of poly)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
    }
  return on;
}

/** Ponto na borda da área (espalhado pela sequência de ouro, para as raízes não amontoarem) e a direção para dentro, em graus. */
function boundaryRoot(c: Ctx): { p: Pt; heading: number } {
  const edges = c.area.flatMap((ring) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as [Pt, Pt]));
  const lens = edges.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  c.rootN += 1;
  let r = ((c.rootN * 0.6180339887 + c.rnd() * 0.08) % 1) * lens.reduce((x, y) => x + y, 0);
  let i = 0;
  while (i < edges.length - 1 && r > lens[i]) r -= lens[i++];
  const [a, b] = edges[i];
  const t = lens[i] ? r / lens[i] : 0;
  const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const nx = -(b[1] - a[1]) / (lens[i] || 1), ny = (b[0] - a[0]) / (lens[i] || 1);
  const probe = 1.5;
  const sign = inside(c.area, p[0] + nx * probe, p[1] + ny * probe) ? 1 : -1;
  return { p, heading: (Math.atan2(ny * sign, nx * sign) * 180) / Math.PI };
}

const leafAt = (c: Ctx, at: Pt, deg: number, len: number) => add(c, "leaves", place(leaf(c.M, c.k, len, len * (0.36 + c.rnd() * 0.1)), c.k, at[0], at[1], deg));
const bloomAt = (c: Ctx, at: Pt, R: number) => add(c, "flowers", place(flower(c.M, c.k, R, 5 + Math.floor(c.rnd() * 4)), c.k, at[0], at[1], c.rnd() * 72));

/**
 * Ramo que cresce de `from` na direção `heading`, ondulando; as folhas saem aos pares ao longo dele, novos ramos saem dos
 * nós (mais finos e curtos, em ângulo) e a ponta termina em folha ou flor. `depth` limita quantas gerações de ramos.
 */
function branch(c: Ctx, from: Pt, heading: number, len: number, w0: number, depth: number, flowerChance: number) {
  const n = Math.max(8, Math.round(len / 2.2));
  const turn = (c.rnd() - 0.5) * 70; // curva total do ramo
  const pts: Pt[] = [from];
  let ang = heading;
  const step = len / n;
  for (let i = 1; i <= n; i++) {
    ang += (turn / n) * (1 + 0.4 * Math.sin(i * 0.9 + c.rnd()));
    const prev = pts[i - 1];
    pts.push([prev[0] + step * Math.cos(rad(ang)), prev[1] + step * Math.sin(rad(ang))]);
  }
  add(c, "stems", stroke(c.M, c.k, pts, Math.max(STEM_TIP, w0), STEM_TIP));
  const leafLen = clamp(c.s * 0.16 * (0.6 + depth * 0.2), 6, 17);
  const every = clamp(Math.round(leafLen / step / 1.3), 2, 5);
  const tang = (i: number) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };
  for (let i = every; i < n; i += every) {
    c.nodes.push(pts[i]);
    for (const sd of depth >= 2 || i % (2 * every) === 0 ? [1, -1] : [c.rnd() < 0.5 ? 1 : -1]) leafAt(c, pts[i], tang(i) + sd * (40 + c.rnd() * 28), leafLen * (0.75 + c.rnd() * 0.45));
    if (depth > 0 && c.rnd() < 0.55 && c.acc.stems.length < MAX_ROOTS * 6) {
      const sd = c.rnd() < 0.5 ? 1 : -1;
      branch(c, pts[i], tang(i) + sd * (35 + c.rnd() * 25), len * (0.42 + c.rnd() * 0.2), Math.max(STEM_TIP, w0 * 0.75), depth - 1, flowerChance);
    }
  }
  const tip = pts[n];
  if (c.rnd() < flowerChance) add(c, "flowers", place(flower(c.M, c.k, BUD_R, 5), c.k, tip[0], tip[1], c.rnd() * 72));
  else leafAt(c, tip, tang(n), leafLen);
}


/** Flores nos nós dos ramos (ficam ligadas), espaçadas para não virar um bolo só. */
function placeFlowers(c: Ctx, count: number) {
  const R = clamp(c.s * 0.14, 6.5, 13);
  const placed: Pt[] = [];
  const nodes = [...c.nodes].sort(() => c.rnd() - 0.5);
  for (const p of nodes) {
    if (placed.length >= count) break;
    if (!inside(c.area, p[0], p[1]) || placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < R * 2.1)) continue;
    placed.push(p);
    bloomAt(c, p, R * (0.85 + c.rnd() * 0.3));
  }
}

/** O que a renda já cobre da área (acumulado: só une o que entrou desde a última conta). */
function covered(c: Ctx): CS {
  const all = c.acc.all;
  const fresh = all.slice(c.acc.marked);
  c.acc.marked = all.length;
  const u = c.k(c.M.CrossSection.union(c.acc.cover ? [c.acc.cover, ...fresh] : fresh));
  c.acc.cover = u;
  return u;
}

/**
 * Preenche até a cobertura pedida: raízes espalhadas pela borda até a tinta somada chegar perto (modelo de sobreposição
 * ao acaso) e, depois, rodadas que medem o que ficou vazio e fazem brotar ramos das pontas mais próximas dos buracos.
 */
function fill(c: Ctx, coverage: number, grow: (c: Ctx) => void, flowers = 0) {
  const need = -c.areaSize * Math.log(1 - clamp(coverage, 0.05, 0.9)) * 0.8;
  let guard = 0;
  while (c.acc.ink < need * 0.5 && guard++ < MAX_ROOTS) grow(c);
  placeFlowers(c, flowers);
  while (c.acc.ink < need && guard++ < MAX_ROOTS) grow(c);
  let prev = -1;
  for (let round = 0; round < REFINE_ROUNDS; round++) {
    const u = covered(c);
    const have = c.k(u.intersect(c.areaCs)).area() / c.areaSize;
    if (have >= coverage) return;
    const todo = clamp(Math.round(((coverage - have) * c.areaSize) / 60), 1, 10); // quanto falta decide quantos ramos nascem na rodada
    const stalled = have - prev < STALL; // ramos não estão rendendo mais: tapa os buracos com folhas soltas (a ligação vem depois)
    prev = have;
    const gaps = c.k(c.areaCs.subtract(c.k(u.offset(GAP_REACH, "Round")))).decompose().map(c.k).sort((a, b) => b.area() - a.area());
    console.log('ROUND', round, have.toFixed(3), 'gaps', gaps.length, gaps.slice(0,3).map((g) => g.area().toFixed(0)).join('/'), stalled);
    const ends = vertices(u, 600);
    if (!ends.length) return;
    for (const g of gaps.slice(0, stalled ? 24 : todo)) {
      if (g.area() < 2) continue;
      const poly = g.toPolygons().flat() as Pt[];
      const centre: Pt = [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
      // um buraco grande leva vários ramos, cada um mirando um pedaço dele
      const n = clamp(Math.ceil(g.area() / 260), 1, 8);
      for (let i = 0; i < n; i++) {
        const v = n === 1 ? centre : poly[Math.floor(c.rnd() * poly.length)];
        const t = n === 1 ? 0 : 0.3 + c.rnd() * 0.4;
        const mid: Pt = [v[0] + (centre[0] - v[0]) * t, v[1] + (centre[1] - v[1]) * t];
        if (stalled) {
          leafAt(c, mid, c.rnd() * 360, clamp(Math.sqrt(g.area() / n) * 1.7, 5, 16));
          continue;
        }
        const from = ends.reduce((best, p) => (Math.hypot(p[0] - mid[0], p[1] - mid[1]) < Math.hypot(best[0] - mid[0], best[1] - mid[1]) ? p : best));
        const heading = (Math.atan2(mid[1] - from[1], mid[0] - from[0]) * 180) / Math.PI;
        branch(c, from, heading, clamp(Math.hypot(mid[0] - from[0], mid[1] - from[1]) * 1.5, 6, 36), STEM_TIP + 0.2, 1, 0.2);
      }
    }
  }
}

const rootBranch = (flowerChance: number, depth: number) => (c: Ctx) => {
  const { p, heading } = boundaryRoot(c);
  branch(c, p, heading + (c.rnd() - 0.5) * 40, clamp(c.s * (0.55 + c.rnd() * 0.35), 18, 70), STEM_W + 0.6, depth, flowerChance);
};

function floral(c: Ctx, cover: number) {
  fill(c, cover, rootBranch(0.1, 2), Math.max(3, Math.round(c.areaSize / 1100)));
}

function leaves(c: Ctx, cover: number) {
  fill(c, cover, rootBranch(0.03, 2));
}

function arabesque(c: Ctx, cover: number) {
  const s = c.s;
  const top = c.h / 2 + OVER, bot = -c.h / 2 - OVER;
  add(c, "stems", stroke(c.M, c.k, [[0, bot], [0, top]], 1.4, 1.1));
  const rows = clamp(Math.round(c.h / 22), 2, 5);
  for (let i = 0; i < rows; i++) {
    const y = -c.h / 2 + (c.h * (i + 0.7)) / (rows + 0.4);
    const r = clamp(s * 0.13, 6, 15) * (1 - 0.1 * i);
    const sc = scroll(c.M, c.k, r, 1.15 + (i % 2) * 0.35, 1.1, 1);
    add(c, "stems", place(sc, c.k, 0, y));
    add(c, "stems", c.k(place(sc, c.k, 0, y).mirror([1, 0])));
    for (const sx of [1, -1]) leafAt(c, [sx * r * 0.95, y + r], sx > 0 ? 70 : 110, r * 1.1);
  }
  bloomAt(c, [0, c.h * 0.18], clamp(s * 0.17, 7, 18));
  fill(c, cover, rootBranch(0.1, 1), Math.round(c.areaSize / 3500));
}

function butterflies(c: Ctx, cover: number) {
  const S = clamp(c.s * 0.4, 14, 38);
  const cols = clamp(Math.round(c.w / (S * 1.7)), 1, 4);
  const rows = clamp(Math.round(c.h / (S * 1.6)), 1, 3);
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < cols; i++) {
      const x = -c.w / 2 + (c.w * (i + 0.5 + (r % 2 ? 0.25 : -0.1))) / cols;
      const y = -c.h / 2 + (c.h * (r + 0.5)) / rows;
      if (!inside(c.area, x, y)) continue;
      const b = butterfly(c.M, c.k, S * (0.85 + c.rnd() * 0.3));
      add(c, "stems", place(c.k(b.whole.subtract(b.eyes)), c.k, x, y, (c.rnd() - 0.5) * 40));
    }
  fill(c, cover, rootBranch(0.1, 2), Math.round(c.areaSize / 4500));
}

const PATTERNS: Record<Exclude<LacePattern, "custom">, (c: Ctx, cover: number) => void> = { floral, leaves, butterflies, arabesque };

/**
 * A renda de um padrão da biblioteca numa caixa `w` × `h` centrada (Y para cima), preenchendo a `area` (em coordenadas da
 * caixa) até a cobertura da densidade. Tudo registrado em `k`.
 */
export function laceRoles(M: ManifoldToplevel, k: K, pattern: Exclude<LacePattern, "custom">, w: number, h: number, seed: number, area: CS, density: LaceDensity = "medium"): LaceRoles {
  const acc: Acc = { leaves: [], flowers: [], stems: [], all: [], ink: 0, marked: 0, cover: null };
  const polys = area.toPolygons() as Pt[][];
  PATTERNS[pattern]({ M, k, rnd: rng(seed), acc, s: Math.min(w, h), w, h, area: polys, areaSize: area.area(), areaCs: area, rootN: 0, nodes: [] }, COVERAGE[density]);
  const u = (a: CS[]) => k(M.CrossSection.union(a));
  const flowerCs = u(acc.flowers);
  const leafCs = k(u(acc.leaves).subtract(flowerCs));
  const stemCs = k(k(u(acc.stems).subtract(flowerCs)).subtract(leafCs));
  return { leaf: leafCs, flower: flowerCs, stem: stemCs };
}

/** Liga ao corpo principal cada pedaço solto, com um fio até o ponto mais próximo. Devolve o novo conjunto e quantos foram ligados. */
export function connectIslands(M: ManifoldToplevel, k: K, solid: CS, wire: number, minArea: number): { cs: CS; bridged: number; dropped: number } {
  let cur = solid;
  let bridged = 0, dropped = 0;
  for (let guard = 0; guard < 80; guard++) {
    const parts = cur.decompose().map(k).filter((p) => !p.isEmpty());
    const big = parts.filter((p) => p.area() >= minArea);
    dropped += parts.length - big.length;
    if (big.length <= 1) {
      cur = big.length === 1 ? (parts.length === 1 ? cur : big[0]) : cur;
      break;
    }
    big.sort((a, b) => b.area() - a.area());
    const main = big[0];
    const mv = vertices(main, 500);
    // o pedaço solto mais perto do corpo é ligado primeiro
    let best: { d: number; a: Pt; b: Pt } | null = null;
    for (const isl of big.slice(1)) {
      for (const p of vertices(isl, 160))
        for (const q of mv) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (!best || d < best.d) best = { d, a: p, b: q };
        }
    }
    if (!best) break;
    const strut = stroke(M, k, [best.a, best.b], wire, wire);
    cur = k(M.CrossSection.union([...big, strut]));
    bridged++;
  }
  return { cs: cur, bridged, dropped };
}

function vertices(cs: CS, max: number): Pt[] {
  const all = cs.toPolygons().flat() as Pt[];
  const step = Math.max(1, Math.ceil(all.length / max));
  return all.filter((_, i) => i % step === 0);
}
