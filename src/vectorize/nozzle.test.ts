import { describe, expect, test } from "vitest";
import { DEFAULT_TRACE, prepare } from "./pipeline";

/** Imagem branca de 100 × 40 px com uma linha preta de 3 px de largura, em pé. */
function lineImage() {
  const w = 100, h = 40;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 48; x < 51; x++) rgba.set([0, 0, 0, 255], (y * w + x) * 4);
  return { rgba, w, h };
}
const thinFor = (nozzleMm?: number) => {
  const { rgba, w, h } = lineImage();
  // 100 px em 10 mm = 10 px/mm: a linha de 3 px tem 0,3 mm
  return prepare(rgba, w, h, { ...DEFAULT_TRACE, widthMm: 10, removeBg: false, cleanup: 0, minAreaMm2: 0, nozzleMm }).thinCount;
};

describe("trechos finos do vetorizador seguem o bico", () => {
  test("linha de 0,3 mm: fina para o bico 0,4 (o padrão), boa para o bico 0,2", () => {
    expect(thinFor(undefined)).toBeGreaterThan(0); // sem o campo, 0,4
    expect(thinFor(0.4)).toBeGreaterThan(0);
    expect(thinFor(0.2)).toBe(0);
  });

  test("bico mais grosso acusa mais: 0,8 acha ao menos o que o 0,4 acha", () => {
    expect(thinFor(0.8)).toBeGreaterThanOrEqual(thinFor(0.4));
  });
});
