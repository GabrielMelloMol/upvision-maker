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

/** A renda separada por função: cada uma pode ter um tom (folhas, flores, hastes e borboletas). Sem sobreposição. */
export type LaceRoles = { leaf: CS; flower: CS; stem: CS };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const OVER = 4; // as hastes passam da área para agarrar na moldura

type Acc = { leaves: CS[]; flowers: CS[]; stems: CS[] };
type Ctx = { M: ManifoldToplevel; k: K; rnd: () => number; acc: Acc; s: number };

/** Pontos de uma haste de `a` até `b`, com ondulação lateral de `amp` e `freq` ondas. */
function vinePts(a: Pt, b: Pt, amp: number, freq: number, phase: number, n = 28): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const off = amp * Math.sin(2 * Math.PI * freq * t + phase) * Math.sin(Math.PI * t) ** 0.5;
    return [a[0] + dx * t + nx * off, a[1] + dy * t + ny * off];
  });
}
const angleAt = (pts: Pt[], i: number) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
};

/** Haste com folhas alternadas; devolve os pontos para pendurar flores. */
function vine(c: Ctx, pts: Pt[], w0: number, w1: number, every: number, leafLen: number, pair = true): Pt[] {
  c.acc.stems.push(stroke(c.M, c.k, pts, w0, w1));
  const lf = (len: number) => leaf(c.M, c.k, len, len * (0.36 + c.rnd() * 0.1));
  let side = c.rnd() < 0.5 ? 1 : -1;
  for (let i = every; i < pts.length - 1; i += every) {
    for (const sd of pair ? [1, -1] : [side]) {
      const len = leafLen * (0.75 + c.rnd() * 0.45);
      const ang = angleAt(pts, i) + sd * (44 + c.rnd() * 26);
      c.acc.leaves.push(place(lf(len), c.k, pts[i][0], pts[i][1], ang));
    }
    side = -side;
  }
  const end = pts[pts.length - 1];
  c.acc.leaves.push(place(lf(leafLen * 0.9), c.k, end[0], end[1], angleAt(pts, pts.length - 1)));
  return pts;
}

const bloom = (c: Ctx, at: Pt, R: number) => c.acc.flowers.push(place(flower(c.M, c.k, R), c.k, at[0], at[1], c.rnd() * 72));
const bud = (c: Ctx, at: Pt, r: number) => c.acc.stems.push(place(c.k(c.M.CrossSection.circle(r, 20)), c.k, at[0], at[1]));

function floral(c: Ctx, w: number, h: number) {
  const s = c.s;
  const leafLen = clamp(s * 0.2, 10, 24);
  const R = clamp(s * 0.17, 7, 18);
  const top = h / 2 + OVER, bot = -h / 2 - OVER;
  const ph = c.rnd() * 3;
  const main = vine(c, vinePts([-0.07 * w, bot], [0.05 * w, top], 0.07 * w, 1.1, ph, 34), 2.6, 1.4, 4, leafLen);
  const at = (p: Pt[], t: number): Pt => p[Math.round(t * (p.length - 1))];
  const br = (from: Pt, to: Pt, amp: number) => vine(c, vinePts(from, to, amp, 0.9, c.rnd() * 3, 26), 2, 1.2, 4, leafLen * 0.85);
  const left = br(at(main, 0.3), [-0.46 * w, top], 0.06 * w);
  const right = br(at(main, 0.22), [0.46 * w, top], 0.06 * w);
  const lowL = br(at(main, 0.58), [-0.47 * w, bot], 0.05 * w);
  const lowR = br(at(main, 0.5), [0.47 * w, bot], 0.05 * w);
  // ramos de enchimento entre os grandes
  br(at(left, 0.45), [-0.2 * w, top], 0.04 * w);
  br(at(right, 0.4), [0.22 * w, top], 0.04 * w);

  bloom(c, at(main, 0.58), R * 1.05);
  bloom(c, at(left, 0.78), R * 0.85);
  bloom(c, at(right, 0.72), R * 0.9);
  bloom(c, at(lowL, 0.62), R * 0.75);
  bud(c, at(lowR, 0.85), 2);
  bud(c, at(main, 0.2), 2);
}

function leaves(c: Ctx, w: number, h: number) {
  const n = clamp(Math.round(w / 18), 4, 9);
  const leafLen = clamp(c.s * 0.19, 9, 22);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / n + (c.rnd() - 0.5) * 6;
    const lean = (c.rnd() - 0.5) * 0.25 * w;
    vine(c, vinePts([x - lean, -h / 2 - OVER], [x + lean, h / 2 + OVER], 0.04 * w, 1.2, c.rnd() * 6, 30), 2, 1.1, 2, leafLen);
  }
}

function arabesque(c: Ctx, w: number, h: number) {
  const s = c.s;
  const top = h / 2 + OVER, bot = -h / 2 - OVER;
  c.acc.stems.push(stroke(c.M, c.k, [[0, bot], [0, top]], 2.6, 2));
  const rows = clamp(Math.round(h / 24), 2, 5);
  for (let i = 0; i < rows; i++) {
    const y = -h / 2 + (h * (i + 0.7)) / (rows + 0.4);
    const r = clamp(s * 0.13, 6, 15) * (1 - 0.1 * i);
    const turns = 1.15 + (i % 2) * 0.35;
    const sc = scroll(c.M, c.k, r, turns, 2.1, 1);
    c.acc.stems.push(place(sc, c.k, 0, y));
    c.acc.stems.push(c.k(place(sc, c.k, 0, y).mirror([1, 0])));
    const reach = r * 0.95;
    for (const sx of [1, -1]) c.acc.leaves.push(place(leaf(c.M, c.k, r * 1.1, r * 0.45), c.k, sx * reach, y + r, sx > 0 ? 70 : 110));
  }
  bloom(c, [0, h * 0.18], clamp(s * 0.15, 6.5, 16));
  for (const sx of [1, -1]) {
    vine(c, vinePts([0, -h * 0.35], [sx * 0.46 * w, h * 0.08], 0.05 * w, 1, 1, 20), 1.6, 1, 3, clamp(s * 0.13, 7, 16));
  }
}

function butterflies(c: Ctx, w: number, h: number) {
  const S = clamp(c.s * 0.3, 12, 30);
  const cols = clamp(Math.round(w / (S * 1.9)), 2, 5);
  const rows = clamp(Math.round(h / (S * 1.8)), 1, 3);
  const leafLen = clamp(c.s * 0.14, 8, 16);
  // trepadeiras entre as colunas (sobem do chão até o teto), depois uma borboleta em cada casa da grade
  for (let i = 0; i <= cols; i++) {
    const x = -w / 2 + (w * i) / cols + (c.rnd() - 0.5) * 4;
    vine(c, vinePts([x, -h / 2 - OVER], [x + (c.rnd() - 0.5) * 8, h / 2 + OVER], 0.03 * w, 1.1, c.rnd() * 6, 28), 1.8, 1.2, 3, leafLen, false);
  }
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < cols; i++) {
      const cx = -w / 2 + (w * (i + 0.5 + (r % 2 ? 0.0 : 0))) / cols + (c.rnd() - 0.5) * 4;
      const cy = -h / 2 + (h * (r + 0.5)) / rows + (c.rnd() - 0.5) * 4;
      const b = butterfly(c.M, c.k, S * (0.85 + c.rnd() * 0.3));
      c.acc.stems.push(place(c.k(b.whole.subtract(b.eyes)), c.k, cx, cy, (c.rnd() - 0.5) * 50));
    }
  bloom(c, [(c.rnd() - 0.5) * w * 0.6, (c.rnd() - 0.5) * h * 0.4], clamp(c.s * 0.14, 6, 14));
}

const PATTERNS: Record<Exclude<LacePattern, "custom">, (c: Ctx, w: number, h: number) => void> = { floral, leaves, butterflies, arabesque };

/** A renda de um padrão da biblioteca, numa caixa `w` × `h` centrada (Y para cima). Tudo registrado em `k`. */
export function laceRoles(M: ManifoldToplevel, k: K, pattern: Exclude<LacePattern, "custom">, w: number, h: number, seed: number): LaceRoles {
  const acc: Acc = { leaves: [], flowers: [], stems: [] };
  PATTERNS[pattern]({ M, k, rnd: rng(seed), acc, s: Math.min(w, h) }, w, h);
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
  for (let guard = 0; guard < 60; guard++) {
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
