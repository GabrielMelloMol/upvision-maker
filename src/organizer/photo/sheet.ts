import type { Pt } from "./homography";
import { otsu, sample, shrink, type Gray } from "./image";

/** Lado maior da imagem reduzida usada para achar a folha (rápido; o refinamento usa a foto inteira). */
const COARSE_SIDE = 640;

/**
 * Os 4 cantos da folha na foto (px), em sentido horário na tela a partir do canto de cima à esquerda.
 * 1) Imagem reduzida → limiar de Otsu → maior região clara (a folha).
 * 2) Quadrilátero de maior área dentro do fecho convexo dessa região (os objetos em cima não atrapalham).
 * 3) Cada lado é refinado na foto inteira: acha a borda papel/mesa com subpixel ao longo do lado e ajusta uma reta;
 *    os cantos são os cruzamentos das retas. null = não achou uma região clara grande o bastante.
 */
export function findSheetCorners(g: Gray): Pt[] | null {
  const k = Math.max(1, Math.floor(Math.max(g.width, g.height) / COARSE_SIDE));
  const small = shrink(g, k);
  const region = largestBright(small);
  if (!region || region.length < small.width * small.height * 0.05) return null;
  const hull = convexHull(region.map((i) => [(i % small.width) + 0.5, Math.floor(i / small.width) + 0.5] as Pt));
  const quad = maxQuad(hull);
  if (!quad) return null;
  const coarse = order(quad.map(([x, y]) => [x * k, y * k] as Pt));
  return refine(g, coarse, k) ?? coarse;
}

/** Pixels (índices) da maior região clara 4-conectada. */
function largestBright(g: Gray): number[] | null {
  const t = otsu(g.data);
  const seen = new Uint8Array(g.width * g.height);
  let best: number[] | null = null;
  for (let s = 0; s < seen.length; s++) {
    if (seen[s] || g.data[s] < t) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % g.width;
      for (const n of [i - g.width, i + g.width, x > 0 ? i - 1 : -1, x < g.width - 1 ? i + 1 : -1])
        if (n >= 0 && n < seen.length && !seen[n] && g.data[n] >= t) {
          seen[n] = 1;
          stack.push(n);
        }
    }
    if (!best || comp.length > best.length) best = comp;
  }
  return best;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Fecho convexo (cadeia monótona). */
export function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

const area = (q: Pt[]) => Math.abs(q.reduce((s, p, i) => s + cross([0, 0], p, q[(i + 1) % q.length]), 0)) / 2;

/** Quadrilátero de (quase) maior área com vértices no fecho: começa pela diagonal mais longa e melhora um canto por vez. */
export function maxQuad(hull: Pt[]): Pt[] | null {
  if (hull.length < 4) return null;
  let a = 0;
  let c = 0;
  let far = -1;
  for (let i = 0; i < hull.length; i++)
    for (let j = i + 1; j < hull.length; j++) {
      const d = (hull[i][0] - hull[j][0]) ** 2 + (hull[i][1] - hull[j][1]) ** 2;
      if (d > far) [far, a, c] = [d, i, j];
    }
  const side = (from: number, to: number) => {
    let best = from;
    let bestD = -1;
    for (let i = from; i !== to; i = (i + 1) % hull.length) {
      const d = Math.abs(cross(hull[a], hull[c], hull[i]));
      if (d > bestD) [bestD, best] = [d, i];
    }
    return best;
  };
  const idx = [a, side(a, c), c, side(c, a)];
  for (let round = 0; round < 4; round++)
    for (let k = 0; k < 4; k++) {
      let bestArea = area(idx.map((i) => hull[i]));
      for (let i = 0; i < hull.length; i++) {
        const trial = idx.map((v, j) => (j === k ? i : v));
        const ar = area(trial.map((t) => hull[t]));
        if (ar > bestArea + 1e-9 && isConvexOrder(trial.map((t) => hull[t]))) [bestArea, idx[k]] = [ar, i];
      }
    }
  return idx.map((i) => hull[i]);
}

function isConvexOrder(q: Pt[]): boolean {
  const s = q.map((p, i) => Math.sign(cross(p, q[(i + 1) % 4], q[(i + 2) % 4])));
  return s.every((v) => v === s[0] && v !== 0);
}

/** Ordena em sentido horário na tela (y para baixo), começando pelo canto mais perto do topo à esquerda. */
export function order(q: Pt[]): Pt[] {
  const cx = q.reduce((s, p) => s + p[0], 0) / q.length;
  const cy = q.reduce((s, p) => s + p[1], 0) / q.length;
  const sorted = [...q].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0;
  sorted.forEach((p, i) => {
    if (p[0] + p[1] < sorted[start][0] + sorted[start][1]) start = i;
  });
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}

type Line = { p: Pt; d: Pt }; // ponto e direção unitária

/** Refina cada lado na foto inteira; null se algum lado não tiver borda clara (aí fica o quadrilátero grosso). */
function refine(g: Gray, q: Pt[], k: number): Pt[] | null {
  const lines: Line[] = [];
  const reach = 2 * k + 4;
  for (let s = 0; s < 4; s++) {
    const a = q[s];
    const b = q[(s + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const n: Pt = [-d[1], d[0]]; // horário na tela: a normal (−dy, dx) aponta para dentro da folha
    const pts: Pt[] = [];
    const steps = Math.min(200, Math.floor(len / 3));
    for (let i = 0; i <= steps; i++) {
      const t = 0.1 + (0.8 * i) / steps; // longe dos cantos
      const c: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const e = edgeAlong(g, c, n, reach);
      if (e !== null) pts.push([c[0] + n[0] * e, c[1] + n[1] * e]);
    }
    const line = fitLine(pts);
    if (!line) return null;
    lines.push(line);
  }
  const out = lines.map((l, i) => intersect(lines[(i + 3) % 4], l));
  return out.every((p) => p !== null) ? (out as Pt[]) : null;
}

/** Posição (subpixel, ao longo de n) em que a claridade cruza o meio entre mesa (fora) e papel (dentro). */
function edgeAlong(g: Gray, c: Pt, n: Pt, reach: number): number | null {
  const at = (t: number) => sample(g, c[0] + n[0] * t, c[1] + n[1] * t);
  const outside = at(-reach);
  const inside = at(reach);
  if (inside - outside < 25) return null; // sem contraste: objeto em cima da borda ou sombra
  const mid = (inside + outside) / 2;
  const step = 0.25;
  let prev = at(-reach);
  for (let t = -reach + step; t <= reach; t += step) {
    const v = at(t);
    if (prev < mid && v >= mid) return t - step + (step * (mid - prev)) / (v - prev);
    prev = v;
  }
  return null;
}

/** Reta pelos pontos (mínimos quadrados total), descartando os que fogem mais de 1,5 px e refazendo. */
function fitLine(pts: Pt[]): Line | null {
  let use = pts;
  let line: Line | null = null;
  for (let round = 0; round < 3; round++) {
    if (use.length < 5) return line;
    const mx = use.reduce((s, p) => s + p[0], 0) / use.length;
    const my = use.reduce((s, p) => s + p[1], 0) / use.length;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const [x, y] of use) {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
      syy += (y - my) ** 2;
    }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    line = { p: [mx, my], d: [Math.cos(ang), Math.sin(ang)] };
    const l = line;
    const dist = (p: Pt) => Math.abs((p[0] - l.p[0]) * l.d[1] - (p[1] - l.p[1]) * l.d[0]);
    const kept = pts.filter((p) => dist(p) < 1.5);
    if (kept.length === use.length) break;
    use = kept;
  }
  return line;
}

function intersect(l1: Line, l2: Line): Pt | null {
  const den = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / den;
  return [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t];
}
