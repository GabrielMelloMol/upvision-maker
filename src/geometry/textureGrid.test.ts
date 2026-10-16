import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { GRID, imageGrid, rasterize, textGrid } from "./textureGrid";

let M: ManifoldToplevel;
let font: opentype.Font;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync("node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff");
  font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
});

describe("texturas de frase e de imagem (#222)", () => {
  test("rasterizar um quadrado cobre a área certa e respeita o furo (par-ímpar)", () => {
    const outer: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const hole: [number, number][] = [[3, 3], [7, 3], [7, 7], [3, 7]];
    const g = rasterize([outer, hole], { x0: 0, y0: 0, x1: 10, y1: 10 }, 20, 20);
    expect(g.reduce((s, v) => s + v, 0)).toBeCloseTo(400 - 64, 0);
  });

  test("a frase vira um ladrilho quadrado com tinta só no miolo, com borda suave", () => {
    const g = textGrid(M, font, "Maria");
    expect(g).toHaveLength(GRID * GRID);
    const ink = g.reduce((s, v) => s + (v > 0.5 ? 1 : 0), 0) / g.length;
    expect(ink).toBeGreaterThan(0.03);
    expect(ink).toBeLessThan(0.4);
    expect(g.some((v) => v > 0.05 && v < 0.95)).toBe(true); // borda suavizada
    // folga: a primeira e a última coluna não têm tinta
    expect(Array.from({ length: GRID }, (_, j) => g[j * GRID]).every((v) => v === 0)).toBe(true);
  });

  test("imagem: recorta o centro e inverte quando pedido", () => {
    const w = 40, h = 20;
    const luma = new Float32Array(w * h).map((_, i) => (i % w < 20 ? 0 : 1)); // metade esquerda escura
    const g = imageGrid(luma, w, h, false);
    expect(g[0]).toBe(0);
    expect(imageGrid(luma, w, h, true)[0]).toBe(1);
    // o corte quadrado de 20 × 20 pega o centro (x de 10 a 30): metade escura, metade clara
    expect(g.reduce((s, v) => s + v, 0)).toBeCloseTo((GRID * GRID) / 2, -2);
  });
});
