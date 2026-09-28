import { describe, expect, test } from "vitest";
import { binarize, floodBackground, luminance, openMask, otsu, scaleFactor, thinPixels } from "./raster";

/** Monta RGBA a partir de uma grade de níveis de cinza (alfa 255). */
function gray(rows: number[][]): { data: Uint8ClampedArray; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  rows.flat().forEach((v, i) => data.set([v, v, v, 255], i * 4));
  return { data, w, h };
}

describe("scaleFactor", () => {
  test("amplia imagem pequena até ~1200 px, no máximo 4×", () => {
    expect(scaleFactor(300, 200)).toBe(4);
    expect(scaleFactor(600, 600)).toBe(2);
  });
  test("não amplia imagem grande e respeita teto de 4096 px e 6 Mpx", () => {
    expect(scaleFactor(2000, 1000)).toBe(1);
    expect(scaleFactor(8192, 100)).toBe(0.5);
    expect(scaleFactor(4000, 4000)).toBeCloseTo(Math.sqrt(6e6 / 16e6));
  });
});

describe("luminance", () => {
  test("BT.709 e pixel transparente vira branco (fundo)", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128]);
    const l = luminance(data);
    expect(l[0]).toBe(Math.round(0.2126 * 255));
    expect(l[1]).toBe(255); // alfa < 16
    expect(l[2]).toBe(127); // preto meio transparente sobre branco
  });
});

test("otsu separa duas populações", () => {
  const l = new Uint8Array([...Array(50).fill(20), ...Array(50).fill(230)]);
  const t = otsu(l);
  expect(t).toBeGreaterThan(20);
  expect(t).toBeLessThanOrEqual(230);
});

test("binarize: escuro é forma; invertido pega o claro", () => {
  const l = new Uint8Array([10, 200, 100]);
  expect([...binarize(l, 128, false)]).toEqual([1, 0, 1]);
  expect([...binarize(l, 128, true)]).toEqual([0, 1, 0]);
});

describe("floodBackground", () => {
  test("remove o fundo ligado à borda e preserva o miolo claro cercado pela forma", () => {
    const { data, w, h } = gray([
      [240, 240, 240, 240, 240],
      [240, 0, 0, 0, 240],
      [240, 0, 240, 0, 240],
      [240, 0, 0, 0, 240],
      [240, 240, 240, 240, 240],
    ]);
    const bg = floodBackground(data, w, h)!;
    expect(bg[0]).toBe(1);
    expect(bg[2 * w + 2]).toBe(0); // miolo não é alcançado pela inundação
    expect(bg[1 * w + 1]).toBe(0);
  });

  test("não remove nada se a borda não tem cor dominante", () => {
    const { data, w, h } = gray([
      [0, 80, 160, 240],
      [240, 0, 80, 160],
      [160, 240, 0, 80],
    ]);
    expect(floodBackground(data, w, h)).toBeNull();
  });
});

describe("traço fino", () => {
  const w = 12;
  const h = 7;
  // barra grossa (5 px) à esquerda e linha fina (1 px) à direita
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) mask[y * w + x] = 1;
  for (let y = 1; y < 6; y++) mask[y * w + 9] = 1;

  test("abertura remove a linha de 1 px e mantém a barra", () => {
    const o = openMask(mask, w, h, 1);
    expect(o[3 * w + 3]).toBe(1);
    expect(o[3 * w + 9]).toBe(0);
  });

  test("thinPixels marca só o que some na abertura", () => {
    const { count, thin } = thinPixels(mask, w, h, 1);
    expect(count).toBe(5);
    expect(thin[3 * w + 9]).toBe(1);
    expect(thin[3 * w + 3]).toBe(0);
  });
});
