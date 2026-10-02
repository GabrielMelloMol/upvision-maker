import { homography, type Pt } from "./homography";
import { sample, type Gray } from "./image";

/**
 * Folha pelas bordas retas (#169), para quando a mesa é clara e "a região mais clara" não separa o papel: gradiente,
 * bordas finas, Hough que só vota na direção do gradiente, e quadriláteros de 4 retas pontuados pelo contraste ao
 * longo de cada lado e pela proporção da folha corrigida pela perspectiva.
 */

/** Reta x·cosθ + y·senθ = ρ (px da imagem dada). */
export type HLine = { theta: number; rho: number; votes: number };

const THETA_BINS = 180;
/** Cada pixel de borda vota só nos ângulos a ±3° da direção do gradiente dele. */
const THETA_SPREAD = 3;
const MAX_LINES = 14;
/** Menor trecho reto que conta como lado (px da imagem reduzida). */
const MIN_VOTES = 40;
const MIN_EDGE = 4;

function sobel(g: Gray): { mag: Float32Array; ang: Float32Array } {
  const { width: w, height: h, data: d } = g;
  const mag = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = d[i - w + 1] + 2 * d[i + 1] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - 1] - d[i + w - 1];
      const gy = d[i + w - 1] + 2 * d[i + w] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - w] - d[i - w + 1];
      mag[i] = Math.hypot(gx, gy) / 8;
      ang[i] = Math.atan2(gy, gx);
    }
  return { mag, ang };
}

/** Retas mais votadas (com supressão de vizinhos no espaço θ × ρ). */
export function houghLines(g: Gray): HLine[] {
  const { width: w, height: h } = g;
  const { mag, ang } = sobel(g);
  const diag = Math.ceil(Math.hypot(w, h));
  const acc = new Float32Array(THETA_BINS * (2 * diag + 1));
  const edge: number[] = []; // x, y, ângulo da normal de cada pixel de borda (para refinar as retas)
  const cos = Float64Array.from({ length: THETA_BINS }, (_, t) => Math.cos((t * Math.PI) / THETA_BINS));
  const sin = Float64Array.from({ length: THETA_BINS }, (_, t) => Math.sin((t * Math.PI) / THETA_BINS));
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < MIN_EDGE) continue;
      // borda fina: só o máximo ao longo do gradiente
      const dx = Math.round(Math.cos(ang[i]));
      const dy = Math.round(Math.sin(ang[i]));
      if (m < mag[i + dy * w + dx] || m < mag[i - dy * w - dx]) continue;
      let a = ang[i] < 0 ? ang[i] + Math.PI : ang[i]; // a normal da reta é o gradiente
      if (a >= Math.PI) a -= Math.PI;
      edge.push(x, y, a);
      const center = Math.round((a / Math.PI) * THETA_BINS);
      for (let k = -THETA_SPREAD; k <= THETA_SPREAD; k++) {
        const t = (center + k + THETA_BINS) % THETA_BINS;
        const rho = Math.round(x * cos[t] + y * sin[t]);
        acc[t * (2 * diag + 1) + rho + diag] += 1;
      }
    }
  const peaks: HLine[] = [];
  const rows = 2 * diag + 1;
  const order = [...acc.keys()].filter((i) => acc[i] >= MIN_VOTES).sort((a, b) => acc[b] - acc[a]);
  for (const i of order) {
    if (peaks.length >= MAX_LINES) break;
    const t = Math.floor(i / rows);
    const rho = (i % rows) - diag;
    const theta = (t * Math.PI) / THETA_BINS;
    const near = peaks.some((p) => {
      let dt = Math.abs(p.theta - theta);
      let dr = Math.abs(p.rho - rho);
      if (dt > Math.PI / 2) [dt, dr] = [Math.PI - dt, Math.abs(p.rho + rho)]; // θ perto de 0 e de π é a mesma reta
      return dt < (6 * Math.PI) / 180 && dr < 12;
    });
    if (!near) peaks.push({ theta, rho, votes: acc[i] });
  }
  return peaks.map((l) => fitToEdge(l, edge));
}

/**
 * O Hough tem resolução de 1°: num lado de 800 px a ponta erra até 7 px. Ajusta a reta (mínimos quadrados total)
 * nos pixels de borda a até 3 px dela e com a normal a até 5° da dela.
 */
function fitToEdge(l: HLine, edge: number[]): HLine {
  const [c, s] = [Math.cos(l.theta), Math.sin(l.theta)];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < edge.length; i += 3) {
    const [x, y, a] = [edge[i], edge[i + 1], edge[i + 2]];
    let da = Math.abs(a - l.theta);
    da = Math.min(da, Math.PI - da);
    if (da < (5 * Math.PI) / 180 && Math.abs(x * c + y * s - l.rho) < 3) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length < 10) return l;
  const mx = xs.reduce((t, v) => t + v, 0) / xs.length;
  const my = ys.reduce((t, v) => t + v, 0) / ys.length;
  let [sxx, sxy, syy] = [0, 0, 0];
  xs.forEach((x, i) => {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  });
  // direção da reta = autovetor maior; a normal é perpendicular a ela
  let theta = 0.5 * Math.atan2(2 * sxy, sxx - syy) + Math.PI / 2;
  if (theta < 0) theta += Math.PI;
  if (theta >= Math.PI) theta -= Math.PI;
  return { theta, rho: mx * Math.cos(theta) + my * Math.sin(theta), votes: l.votes };
}

function cross(l1: HLine, l2: HLine): Pt | null {
  const [a1, b1, a2, b2] = [Math.cos(l1.theta), Math.sin(l1.theta), Math.cos(l2.theta), Math.sin(l2.theta)];
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 0.2) return null; // quase paralelas (menos de ~12°): não fazem canto
  return [(l1.rho * b2 - l2.rho * b1) / det, (a1 * l2.rho - a2 * l1.rho) / det];
}

const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * Quadriláteros convexos de 4 das retas, com pelo menos `minArea` px². Um canto pode sair até 20% da foto (folha
 * cortada): a medição avisa e segue com o resto.
 */
export function lineQuads(lines: HLine[], w: number, h: number, minArea: number): Pt[][] {
  const out: Pt[][] = [];
  const n = lines.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const L = [lines[a], lines[b], lines[c], lines[d]];
          // 3 jeitos de escolher os lados opostos
          for (const [p, q, r, s] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
            const corners = [cross(L[p], L[r]), cross(L[r], L[q]), cross(L[q], L[s]), cross(L[s], L[p])];
            if (corners.some((k) => !k || k[0] < -0.2 * w || k[1] < -0.2 * h || k[0] > 1.2 * w || k[1] > 1.2 * h)) continue;
            const quad = corners as Pt[];
            const turns = quad.map((k, i) => Math.sign(turn(k, quad[(i + 1) % 4], quad[(i + 2) % 4])));
            if (!turns.every((t) => t === turns[0] && t !== 0)) continue;
            const area = Math.abs(quad.reduce((t, k, i) => t + k[0] * quad[(i + 1) % 4][1] - quad[(i + 1) % 4][0] * k[1], 0)) / 2;
            if (area >= minArea) out.push(quad);
          }
        }
  return out;
}

/**
 * Proporção (lado maior ÷ menor) do retângulo que, em perspectiva, vira este quadrilátero. A focal vem do EXIF ou,
 * sem ela, da condição de que os dois lados do retângulo são perpendiculares (com o centro óptico no meio da foto);
 * se nem isso der (foto quase de frente), usa uma focal típica de celular.
 */
export function quadAspect(quad: Pt[], size: [number, number], focalPx?: number | null): number {
  const [cx, cy] = [size[0] / 2, size[1] / 2];
  const h = homography([[0, 0], [1, 0], [1, 1], [0, 1]], quad.map(([x, y]) => [x - cx, y - cy]));
  if (!h) return 0;
  const [h1, h2] = [[h[0], h[3], h[6]], [h[1], h[4], h[7]]];
  let f2 = focalPx ? focalPx ** 2 : -(h1[0] * h2[0] + h1[1] * h2[1]) / (h1[2] * h2[2]);
  const diag = Math.hypot(...size);
  if (!(f2 > (0.4 * diag) ** 2 && f2 < (4 * diag) ** 2)) f2 = (1.2 * diag) ** 2;
  const len = (c: number[]) => Math.hypot(c[0], c[1], c[2] * Math.sqrt(f2));
  const a = len(h1) / len(h2);
  return Math.max(a, 1 / a);
}

/**
 * Contraste ao longo de um lado: fração dos pontos com borda nítida (diferença ≥ 6 entre os dois lados, a até 3 px),
 * vezes a fração que concorda com o sentido da maioria (papel sempre mais claro, ou sempre mais escuro, que fora).
 * Ferramenta passando por cima de um trecho só tira aquele trecho.
 */
export function sideSupport(g: Gray, a: Pt, b: Pt, inside: Pt): number {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1) return 0;
  let n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if ((inside[0] - mid[0]) * n[0] + (inside[1] - mid[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const steps = 40;
  let seen = 0;
  let strong = 0;
  let up = 0;
  for (let i = 0; i < steps; i++) {
    const t = 0.1 + (0.8 * (i + 0.5)) / steps;
    const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (p[0] < 3 || p[1] < 3 || p[0] > g.width - 3 || p[1] > g.height - 3) continue; // trecho fora da foto não conta
    seen++;
    let best = 0;
    for (const d of [1, 2, 3]) {
      const diff = sample(g, p[0] + n[0] * d, p[1] + n[1] * d) - sample(g, p[0] - n[0] * d, p[1] - n[1] * d);
      if (Math.abs(diff) > Math.abs(best)) best = diff;
    }
    if (Math.abs(best) >= 6) {
      strong++;
      if (best > 0) up++;
    }
  }
  if (!strong || seen < steps / 4) return 0;
  return (strong / seen) * (Math.max(up, strong - up) / strong);
}

/** Proporções de folha aceitas: A4 (√2) e Carta (279,4 ÷ 215,9). */
export const SHEET_RATIOS = [Math.SQRT2, 279.4 / 215.9];

/** Nota 0–1 de um quadrilátero ser a folha: contraste nos 4 lados (média e o pior) × proporção de folha. */
export function scoreQuad(g: Gray, quad: Pt[], focalPx?: number | null, ratios = SHEET_RATIOS): { score: number; support: number; aspect: number } {
  const c: Pt = [quad.reduce((t, p) => t + p[0], 0) / 4, quad.reduce((t, p) => t + p[1], 0) / 4];
  const sides = quad.map((p, i) => sideSupport(g, p, quad[(i + 1) % 4], c));
  const support = 0.5 * (sides.reduce((t, s) => t + s, 0) / 4) + 0.5 * Math.min(...sides);
  const r = quadAspect(quad, [g.width, g.height], focalPx);
  const aspect = Math.max(...ratios.map((t) => Math.exp(-((Math.log(r / t) / 0.08) ** 2))));
  return { score: support * aspect, support, aspect };
}
