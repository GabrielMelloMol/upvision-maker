import { expect, test } from "vitest";
import { AlphabetSchema, myLines, simplify, type Alphabet } from "./handwriting";
import { hersheyLines } from "./hershey";

const I1: [number, number][][] = [[[50, 20], [50, 70]]];
const I2: [number, number][][] = [[[40, 20], [60, 70]]];
const xs = (l: { pts: [number, number][] }[]) => l.flatMap((s) => s.pts.map((p) => p[0]));

test("usa a letra desenhada (na escala da cursiva) e a cursiva onde falta", () => {
  const a: Alphabet = { I: [I1] };
  const [stroke] = myLines("I", a, 0);
  expect(stroke.pts.map(([, y]) => Math.round(y))).toEqual([12, -9]); // topo da maiúscula e base, como a cursiva
  const mixed = myLines("Ib", a, 0);
  expect(mixed.length).toBe(1 + hersheyLines("b").length);
  expect(Math.min(...xs(mixed.slice(1)))).toBeGreaterThan(Math.max(...xs(mixed.slice(0, 1)))); // "b" depois do "I"
});

test("letras repetidas sorteiam entre as versões, sempre do mesmo jeito; variação 0 deixa tudo na linha", () => {
  const a: Alphabet = { I: [I1, I2] };
  const out = myLines("IIIIIIII", a, 0);
  const slanted = out.filter((s) => s.pts[0][0] !== s.pts[1][0]).length;
  expect(slanted).toBeGreaterThan(0);
  expect(slanted).toBeLessThan(8);
  expect(myLines("IIIIIIII", a, 0)).toEqual(out);
  expect(new Set(out.map((s) => Math.round(Math.min(...s.pts.map((p) => p[1])) * 100))).size).toBe(1);
  expect(new Set(myLines("IIIIIIII", a, 1).map((s) => Math.round(Math.min(...s.pts.map((p) => p[1])) * 100))).size).toBeGreaterThan(1);
});

test("espaço e linhas novas; tira pontos colados mas guarda o fim", () => {
  const two = myLines("I\nI", { I: [I1] }, 0);
  expect(Math.max(...two[1].pts.map((p) => p[1]))).toBeLessThan(Math.min(...two[0].pts.map((p) => p[1])));
  expect(simplify([[0, 0], [0.1, 0], [0.2, 0], [5, 5], [5.1, 5]])).toEqual([[0, 0], [5, 5], [5.1, 5]]);
});

test("alfabeto guardado é conferido", () => {
  expect(AlphabetSchema.safeParse({ a: [I1] }).success).toBe(true);
  expect(AlphabetSchema.safeParse({ a: [[[[500, 1], [2, 2]]]] }).success).toBe(false);
  expect(AlphabetSchema.safeParse({ a: [I1, I1, I1, I1] }).success).toBe(false);
});
