import { describe, expect, test } from "vitest";
import { decodePaint, encodePaint, type PaintNode, type Vec3 } from "./paint";

const T: [Vec3, Vec3, Vec3] = [
  [0, 0, 0],
  [4, 0, 0],
  [0, 4, 0],
];
const area = ([a, b, c]: [Vec3, Vec3, Vec3]) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;

describe("pintura por triângulo (paint_color do Bambu / mmu_segmentation do Prusa)", () => {
  test("triângulo inteiro de uma cor: '4' = filamento 1, '8' = filamento 2, 'C' + extra para 3 em diante", () => {
    expect(decodePaint("4", T)).toEqual([{ tri: T, state: 1 }]);
    expect(decodePaint("8", T)[0].state).toBe(2);
    expect(decodePaint("0C", T)[0].state).toBe(3); // nibbles lidos de trás para frente: C, 0 → 0 + 3
    expect(decodePaint("2C", T)[0].state).toBe(5);
    expect(decodePaint("0FC", T)[0].state).toBe(18); // 15 + 0 + 3
  });

  test("ida e volta: codificar e decodificar dá a mesma árvore, as folhas cobrem o triângulo", () => {
    const trees: PaintNode[] = [
      { state: 7 },
      { sides: 1, special: 2, children: [{ state: 1 }, { state: 2 }] },
      { sides: 2, special: 1, children: [{ state: 0 }, { state: 3 }, { state: 2 }] },
      { sides: 3, special: 0, children: [{ state: 1 }, { sides: 1, special: 0, children: [{ state: 2 }, { state: 20 }] }, { state: 1 }, { state: 4 }] },
    ];
    for (const t of trees) {
      const leaves = decodePaint(encodePaint(t), T);
      expect(leaves.reduce((s, l) => s + area(l.tri), 0)).toBeCloseTo(area(T), 9);
      const states = (n: PaintNode): number[] => ("state" in n ? [n.state] : n.children.flatMap(states));
      expect(leaves.map((l) => l.state)).toEqual(states(t));
    }
  });

  test("geometria da divisão igual à do Bambu: 1 lado divide a aresta oposta ao vértice especial", () => {
    // special 0: vértices girados [a, b, c] = [T0, T1, T2]; ponto médio de b–c; filhos (a, b, m) e (m, c, a)
    const leaves = decodePaint(encodePaint({ sides: 1, special: 0, children: [{ state: 1 }, { state: 2 }] }), T);
    expect(leaves[0].tri).toEqual([T[0], T[1], [2, 2, 0]]);
    expect(leaves[1].tri).toEqual([[2, 2, 0], T[2], T[0]]);
  });

  test("3 lados: 4 filhos com os pontos médios, o do meio por último", () => {
    const leaves = decodePaint(encodePaint({ sides: 3, special: 0, children: [{ state: 1 }, { state: 2 }, { state: 3 }, { state: 4 }] }), T);
    expect(leaves.map((l) => l.tri)).toEqual([
      [T[0], [2, 0, 0], [0, 2, 0]],
      [[2, 0, 0], T[1], [2, 2, 0]],
      [[2, 2, 0], T[2], [0, 2, 0]],
      [[2, 0, 0], [2, 2, 0], [0, 2, 0]],
    ]);
  });

  test("sem pintura ou string inválida: triângulo inteiro sem cor (estado 0) e sem travar", () => {
    expect(decodePaint("", T)).toEqual([{ tri: T, state: 0 }]);
    expect(decodePaint("3", T)).toEqual([{ tri: T, state: 0 }]); // divisão sem filhos (truncado)
    expect(decodePaint("XYZ", T)).toEqual([{ tri: T, state: 0 }]);
  });
});
