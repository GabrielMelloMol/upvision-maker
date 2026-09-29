import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";
import { arcTextToCrossSection, hasEmoji, textToCrossSection } from "./text";
import { checkText } from "./textCheck";

let M: ManifoldToplevel;
const load = (path: string) => {
  const b = readFileSync(resolve(__dirname, "../..", path));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const main = () => load("src/assets/fonts/pacifico-400.ttf");
const emoji = () => load("src/assets/fonts/noto-emoji-700.ttf");
beforeAll(async () => {
  M = await getManifold();
});

test("hasEmoji reconhece emoji e ignora letras e números", () => {
  expect(hasEmoji("Ana ❤️")).toBe(true);
  expect(hasEmoji("Bia 🐶")).toBe(true);
  expect(hasEmoji("Caio 123 #")).toBe(false);
});

test("emoji sai da fonte reserva quando a principal não tem: o texto fica mais largo", () =>
  scoped((k) => {
    const f = main(), e = emoji();
    const plain = k(textToCrossSection(M, f, "Ana", 12, e));
    const withEmoji = k(textToCrossSection(M, f, "Ana 🐶", 12, e));
    const w = (cs: typeof plain) => cs.bounds().max[0] - cs.bounds().min[0];
    expect(w(withEmoji)).toBeGreaterThan(w(plain) + 5);
    expect(withEmoji.area()).toBeGreaterThan(plain.area() * 1.3);
  }));

test("seletor de variação (U+FE0F) e ZWJ não desenham nada", () =>
  scoped((k) => {
    const f = main(), e = emoji();
    const a = k(textToCrossSection(M, f, "❤", 12, e));
    const b = k(textToCrossSection(M, f, "❤️", 12, e));
    expect(b.area()).toBeCloseTo(a.area(), 3);
    expect(a.area()).toBeGreaterThan(40);
  }));

test("emoji também no texto em arco", () =>
  scoped((k) => {
    const f = main(), e = emoji();
    const plain = k(arcTextToCrossSection(M, f, "Ana", 6, 30, "top", e));
    const star = k(arcTextToCrossSection(M, f, "Ana ⭐", 6, 30, "top", e));
    expect(star.decompose().map(k).length).toBe(plain.decompose().map(k).length + 1);
  }));

test("checkText avisa traço fino em emoji pequeno", () =>
  scoped((k) => {
    const small = k(textToCrossSection(M, main(), "🐶", 5, emoji()));
    expect(checkText(small).thin).toBe(true);
  }));
