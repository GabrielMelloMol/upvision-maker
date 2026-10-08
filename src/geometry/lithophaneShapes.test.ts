import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { cylinderMesh, fitAspect, loopSeam } from "./lithophaneShapes";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { volume } from "./testUtil";
import type { Mesh } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("litofania em cilindro (#101)", { timeout: 30_000 }, () => {
  const COLS = 120, ROWS = 40, R = 40, CELL = (2 * Math.PI * R) / COLS;

  test("tubo fechado de uma peça só, sem face duplicada na emenda, em pé na mesa", () => {
    const t = new Float32Array(COLS * ROWS).fill(2);
    const m = cylinderMesh(t, COLS, ROWS, CELL, R);
    const s = solid(m);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    expect(s.genus()).toBe(1); // um anel: furo no meio, aberto em cima e embaixo
    const b = meshBounds([m])!;
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.max[2]).toBeCloseTo((ROWS - 1) * CELL, 3);
    expect(b.max[0] - b.min[0]).toBeCloseTo(2 * R, 1); // diâmetro externo
    expect(Math.abs((b.max[0] + b.min[0]) / 2)).toBeLessThan(0.2); // centrado no eixo
  });

  test("relevo para dentro: o lado de fora é liso (raio constante) e o de dentro varia com a espessura", () => {
    const t = Float32Array.from({ length: COLS * ROWS }, (_, i) => 1 + ((i % COLS) / COLS) * 2); // 1 a 3 mm
    const m = cylinderMesh(t, COLS, ROWS, CELL, R);
    const radii = new Set<number>();
    let rMin = Infinity;
    for (let i = 0; i < m.positions.length; i += 3) {
      const r = Math.hypot(m.positions[i], m.positions[i + 1]);
      rMin = Math.min(rMin, r);
      if (r > R - 0.01) radii.add(Math.round(r * 100));
    }
    expect([...radii]).toEqual([R * 100]); // tudo o que está no raio externo está exatamente nele
    expect(rMin).toBeCloseTo(R - 3, 1); // a parte mais grossa entra 3 mm
  });

  test("volume = área da parede × espessura média", () => {
    const t = new Float32Array(COLS * ROWS).fill(2);
    const m = cylinderMesh(t, COLS, ROWS, CELL, R);
    const H = (ROWS - 1) * CELL;
    // polígono inscrito: o volume do anel de COLS lados é um pouco menor que o do círculo
    const exact = Math.PI * (R * R - (R - 2) * (R - 2)) * H;
    expect(volume(m)).toBeGreaterThan(exact * 0.995);
    expect(volume(m)).toBeLessThan(exact);
  });
});

describe("emenda sem salto e corte da foto na proporção da peça (#101)", () => {
  test("a emenda mistura o fim com o começo: o último ponto é vizinho do primeiro", () => {
    const cols = 20, rows = 2;
    const ramp = Float32Array.from({ length: cols * rows }, (_, i) => (i % cols) / (cols - 1)); // 0 → 1
    const out = loopSeam(ramp, cols, rows, 4);
    expect(out.cols).toBe(16);
    const first = out.luma[0], last = out.luma[out.cols - 1];
    expect(Math.abs(first - last)).toBeLessThan(0.1); // sem o degrau de 1,0 da rampa
    expect(out.luma[8]).toBeCloseTo(ramp[8], 6); // o miolo não muda
  });

  test("recorte central na proporção pedida, sem esticar", () => {
    const w = 100, h = 50;
    const g = Float32Array.from({ length: w * h }, (_, i) => (i % w) / w);
    const wide = fitAspect(g, w, h, 4); // mais larga que a foto: corta em cima e embaixo
    expect(wide.w / wide.h).toBeCloseTo(4, 0);
    expect(wide.w).toBe(100);
    const tall = fitAspect(g, w, h, 0.5); // mais alta: corta dos lados
    expect(tall.w / tall.h).toBeCloseTo(0.5, 1);
    expect(tall.h).toBe(50);
    expect(tall.luma[0]).toBeGreaterThan(0.3); // pegou o miolo, não a borda esquerda
  });
});
