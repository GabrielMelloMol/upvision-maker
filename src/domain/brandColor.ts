/** Cor da marca nos PDFs (#296): sugestão a partir do logo e contraste garantido sobre o papel branco. */

export const BRAND_DEFAULT = "#2563EB";
/** WCAG AA para texto normal: o título e o preço continuam legíveis impressos ou na tela. */
const MIN_CONTRAST = 4.5;

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

function luminance(c: number[]) {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste da cor com o branco (1 a 21). */
export const contrastOnWhite = (hex: string) => 1.05 / (luminance(rgbOf(hex)) + 0.05);

/** A mesma cor, escurecida só o necessário para ler sobre o branco. Vazia ou inválida → a cor padrão. */
export function readableOnWhite(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return BRAND_DEFAULT;
  let c = rgbOf(hex);
  for (let i = 0; i < 40 && contrastOnWhite(toHex(c)) < MIN_CONTRAST; i++) c = c.map((v) => v * 0.93);
  return toHex(c);
}

/**
 * Cor mais presente do logo (pixels RGBA), ignorando transparente, quase branco, quase preto e cinza:
 * é a que dá identidade. Logo só preto e branco → null (fica a padrão).
 */
export function suggestBrandColor(rgba: ArrayLike<number>): string | null {
  const count = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (a < 128 || max < 40 || min > 225 || max - min < 40) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); // 16 tons por canal: junta o antisserrilhado da borda
    const e = count.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    count.set(key, { n: e.n + 1, r: e.r + r, g: e.g + g, b: e.b + b });
  }
  let best: { n: number; r: number; g: number; b: number } | undefined;
  for (const e of count.values()) if (!best || e.n > best.n) best = e;
  return best ? toHex([best.r / best.n, best.g / best.n, best.b / best.n]) : null;
}
