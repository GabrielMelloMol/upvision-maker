import type { Pt } from "./homography";
import { erode, label, PX_PER_MM } from "./segment";
import { convexHull } from "./sheet";

/**
 * Furo de verdade (#169): vazado em que se vê o papel através da ferramenta. O Torno transforma cada furo num pino
 * dentro do encaixe, então um furo falso (reflexo de luz na lente dos óculos, brilho do metal) vira um pino que impede
 * a peça de entrar. Só fica furo o que tiver tamanho útil E parecer papel; o resto é preenchido.
 */
const MIN_HOLE_MM2 = 50;
/** Lado menor do retângulo mínimo que contém o furo (o mesmo critério do pino no 3D). */
const MIN_HOLE_SIDE_MM = 5;
/** Papel visto pelo furo: claridade perto da do papel em volta (até metade, se a sombra da ferramenta cair nele). */
const PAPER_MIN = 0.5;
/**
 * Reflexo, não papel: bem mais claro que o papel em volta, ou estourado no branco e ainda assim acima do papel (se o
 * papel também estoura, não dá para separar e o furo fica).
 */
const GLARE_REL = 1.08;
const CLIPPED = 250;
const CLIPPED_REL = 1.02;
const MAX_GLARE_SHARE = 0.15;
/** Ignora a faixa de meio-tom da borda do furo ao medir o que tem dentro dele. */
const EDGE_PX = 4;

/** Comprimento × largura do menor retângulo (em qualquer ângulo) que contém os pontos. */
export function rectSize(points: Pt[]): { length: number; width: number } {
  const hull = convexHull(points);
  if (hull.length < 3) return { length: 0, width: 0 };
  let best = { area: Infinity, length: 0, width: 0 };
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) return;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let [lo, hi, nlo, nhi] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of hull) {
      const along = x * ux + y * uy;
      const across = -x * uy + y * ux;
      [lo, hi, nlo, nhi] = [Math.min(lo, along), Math.max(hi, along), Math.min(nlo, across), Math.max(nhi, across)];
    }
    const [d1, d2] = [hi - lo, nhi - nlo];
    if (d1 * d2 < best.area) best = { area: d1 * d2, length: Math.max(d1, d2), width: Math.min(d1, d2) };
  });
  return { length: best.length, width: best.width };
}

/**
 * Máscara das ferramentas com os furos falsos preenchidos. Furo = região sem ferramenta cercada por ela (não encosta
 * na borda da folha endireitada). Fica vazado só se: área ≥ 50 mm², lado menor ≥ 5 mm, claridade mediana de papel
 * (≥ 0,5 do papel em volta) e no máximo 15% de pixels mais claros que o papel ou estourados (reflexo especular).
 * `rel` = claridade relativa ao papel; `light` = claridade bruta (0–255) da folha endireitada.
 */
export function fillFakeHoles(mask: Uint8Array, rel: Float32Array, light: Uint8Array | Float32Array, w: number, h: number): Uint8Array {
  const open = mask.map((v) => (v ? 0 : 1));
  const { labels, blobs } = label(open, w, h);
  const inner = erode(open, w, h, EDGE_PX);
  const out = Uint8Array.from(mask);
  for (const b of blobs) {
    const [x0, y0, x1, y1] = b.box;
    if (x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1) continue; // fundo em volta das ferramentas
    if (isRealHole(b.id, b.area, b.box)) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (labels[y * w + x] === b.id) out[y * w + x] = 1;
  }
  return out;

  function isRealHole(id: number, area: number, [x0, y0, x1, y1]: [number, number, number, number]): boolean {
    if (area < MIN_HOLE_MM2 * PX_PER_MM ** 2) return false;
    const pts: Pt[] = [];
    const values: number[] = [];
    let glare = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (labels[i] !== id) continue;
        pts.push([x, y]);
        if (!inner[i]) continue;
        values.push(rel[i]);
        if (rel[i] > GLARE_REL || (light[i] >= CLIPPED && rel[i] > CLIPPED_REL)) glare++;
      }
    if (rectSize(pts).width < MIN_HOLE_SIDE_MM * PX_PER_MM || !values.length) return false;
    values.sort((a, c) => a - c);
    return values[Math.floor(values.length / 2)] >= PAPER_MIN && glare <= values.length * MAX_GLARE_SHARE;
  }
}
