import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";
import { textToCrossSection } from "./text";

let M: ManifoldToplevel;
const font = (file: string) => {
  const b = readFileSync(resolve(__dirname, "../../node_modules/@fontsource", file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
beforeAll(async () => {
  M = await getManifold();
});

test("texto vira região com a altura pedida em mm, Y para cima, centrada", () =>
  scoped((k) => {
    const cs = k(textToCrossSection(M, font("hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff"), "Ana", 12));
    const b = cs.bounds();
    expect(b.max[1] - b.min[1]).toBeCloseTo(12, 1);
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 5);
    expect(cs.area()).toBeGreaterThan(30);
  }));

test("fonte cursiva: letras que se tocam viram uma peça só (união), sem buracos falsos", () =>
  scoped((k) => {
    const cs = k(textToCrossSection(M, font("pacifico/files/pacifico-latin-400-normal.woff"), "lulu", 15));
    expect(cs.decompose().map(k).length).toBeLessThanOrEqual(2);
  }));

test("acentos do português funcionam", () =>
  scoped((k) => {
    const f = font("hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff");
    const plain = k(textToCrossSection(M, f, "Joao", 10));
    const accented = k(textToCrossSection(M, f, "João", 10));
    expect(accented.area()).not.toBeCloseTo(plain.area(), 0);
  }));

test("texto vazio dá erro amigável", () => {
  expect(() => textToCrossSection(M, font("pacifico/files/pacifico-latin-400-normal.woff"), "   ", 10)).toThrow(/digite/i);
});
