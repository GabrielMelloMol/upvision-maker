import { describe, expect, test } from "vitest";
import { DIE_KINDS, dieShape, dieVertices, dot, faceFrame, faceNumbers, FACE_COUNT, polyFaces, type DieKind } from "./diceFaces";

const VERTS_PER_FACE: Record<DieKind, number> = { d4: 3, d6: 4, d8: 3, d10: 4, d12: 5, d20: 3 };

describe("dados de RPG: sólidos achados pelo casco (#105)", () => {
  test.each(DIE_KINDS)("%s tem o número certo de faces, todas planas e do mesmo tipo", (kind) => {
    const faces = polyFaces(dieVertices(kind));
    expect(faces).toHaveLength(FACE_COUNT[kind]);
    for (const f of faces) {
      expect(f.verts).toHaveLength(VERTS_PER_FACE[kind]); // no d10 são pipas de 4 pontos coplanares
      for (const v of f.verts) expect(dot(f.n, v)).toBeCloseTo(f.d, 6);
    }
    // todas as faces iguais (sólido regular ou trapezoedro): mesma área e mesma distância ao centro
    expect(Math.max(...faces.map((f) => f.area)) - Math.min(...faces.map((f) => f.area))).toBeLessThan(1e-6);
    expect(Math.max(...faces.map((f) => f.d)) - Math.min(...faces.map((f) => f.d))).toBeLessThan(1e-6);
  });

  test.each(DIE_KINDS)("%s: apoiado numa face (a de baixo é plana na mesa) e com a altura pedida", (kind) => {
    const { points, faces, bottom } = dieShape(kind, 20);
    const zs = points.map((p) => p[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(20, 6);
    const down = faces[faces.length - 1];
    expect(down.n[2]).toBeCloseTo(-1, 6); // a última da ordem de leitura é a de baixo
    expect(down.verts.every((v) => Math.abs(v[2] + bottom) < 1e-6)).toBe(true);
    expect(-Math.min(...zs)).toBeCloseTo(bottom, 6);
  });

  test("a ordem de leitura vai de cima para baixo", () => {
    const { faces } = dieShape("d20", 20);
    for (let i = 1; i < faces.length; i++) expect(faces[i].n[2]).toBeLessThanOrEqual(faces[i - 1].n[2] + 1e-9);
    expect(faces[0].n[2]).toBeCloseTo(1, 6); // o d20 apoiado numa face tem outra face voltada para cima
  });

  test.each(["d6", "d8", "d10", "d12", "d20"] as const)("%s: faces opostas somam a soma certa (1 + n, ou 0 + 9 no d10)", (kind) => {
    const n = FACE_COUNT[kind];
    const first = kind === "d10" ? 0 : 1;
    const { faces } = dieShape(kind, 20);
    const nums = faceNumbers(faces, first);
    expect([...nums].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => first + i));
    faces.forEach((f, i) => {
      const o = faces.findIndex((g) => dot(f.n, g.n) < -0.9999);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(nums[i] + nums[o]).toBe(2 * first + n - 1);
    });
  });

  test("d4: 4 números, sem faces opostas", () => {
    const { faces } = dieShape("d4", 20);
    expect(faceNumbers(faces, 1)).toEqual([1, 2, 3, 4]);
    expect(faces.every((f, i) => faces.every((g, j) => i === j || dot(f.n, g.n) > -0.9999))).toBe(true);
  });

  test("centro do conteúdo: dentro da face e com o raio do círculo que cabe (d6 = metade do lado; d20 = raio inscrito do triângulo)", () => {
    const d6 = faceFrame(dieShape("d6", 20).faces[0]);
    expect(d6.radius).toBeCloseTo(10, 3);
    expect(Math.hypot(...d6.pole)).toBeLessThan(0.01);
    const d20 = dieShape("d20", 20);
    const edge = 20 / 1.5115; // aresta do icosaedro com 20 mm entre faces
    const tri = faceFrame(d20.faces[0]);
    expect(tri.radius).toBeCloseTo(edge / (2 * Math.sqrt(3)), 1);
    // o d10 (pipa): o círculo fica no eixo de simetria e é menor que o raio até o canto
    const kite = faceFrame(dieShape("d10", 20).faces[0]);
    expect(kite.radius).toBeGreaterThan(1);
    const f = dieShape("d10", 20).faces[0];
    const poly = f.verts.map((v) => [dot(v, kite.ex), dot(v, kite.ey)]);
    expect(Math.min(...poly.map((p) => p[1])) - 1e-6).toBeLessThanOrEqual(kite.pole[1]);
    expect(Math.max(...poly.map((p) => p[1])) + 1e-6).toBeGreaterThanOrEqual(kite.pole[1]);
  });

  test("eixos da face: x × y = para fora, e o 'em cima' é o alto do dado", () => {
    for (const f of dieShape("d12", 20).faces) {
      const fr = faceFrame(f);
      const x = [fr.ex[0], fr.ex[1], fr.ex[2]] as const;
      const y = fr.ey;
      const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
      expect(z[0]).toBeCloseTo(fr.n[0], 6);
      expect(z[1]).toBeCloseTo(fr.n[1], 6);
      expect(z[2]).toBeCloseTo(fr.n[2], 6);
      if (Math.abs(f.n[2]) < 0.99) expect(fr.ey[2]).toBeGreaterThan(0);
    }
  });
});
