import { hexToRgb, rgbToLab } from "../../vectorize/palette";

/*
 * Paletas prontas do quadro por camadas (#100), montadas com os filamentos cadastrados: sempre o mais escuro
 * embaixo e o mais claro em cima; no meio, os que mais se parecem com o tom da paleta.
 */
export type Preset = { id: "bw" | "warm" | "pop" | "pastel"; label: string; colors: string[] };

type Lab = [number, number, number];
const lab = (hex: string): Lab => rgbToLab(...hexToRgb(hex));
const chroma = (l: Lab) => Math.hypot(l[1], l[2]);
const dist = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const MIN_POP_CHROMA = 40;
const MIN_PASTEL_L = 70;
const MIN_PASTEL_CHROMA = 12;
const MAX_WARM_DIST = 45;

/** O mais próximo de `target` entre os que sobraram (ou null). */
function nearest(pool: string[], target: Lab, maxDist = Infinity): string | null {
  let best: string | null = null, bd = maxDist;
  for (const c of pool) {
    const d = dist(lab(c), target);
    if (d < bd) [best, bd] = [c, d];
  }
  return best;
}

/** Do mais escuro ao mais claro (a ordem das faixas no quadro). */
export const byLight = (xs: string[]) => [...xs].sort((a, b) => lab(a)[0] - lab(b)[0]);

export function presetPalettes(filaments: string[]): Preset[] {
  const all = byLight([...new Set(filaments.map((f) => f.toLowerCase()))]);
  if (all.length < 2) return [];
  const dark = all[0], light = all[all.length - 1];
  const middle = all.slice(1, -1);
  const out: Preset[] = [];
  const add = (id: Preset["id"], label: string, mid: (string | null)[]) => {
    const picked = [...new Set(mid.filter((c): c is string => !!c))];
    if (id === "bw" || picked.length) out.push({ id, label, colors: byLight([dark, ...picked, light]) });
  };
  add("bw", "Preto e branco", [nearest(middle.filter((c) => chroma(lab(c)) < MIN_PASTEL_CHROMA), [50, 0, 0])]);
  const warm1 = nearest(middle, [30, 20, 20], MAX_WARM_DIST); // marrom / vinho: sombras de pele
  add("warm", "Retrato quente", [warm1, nearest(middle.filter((c) => c !== warm1), [78, 12, 22], MAX_WARM_DIST)]);
  const vivid = middle.filter((c) => chroma(lab(c)) >= MIN_POP_CHROMA).sort((a, b) => chroma(lab(b)) - chroma(lab(a)));
  add("pop", "Pop", vivid.slice(0, 2));
  const soft = middle.filter((c) => lab(c)[0] >= MIN_PASTEL_L && chroma(lab(c)) >= MIN_PASTEL_CHROMA);
  add("pastel", "Pastel", soft.slice(-2));
  return out;
}

/** Miniatura da prévia: claro (0..1) → cor da faixa, do escuro ao claro, em RGBA. */
export function bandPreview(luma: Float32Array, colors: string[]): Uint8ClampedArray<ArrayBuffer> {
  const rgb = byLight(colors).map(hexToRgb);
  const out = new Uint8ClampedArray(luma.length * 4);
  luma.forEach((l, i) => {
    const c = rgb[Math.min(rgb.length - 1, Math.floor(l * rgb.length))];
    out.set([...c, 255], i * 4);
  });
  return out;
}
