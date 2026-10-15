import type { CS, ManifoldToplevel } from "../manifold";

export type K = <D extends { delete(): void }>(o: D) => D;
export type Pt = [number, number];

/** Sorteio com semente (mulberry32): o mesmo convite sai igual toda vez. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEG = 20;
const dot = (M: ManifoldToplevel, k: K, r: number, p: Pt): CS => k(k(M.CrossSection.circle(Math.max(r, 0.05), SEG)).translate(p));

/** Traço de largura que muda de `w0` a `w1` ao longo dos pontos (cápsulas unidas). Registrado em `k`. */
export function stroke(M: ManifoldToplevel, k: K, pts: Pt[], w0: number, w1: number): CS {
  if (pts.length < 2) return k(M.CrossSection.union([]));
  const n = pts.length - 1;
  const caps = pts.slice(1).map((p, i) => {
    const a = (w0 + ((w1 - w0) * i) / n) / 2;
    const b = (w0 + ((w1 - w0) * (i + 1)) / n) / 2;
    return k(M.CrossSection.hull([dot(M, k, a, pts[i]), dot(M, k, b, p)]));
  });
  return k(M.CrossSection.union(caps));
}

const place = (cs: CS, k: K, x: number, y: number, deg = 0, s = 1): CS => k(k(k(cs.scale([s, s])).rotate(deg)).translate([x, y]));

/** Largura das nervuras e linhas vazadas: acima do mínimo que o bico imprime sobre o tule. */
export const VEIN_W = 0.5;

/** Folha em lente, da base (0,0) à ponta (len,0), com a nervura central e as laterais vazadas quando cabem. */
export function leaf(M: ManifoldToplevel, k: K, len: number, wid: number, veins = true): CS {
  const s = wid / 2;
  const R = (len * len) / 4 / (2 * s) + s / 2;
  const d = R - s;
  const a = k(k(M.CrossSection.circle(R, 28)).translate([len / 2, d]));
  const b = k(k(M.CrossSection.circle(R, 28)).translate([len / 2, -d]));
  const lens = k(a.intersect(b));
  if (!veins || wid < 4.5 || len < 9) return lens;
  const bar = (l: number, x: number, deg: number) => k(k(k(M.CrossSection.square([l, VEIN_W])).translate([0, -VEIN_W / 2])).rotate(deg).translate([x, 0]));
  const cuts: CS[] = [bar(len * 0.7, len * 0.14, 0)];
  const n = len >= 16 ? 3 : len >= 12 ? 2 : 1;
  const l = Math.min(len * 0.2, wid * 0.42);
  for (let i = 0; i < n; i++) {
    const x = len * (0.22 + (0.5 * (i + 0.5)) / n);
    for (const sd of [1, -1]) cuts.push(bar(l, x, sd * 38));
  }
  return k(lens.subtract(k(M.CrossSection.union(cuts))));
}

/** Flor de `petals` pétalas de raio `R`: pétalas cheias com a nervura vazada, e o miolo vazado. */
export function flower(M: ManifoldToplevel, k: K, R: number, petals = 5): CS {
  const ellipse = (rx: number, ry: number, x: number, deg: number) => k(k(k(k(M.CrossSection.circle(1, 24)).scale([rx, ry])).translate([x, 0])).rotate(deg));
  const ry = Math.min(R * 0.34 * (5 / petals) ** 0.5, R * 0.4);
  const outer = k(M.CrossSection.union(Array.from({ length: petals }, (_, i) => ellipse(R * 0.52, ry, R * 0.5, (360 * i) / petals))));
  // nervura de cada pétala: um traço vazado do meio até perto da ponta
  const vein = (i: number) => k(k(k(M.CrossSection.square([R * 0.5, VEIN_W])).translate([R * 0.3, -VEIN_W / 2])).rotate((360 * i) / petals));
  const cuts = R >= 7 ? Array.from({ length: petals }, (_, i) => vein(i)) : [];
  const core = R * 0.1;
  if (core >= 0.6) cuts.push(dot(M, k, core, [0, 0]));
  return cuts.length ? k(outer.subtract(k(M.CrossSection.union(cuts)))) : outer;
}

export type Butterfly = {
  /** Silhueta inteira (asas, corpo e antenas), de ponta a ponta de asa `S`. */
  whole: CS;
  /** Asas sem o corpo: de cada lado uma peça. */
  wings: CS;
  /** Os "olhos" das asas: recorte (renda) ou camada de cima (relevo). */
  eyes: CS;
  body: CS;
};

/** Borboleta de abertura `S`, de frente: corpo no eixo Y, asas de cima maiores. */
export function butterfly(M: ManifoldToplevel, k: K, S: number): Butterfly {
  const ell = (rx: number, ry: number, x: number, y: number, deg: number) => k(k(k(k(M.CrossSection.circle(1, 36)).scale([rx * S, ry * S])).rotate(deg)).translate([x * S, y * S]));
  const upper = ell(0.27, 0.19, 0.2, 0.14, 28);
  const lower = ell(0.19, 0.14, 0.15, -0.14, -32);
  const right = k(upper.add(lower));
  const left = k(right.mirror([1, 0]));
  const wings = k(right.add(left));
  const body = ell(0.034, 0.23, 0, 0, 0);
  const feel = [1, -1].map((sx) => stroke(M, k, [[sx * 0.01 * S, 0.2 * S], [sx * 0.06 * S, 0.3 * S], [sx * 0.13 * S, 0.37 * S]], Math.max(0.8, 0.02 * S), Math.max(0.8, 0.02 * S)));
  const whole = k(M.CrossSection.union([wings, body, ...feel]));
  const inner = (wing: CS) => k(wing.offset(-0.075 * S, "Round"));
  const gapBody = k(body.offset(0.035 * S, "Round"));
  const bar = (deg: number) => k(k(k(M.CrossSection.square([0.5 * S, Math.max(0.7, 0.02 * S)])).translate([0, -Math.max(0.35, 0.01 * S)])).rotate(deg));
  const eyes = k(k(M.CrossSection.union([inner(right), inner(left)])).subtract(k(M.CrossSection.union([gapBody, bar(30), bar(150), bar(-30), bar(210)]))));
  return { whole, wings: k(wings.subtract(body.offset(0.02 * S, "Round"))), eyes, body };
}

/** Voluta: espiral que fecha de `r` até quase o centro, em `turns` voltas. Parte do ponto (0,0) para a direita. */
export function scroll(M: ManifoldToplevel, k: K, r: number, turns: number, w: number, dir = 1): CS {
  const steps = Math.max(14, Math.round(turns * 22));
  const pts: Pt[] = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const ang = -Math.PI / 2 + dir * turns * 2 * Math.PI * t;
    const rad = r * (1 - 0.82 * t);
    return [rad * Math.cos(ang), r + rad * Math.sin(ang)];
  });
  return stroke(M, k, pts, w, Math.max(0.9, w * 0.45));
}

export { place };
