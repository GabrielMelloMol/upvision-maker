import type { Pt } from "./homography";
import type { Rgba } from "./image";

/**
 * Foto sintética para os testes (#169): câmera estenopeica olhando uma folha branca sobre uma mesa cinza, com caixas
 * escuras (ferramentas) de medida conhecida em cima. Cada pixel lança um raio: caixa → escuro, folha → branco,
 * resto → mesa. Supersample 3×3 para a borda ter o meio-tom de uma foto de verdade.
 * Mundo em mm: x e y no plano da folha (origem num canto), z para cima.
 */
export type Box = { x: number; y: number; w: number; d: number; h: number; tone?: number };
export type Scene = {
  sheet: { w: number; h: number };
  boxes: Box[];
  camera: [number, number, number];
  target: [number, number, number];
  focalPx: number;
  size: [number, number];
  /** Sombra: faixa mais escura de `width` mm à direita de cada caixa (multiplica o branco por `strength`). */
  shadow?: { width: number; strength: number };
  /** Rola a câmera em torno do eixo de visão (graus). */
  roll?: number;
};

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Linhas de R (direita, baixo, frente) da câmera que olha de `eye` para `target`. */
function rotation(eye: V3, target: V3, rollDeg = 0): [V3, V3, V3] {
  const f = norm(sub(target, eye));
  let r = norm(cross(f, [0, 1, 0]));
  let d = cross(f, r);
  const a = (rollDeg * Math.PI) / 180;
  [r, d] = [
    [r[0] * Math.cos(a) + d[0] * Math.sin(a), r[1] * Math.cos(a) + d[1] * Math.sin(a), r[2] * Math.cos(a) + d[2] * Math.sin(a)],
    [d[0] * Math.cos(a) - r[0] * Math.sin(a), d[1] * Math.cos(a) - r[1] * Math.sin(a), d[2] * Math.cos(a) - r[2] * Math.sin(a)],
  ];
  return [r, d, f];
}

/** Onde um ponto do mundo cai na foto. */
export function project(s: Scene, p: V3): Pt {
  const R = rotation(s.camera, s.target, s.roll);
  const q = sub(p, s.camera);
  const c = [dot(R[0], q), dot(R[1], q), dot(R[2], q)];
  return [s.size[0] / 2 + (s.focalPx * c[0]) / c[2], s.size[1] / 2 + (s.focalPx * c[1]) / c[2]];
}

/** Homografia folha (mm, z = 0) → foto (px), a verdade para conferir a detecção. */
export function truthCorners(s: Scene): Pt[] {
  return ([[0, 0], [s.sheet.w, 0], [s.sheet.w, s.sheet.h], [0, s.sheet.h]] as Pt[]).map(([x, y]) => project(s, [x, y, 0]));
}

function hitsBox(o: V3, d: V3, b: Box): boolean {
  let t0 = 0;
  let t1 = Infinity;
  const lo = [b.x, b.y, 0];
  const hi = [b.x + b.w, b.y + b.d, b.h];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < lo[k] || o[k] > hi[k]) return false;
      continue;
    }
    let a = (lo[k] - o[k]) / d[k];
    let c = (hi[k] - o[k]) / d[k];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

function shade(s: Scene, o: V3, d: V3): number {
  for (const b of s.boxes) if (hitsBox(o, d, b)) return b.tone ?? 35;
  const t = -o[2] / d[2];
  if (t <= 0) return 90;
  const x = o[0] + t * d[0];
  const y = o[1] + t * d[1];
  if (x < 0 || y < 0 || x > s.sheet.w || y > s.sheet.h) return 85 + 10 * Math.sin(x / 7) * Math.sin(y / 5); // mesa com textura
  // papel com iluminação desigual (mais claro no meio)
  let v = 238 - 18 * Math.hypot((x - s.sheet.w / 2) / s.sheet.w, (y - s.sheet.h / 2) / s.sheet.h);
  if (s.shadow) for (const b of s.boxes) if (x > b.x + b.w && x < b.x + b.w + s.shadow.width && y > b.y + 3 && y < b.y + b.d + 3) v *= s.shadow.strength;
  return v;
}

export function renderScene(s: Scene, ss = 3): Rgba {
  const [w, h] = s.size;
  const R = rotation(s.camera, s.target, s.roll);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      let sum = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const cx = (px + (sx + 0.5) / ss - w / 2) / s.focalPx;
          const cy = (py + (sy + 0.5) / ss - h / 2) / s.focalPx;
          const d: V3 = [R[0][0] * cx + R[1][0] * cy + R[2][0], R[0][1] * cx + R[1][1] * cy + R[2][1], R[0][2] * cx + R[1][2] * cy + R[2][2]];
          sum += shade(s, s.camera, d);
        }
      const v = sum / (ss * ss);
      const i = (py * w + px) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}
