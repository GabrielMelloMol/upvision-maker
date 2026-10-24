import type { Pt } from "./homography";
import type { Rgba } from "./image";

/**
 * Foto sintética para os testes (#169): câmera estenopeica olhando uma folha branca sobre uma mesa cinza, com caixas
 * escuras (ferramentas) de medida conhecida em cima. Cada pixel lança um raio: caixa → escuro, folha → branco,
 * resto → mesa. Supersample 3×3 para a borda ter o meio-tom de uma foto de verdade.
 * Mundo em mm: x e y no plano da folha (origem num canto), z para cima.
 */
/** `glints`: reflexos de luz no topo da caixa (círculos estourados no branco, centro e raio em mm). */
export type Box = { x: number; y: number; w: number; d: number; h: number; tone?: number; glints?: { x: number; y: number; r: number }[] };
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
  /**
   * Mesa clara (tom 0–255) no lugar da cinza, quase do tom do papel; `shadow` = sombra fina da borda do papel, uma
   * faixa de `width` mm em volta da folha (multiplica a mesa por `strength`): o único contraste que sobra.
   */
  table?: { tone: number; shadow?: { width: number; strength: number } };
  /** O que está impresso no papel (tom 0–255 em x, y mm da folha; null = papel). */
  print?: (x: number, y: number) => number | null;
  /** Ruído do sensor: desvio padrão (tom 0–255), sempre o mesmo para a mesma cena. */
  noise?: number;
  /** Distorção radial da lente (k1; negativo = barril, como a grande-angular do celular), em relação à meia diagonal. */
  distortion?: number;
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
  for (const b of s.boxes) {
    if (!hitsBox(o, d, b)) continue;
    const t = (b.h - o[2]) / d[2]; // onde o raio cruza o topo da caixa
    const [x, y] = [o[0] + t * d[0], o[1] + t * d[1]];
    return b.glints?.some((g) => Math.hypot(x - g.x, y - g.y) <= g.r) ? 255 : (b.tone ?? 35);
  }
  const t = -o[2] / d[2];
  if (t <= 0) return 90;
  const x = o[0] + t * d[0];
  const y = o[1] + t * d[1];
  if (x < 0 || y < 0 || x > s.sheet.w || y > s.sheet.h) {
    if (!s.table) return 85 + 10 * Math.sin(x / 7) * Math.sin(y / 5); // mesa com textura
    const sh = s.table.shadow;
    const shaded = sh && x > -sh.width && y > -sh.width && x < s.sheet.w + sh.width && y < s.sheet.h + sh.width;
    return (s.table.tone + 3 * Math.sin(x / 3) * Math.sin(y / 4)) * (shaded ? sh.strength : 1);
  }
  const printed = s.print?.(x, y);
  if (printed !== undefined && printed !== null) return printed;
  // papel com iluminação desigual (mais claro no meio)
  let v = 238 - 18 * Math.hypot((x - s.sheet.w / 2) / s.sheet.w, (y - s.sheet.h / 2) / s.sheet.h);
  if (s.shadow) for (const b of s.boxes) if (x > b.x + b.w && x < b.x + b.w + s.shadow.width && y > b.y + 3 && y < b.y + b.d + 3) v *= s.shadow.strength;
  return v;
}

export function renderScene(s: Scene, ss = 3): Rgba {
  const [w, h] = s.size;
  const R = rotation(s.camera, s.target, s.roll);
  const data = new Uint8ClampedArray(w * h * 4);
  const half2 = (w * w + h * h) / 4;
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      let sum = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          let ux = px + (sx + 0.5) / ss - w / 2;
          let uy = py + (sy + 0.5) / ss - h / 2;
          if (s.distortion) {
            // pixel distorcido → raio sem distorção (inversa de 1ª ordem, boa para |k1| pequeno)
            const f = 1 / (1 + s.distortion * ((ux * ux + uy * uy) / half2));
            ux *= f;
            uy *= f;
          }
          const cx = ux / s.focalPx;
          const cy = uy / s.focalPx;
          const d: V3 = [R[0][0] * cx + R[1][0] * cy + R[2][0], R[0][1] * cx + R[1][1] * cy + R[2][1], R[0][2] * cx + R[1][2] * cy + R[2][2]];
          sum += shade(s, s.camera, d);
        }
      // Box-Muller: ruído gaussiano
      const v = sum / (ss * ss) + (s.noise ? s.noise * Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand()) : 0);
      const i = (py * w + px) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}
