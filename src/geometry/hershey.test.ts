import { expect, test } from "vitest";
import { hersheyLines } from "./hershey";

const bbox = (ls: { pts: [number, number][] }[]) => {
  const all = ls.flatMap((l) => l.pts);
  return { x0: Math.min(...all.map((p) => p[0])), x1: Math.max(...all.map((p) => p[0])), y0: Math.min(...all.map((p) => p[1])), y1: Math.max(...all.map((p) => p[1])) };
};

test("traço único: linhas abertas, uma letra ao lado da outra, espaço anda sem desenhar", () => {
  const a = hersheyLines("a");
  expect(a.length).toBeGreaterThan(0);
  expect(a.every((l) => !l.closed && l.pts.length >= 2)).toBe(true);
  const aa = hersheyLines("a a");
  expect(aa.length).toBe(2 * a.length);
  expect(bbox(aa).x1 - bbox(aa).x0).toBeGreaterThan(2 * (bbox(a).x1 - bbox(a).x0));
});

test("acentos do português e ç: um traço a mais, acima (ou abaixo, na cedilha) da letra", () => {
  const e = hersheyLines("e");
  for (const ch of ["é", "ê", "è", "ë"]) {
    const acc = hersheyLines(ch);
    expect(acc.length).toBeGreaterThan(e.length);
    expect(bbox(acc).y1).toBeGreaterThan(bbox(e).y1); // acento sobe (Y para cima)
  }
  expect(hersheyLines("ã").length).toBe(hersheyLines("a").length + 1);
  const c = hersheyLines("c");
  expect(bbox(hersheyLines("ç")).y0).toBeLessThan(bbox(c).y0); // gancho embaixo
});

test("quebra de linha desce; caractere fora do ASCII vira ?", () => {
  expect(bbox(hersheyLines("a\na")).y0).toBeLessThan(bbox(hersheyLines("a")).y0 - 20);
  expect(hersheyLines("€").length).toBe(hersheyLines("?").length);
});
