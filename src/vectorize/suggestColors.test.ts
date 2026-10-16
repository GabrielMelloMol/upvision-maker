import { expect, test } from "vitest";
import { suggestColors } from "./suggestColors";

/** Imagem w×h: `paint(x, y)` devolve [r, g, b, a]. */
const image = (w: number, h: number, paint: (x: number, y: number) => number[]) => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set(paint(x, y), (y * w + x) * 4);
  return a;
};

test("gato preto e branco: base clara e relevo escuro", () => {
  const rgba = image(40, 40, (x) => (x < 12 ? [10, 10, 10, 255] : [250, 250, 250, 255]));
  const c = suggestColors(rgba, 40, 40, null)!;
  expect(c.base).toBe("#fafafa");
  expect(c.relief).toBe("#0a0a0a");
});

test("o fundo fora do objeto não conta", () => {
  const rgba = image(40, 40, (x) => (x < 20 ? [200, 120, 20, 255] : [255, 255, 255, 255]));
  const object = new Uint8Array(40 * 40).map((_, i) => (i % 40 < 20 ? 1 : 0));
  const c = suggestColors(rgba, 40, 40, object)!;
  expect(c.base).toBe("#c87814"); // só laranja
});

test("uma cor só (sem contraste): relevo preto sobre base clara, branco sobre base escura", () => {
  const light = image(30, 30, () => [240, 200, 60, 255]);
  expect(suggestColors(light, 30, 30, null)!.relief).toBe("#1c1c1e");
  const dark = image(30, 30, () => [20, 30, 90, 255]);
  expect(suggestColors(dark, 30, 30, null)!.relief).toBe("#ffffff");
});

test("transparente ou pequena demais: sem sugestão", () => {
  expect(suggestColors(new Uint8ClampedArray(30 * 30 * 4), 30, 30, null)).toBeNull();
});
