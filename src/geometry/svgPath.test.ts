import { describe, expect, test } from "vitest";
import { flatten, mapPoints, parsePath, serializePath } from "./svgPath";

describe("parsePath", () => {
  test("normaliza comandos relativos, H/V, S/T para absolutos M/L/C/Q/Z", () => {
    const cmds = parsePath("m10,10 h5 v5 l-5,0 z M0 0 c1 1 2 2 3 3 s2 2 3 3 q1 1 2 0 t2 0");
    expect(cmds).toEqual([
      { c: "M", p: [10, 10] },
      { c: "L", p: [15, 10] },
      { c: "L", p: [15, 15] },
      { c: "L", p: [10, 15] },
      { c: "Z", p: [] },
      { c: "M", p: [0, 0] },
      { c: "C", p: [1, 1, 2, 2, 3, 3] },
      { c: "C", p: [4, 4, 5, 5, 6, 6] }, // reflexo do controle anterior
      { c: "Q", p: [7, 7, 8, 6] },
      { c: "Q", p: [9, 5, 10, 6] },
    ]);
  });

  test("M com pares extras vira L implícito e aceita números colados (1.5.5, 1e2, -3-4)", () => {
    expect(parsePath("M1.5.5 2-3-4 1e1")).toEqual([
      { c: "M", p: [1.5, 0.5] },
      { c: "L", p: [2, -3] },
      { c: "L", p: [-4, 10] },
    ]);
  });

  test("rejeita comandos desconhecidos (entrada não confiável)", () => {
    expect(() => parsePath("M0 0 X 1 2")).toThrow();
  });
});

describe("flatten", () => {
  test("quadrado vira um contorno fechado sem repetir o 1º ponto", () => {
    expect(flatten(parsePath("M0 0 L10 0 L10 10 L0 10 Z"), 1)).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    ]);
  });

  test("curva é subdividida e passa pelos extremos", () => {
    const [c] = flatten(parsePath("M0 0 C0 10 10 10 10 0 Z"), 1);
    expect(c.length).toBeGreaterThan(8);
    expect(c[0]).toEqual([0, 0]);
    expect(c.at(-1)).toEqual([10, 0]);
    const maxY = Math.max(...c.map((p) => p[1]));
    expect(maxY).toBeCloseTo(7.5, 0); // topo de uma cúbica simétrica = 3/4 da altura do controle
  });

  test("vários subcaminhos viram vários contornos; contorno degenerado é descartado", () => {
    const cs = flatten(parsePath("M0 0 L1 0 L1 1 Z M5 5 L6 5 Z M9 9 L10 9 L10 10 Z"), 1);
    expect(cs).toHaveLength(2);
  });
});

test("mapPoints + serializePath: translada e escreve com precisão fixa", () => {
  const moved = mapPoints(parsePath("M0 0 C1 1 2 2 3 3 Z"), ([x, y]) => [x + 10, y + 0.12345]);
  expect(serializePath(moved, 2)).toBe("M10 0.12C11 1.12 12 2.12 13 3.12Z");
});
