import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { openEdges, repairMesh } from "./meshRepair";
import { volume } from "./testUtil";
import type { Mesh } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const cube = () => toMesh(M.Manifold.cube([10, 10, 10]));
const without = (m: Mesh, tris: number[]): Mesh => {
  const keep: number[] = [];
  for (let t = 0; t < m.indices.length / 3; t++) if (!tris.includes(t)) keep.push(m.indices[3 * t], m.indices[3 * t + 1], m.indices[3 * t + 2]);
  return { positions: m.positions, indices: Uint32Array.from(keep) };
};
const accepts = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices })).status() === "NoError";

describe("reparo de malha aberta", () => {
  test("malha fechada passa sem mudar", () => {
    const r = repairMesh(cube());
    expect(r.holes).toBe(0);
    expect(openEdges(r.mesh)).toBe(0);
    expect(volume(r.mesh)).toBeCloseTo(1000, 3);
  });

  test("um triângulo faltando: o furo é fechado e o volume fica quase igual", () => {
    const broken = without(cube(), [3]);
    expect(openEdges(broken)).toBeGreaterThan(0);
    const r = repairMesh(broken);
    expect(r.holes).toBe(1);
    expect(openEdges(r.mesh)).toBe(0);
    expect(accepts(r.mesh)).toBe(true);
    expect(Math.abs(volume(r.mesh) - 1000)).toBeLessThan(60);
  });

  test("uma face inteira faltando (2 triângulos) também fecha", () => {
    const m = cube();
    // a face de baixo (z = 0) são os triângulos cujos 3 vértices têm z = 0
    const bottom: number[] = [];
    for (let t = 0; t < m.indices.length / 3; t++) if ([0, 1, 2].every((k) => m.positions[m.indices[3 * t + k] * 3 + 2] === 0)) bottom.push(t);
    const r = repairMesh(without(m, bottom));
    expect(r.holes).toBe(1);
    expect(accepts(r.mesh)).toBe(true);
  });

  test("vértices duplicados (STL não soldado) são soldados", () => {
    const m = cube();
    const split = { positions: new Float32Array(m.indices.length * 3), indices: Uint32Array.from({ length: m.indices.length }, (_, i) => i) };
    for (let i = 0; i < m.indices.length; i++) split.positions.set(m.positions.subarray(m.indices[i] * 3, m.indices[i] * 3 + 3), i * 3);
    expect(openEdges(split)).toBeGreaterThan(0);
    const r = repairMesh(split);
    expect(r.holes).toBe(0);
    expect(accepts(r.mesh)).toBe(true);
  });
});
