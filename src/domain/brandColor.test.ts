import { expect, test } from "vitest";
import { BRAND_DEFAULT, contrastOnWhite, readableOnWhite, suggestBrandColor } from "./brandColor";

const px = (...c: number[][]) => Uint8ClampedArray.from(c.flat());

test("cor escura já legível fica igual; clara escurece até ler no branco (#296)", () => {
  expect(readableOnWhite("#1E3A8A")).toBe("#1E3A8A");
  const yellow = readableOnWhite("#FFD400");
  expect(contrastOnWhite(yellow)).toBeGreaterThanOrEqual(4.5);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(yellow.slice(i, i + 2), 16));
  expect(r).toBeGreaterThan(b); // continua amarelada, não vira cinza
  expect(g).toBeGreaterThan(b);
  expect(readableOnWhite("")).toBe(BRAND_DEFAULT);
  expect(readableOnWhite("vermelho")).toBe(BRAND_DEFAULT);
});

test("sugestão do logo: a cor mais presente, ignorando fundo, transparente e preto (#296)", () => {
  const rosa = [200, 40, 90, 255];
  const azul = [20, 60, 200, 255];
  const logo = px(...Array(10).fill([255, 255, 255, 255]), ...Array(8).fill([0, 0, 0, 0]), ...Array(6).fill([10, 10, 10, 255]), ...Array(5).fill(rosa), ...Array(3).fill(azul));
  expect(suggestBrandColor(logo)).toBe("#C8285A");
  expect(suggestBrandColor(px([255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 255]))).toBeNull();
});
