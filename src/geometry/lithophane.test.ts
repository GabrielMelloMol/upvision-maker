import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { heightfieldMesh, lumaGrid } from "./heightfield";
import { buildLayeredPicture, DEFAULT_LAYERED } from "./layeredPicture";
import { backlitPreview, buildLithophane, DEFAULT_LITHO, lithoThickness } from "./lithophane";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { volume } from "./testUtil";
import type { Mesh } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const COLS = 40, ROWS = 30, CELL = 0.5;
/** Degradê: preto à esquerda, branco à direita. */
const ramp = Float32Array.from({ length: COLS * ROWS }, (_, i) => (i % COLS) / (COLS - 1));
const valid = (m: Mesh) => {
  const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
  expect(s.status()).toBe("NoError");
  expect(s.decompose().length).toBe(1);
  return s;
};
const b = (m: Mesh) => meshBounds([m])!;

describe("campo de alturas", () => {
  test("sólido fechado com o volume da soma das colunas", () => {
    const t = new Float32Array(COLS * ROWS).fill(2);
    const m = heightfieldMesh(t, COLS, ROWS, CELL);
    valid(m);
    expect(volume(m)).toBeCloseTo((COLS - 1) * CELL * (ROWS - 1) * CELL * 2, 3);
  });

  test("luminância: branco 1, preto 0, transparente conta como branco", () => {
    const g = lumaGrid(Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]), 3, 1);
    expect([...g].map((x) => Math.round(x * 100) / 100)).toEqual([1, 0, 1]);
  });
});

describe("litofania", () => {
  test("espessura: preto = máxima, branco = mínima, moldura cheia", () => {
    const t = lithoThickness(ramp, COLS, ROWS, CELL, { ...DEFAULT_LITHO, border: 1 });
    expect(t[5 * COLS + 2]).toBeGreaterThan(DEFAULT_LITHO.maxT - 0.2); // perto do preto
    expect(t[5 * COLS + COLS - 3]).toBeLessThan(1.2); // perto do branco
    expect(t[0]).toBe(DEFAULT_LITHO.maxT); // moldura
  });

  test("contra a luz: branco da foto fica claro, preto fica escuro, moldura escura", () => {
    const img = backlitPreview(ramp, COLS, ROWS, CELL, { ...DEFAULT_LITHO, border: 1 });
    const px = (c: number, r: number) => img[(r * COLS + c) * 4];
    expect(px(COLS - 3, 10)).toBeGreaterThan(200);
    expect(px(3, 10)).toBeLessThan(30);
    expect(px(0, 0)).toBe(0);
    expect(px(COLS / 2, 10)).toBeGreaterThan(px(5, 10)); // cresce com a luminância
  });

  test("plana: em pé (altura = foto), com pé na mesa", () => {
    const m = buildLithophane(M, ramp, COLS, ROWS, CELL, DEFAULT_LITHO).parts[0].mesh;
    valid(m);
    const bb = b(m);
    expect(bb.min[2]).toBeCloseTo(0);
    expect(bb.max[2]).toBeCloseTo((ROWS - 1) * CELL);
    expect(bb.max[0] - bb.min[0]).toBeCloseTo((COLS - 1) * CELL);
  });

  test("curva: arco em pé, fechado", () => {
    const m = buildLithophane(M, ramp, COLS, ROWS, CELL, { ...DEFAULT_LITHO, shape: "curved", arc: 90 }).parts[0].mesh;
    valid(m);
    const bb = b(m);
    expect(bb.max[1] - bb.min[1]).toBeGreaterThan(DEFAULT_LITHO.maxT * 2); // curvou
    expect(bb.min[2]).toBeCloseTo(0);
  });

  test("caixa de luz: 4 paredes numa peça só, quadrada", () => {
    const m = buildLithophane(M, ramp, COLS, ROWS, CELL, { ...DEFAULT_LITHO, shape: "box" }).parts[0].mesh;
    valid(m);
    const bb = b(m);
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(bb.max[1] - bb.min[1], 3);
  });
});

describe("quadro por camadas", () => {
  test("claro mais alto; trocas do escuro ao claro em camadas inteiras", () => {
    const { model, preview, swaps } = buildLayeredPicture(M, ramp, COLS, ROWS, CELL, { ...DEFAULT_LAYERED, colors: ["#f8f8f6", "#1c1c1e", "#8e8e93"] });
    // prévia sempre em faixas coloridas, mesmo sem AMS; o arquivo é uma peça só
    expect(preview.parts.map((p) => p.color)).toEqual(["#1c1c1e", "#8e8e93", "#f8f8f6"]);
    expect(model.parts).toHaveLength(1);
    const m = model.parts[0].mesh;
    valid(m);
    expect(model.parts[0].color).toBe("#1c1c1e"); // começa pelo mais escuro
    expect(swaps.map((s) => s.color)).toEqual(["#8e8e93", "#f8f8f6"]);
    for (const s of swaps) expect(s.z / DEFAULT_LAYERED.layerHeight).toBeCloseTo(s.layer, 6);
    expect(swaps[0].z).toBeGreaterThan(DEFAULT_LAYERED.base);
    expect(b(m).max[2]).toBeCloseTo(3, 1); // base 0,6 + relevo 2,4
  });

  test("uma parte por cor (AMS): faixas de altura empilhadas sem sobrepor, mesmo volume total", () => {
    const one = buildLayeredPicture(M, ramp, COLS, ROWS, CELL, DEFAULT_LAYERED);
    const split = buildLayeredPicture(M, ramp, COLS, ROWS, CELL, { ...DEFAULT_LAYERED, split: true });
    expect(split.model.parts).toHaveLength(3);
    const total = split.model.parts.reduce((s, p) => s + volume(p.mesh), 0);
    expect(total).toBeCloseTo(volume(one.model.parts[0].mesh), 1);
    const [p0, p1] = split.model.parts.map((p) => b(p.mesh));
    expect(p1.min[2]).toBeCloseTo(p0.max[2], 3);
  });

  test("uma cor só: erro", () => {
    expect(() => buildLayeredPicture(M, ramp, COLS, ROWS, CELL, { ...DEFAULT_LAYERED, colors: ["#000000"] })).toThrow(/2 filamentos/);
  });
});
