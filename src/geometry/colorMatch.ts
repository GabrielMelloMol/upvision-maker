import { hexToRgb, rgbToLab } from "../vectorize/palette";

/** Cores → filamentos (#98): diferença perceptual CIEDE2000 (ΔE00), cor mais próxima e junção das mais parecidas. */
type Lab = [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const hueDeg = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);

/** CIEDE2000 (Sharma, Wu e Dalal, 2005), kL = kC = kH = 1. */
export function deltaE2000Lab([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = hueDeg(b1, a1p), h2p = hueDeg(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) dhp = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lmp = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hmp = h1p + h2p;
  if (C1p * C2p !== 0) hmp = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hmp - 30)) + 0.24 * Math.cos(rad(2 * hmp)) + 0.32 * Math.cos(rad(3 * hmp + 6)) - 0.2 * Math.cos(rad(4 * hmp - 63));
  const dTheta = 30 * Math.exp(-(((hmp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lmp - 50) ** 2) / Math.sqrt(20 + (Lmp - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

const lab = (hex: string): Lab => rgbToLab(...hexToRgb(hex));
export const deltaE2000 = (a: string, b: string) => deltaE2000Lab(lab(a), lab(b));

/** Cor da lista mais parecida com `hex` (null se a lista estiver vazia). */
export function nearestColor(hex: string, list: string[]): string | null {
  let best: string | null = null;
  let d = Infinity;
  for (const c of list) {
    const e = deltaE2000(hex, c);
    if (e < d) [best, d] = [c, e];
  }
  return best;
}

/**
 * Junta as cores mais parecidas até sobrarem `max` (ex.: slots do AMS). Devolve cor → cor que fica; a que fica é a
 * que aparece antes na lista (em geral a base / a de mais área).
 */
export function mergeClosest(colors: string[], max: number): Record<string, string> {
  const uniq = [...new Set(colors.map((c) => c.toLowerCase()))];
  const map: Record<string, string> = Object.fromEntries(uniq.map((c) => [c, c]));
  const keep = [...uniq];
  while (keep.length > Math.max(1, max)) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < keep.length; i++)
      for (let j = i + 1; j < keep.length; j++) {
        const d = deltaE2000(keep[i], keep[j]);
        if (d < bd) [bi, bj, bd] = [i, j, d];
      }
    const [stay, gone] = [keep[bi], keep[bj]];
    for (const k of Object.keys(map)) if (map[k] === gone) map[k] = stay;
    keep.splice(bj, 1);
  }
  return map;
}
