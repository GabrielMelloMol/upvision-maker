import { describe, expect, test } from "vitest";
import { boxBlur, closeMask, fillHoles, largestComponent, removeSmall, smoothMask, thicken } from "./cleanup";

const W = 10;
const H = 10;
function grid(cells: [number, number][]): Uint8Array {
  const m = new Uint8Array(W * H);
  for (const [x, y] of cells) m[y * W + x] = 1;
  return m;
}
function rect(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}
const sum = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);

test("boxBlur suaviza sem mudar a média de uma região constante", () => {
  const l = new Uint8Array(W * H).fill(100);
  l[55] = 200;
  const b = boxBlur(l, W, H, 1);
  expect(b[0]).toBe(100);
  expect(b[55]).toBeLessThan(200);
  expect(b[55]).toBeGreaterThan(100);
});

test("closeMask fecha furinho de 1 px", () => {
  const m = grid(rect(2, 2, 7, 7));
  m[4 * W + 4] = 0;
  expect(closeMask(m, W, H, 1)[4 * W + 4]).toBe(1);
});

describe("removeSmall", () => {
  test("apaga ilhas menores que o mínimo e fecha furos pequenos", () => {
    const m = grid([...rect(1, 1, 6, 6), [9, 9]]); // quadrado 36 px + ponto solto
    m[3 * W + 3] = 0; // furo de 1 px
    const r = removeSmall(m, W, H, 4);
    expect(r[9 * W + 9]).toBe(0);
    expect(r[3 * W + 3]).toBe(1);
    expect(sum(r)).toBe(36);
  });
  test("mantém furo grande (miolo do O)", () => {
    const m = grid(rect(0, 0, 9, 9));
    for (const [x, y] of rect(3, 3, 6, 6)) m[y * W + x] = 0;
    expect(sum(removeSmall(m, W, H, 4))).toBe(100 - 16);
  });
});

test("largestComponent fica só com o maior pedaço", () => {
  const m = grid([...rect(0, 0, 4, 4), ...rect(7, 7, 8, 8)]);
  expect(sum(largestComponent(m, W, H))).toBe(25);
});

test("fillHoles preenche buracos internos mas não o fundo externo", () => {
  const m = grid(rect(1, 1, 8, 8));
  for (const [x, y] of rect(3, 3, 5, 5)) m[y * W + x] = 0;
  const f = fillHoles(m, W, H);
  expect(sum(f)).toBe(64);
  expect(f[0]).toBe(0);
});

test("smoothMask arredonda quina e remove ponta de 1 px", () => {
  const m = grid([...rect(2, 2, 7, 7), [8, 4]]);
  const s = smoothMask(m, W, H, 1);
  expect(s[4 * W + 8]).toBe(0);
  expect(s[4 * W + 4]).toBe(1);
});

test("thicken engrossa só onde o traço é fino", () => {
  const thin = grid([[5, 5]]);
  const m = grid([[5, 5]]);
  const t = thicken(m, thin, W, H, 1);
  expect(sum(t)).toBe(9);
});
