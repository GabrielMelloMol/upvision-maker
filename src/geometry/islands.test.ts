import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { splitIslands } from "./islands";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import type { Mesh } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const cube = (x: number, y: number, z: number, s = 10): Mesh => {
  const c = M.Manifold.cube([s, s, s]).translate([x, y, z]);
  const m = toMesh(c);
  c.delete();
  return m;
};
/** Junta malhas sem soldar vértices (como um 3MF com várias peças numa só). */
const merge = (...ms: Mesh[]): Mesh => {
  const positions = new Float32Array(ms.reduce((n, m) => n + m.positions.length, 0));
  const indices = new Uint32Array(ms.reduce((n, m) => n + m.indices.length, 0));
  let po = 0;
  let io = 0;
  for (const m of ms) {
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + po / 3;
    positions.set(m.positions, po);
    po += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
};

describe("pedaços conectados da malha (#118)", () => {
  test("dois cubos separados viram dois pedaços; um cubo continua um só", () => {
    expect(splitIslands(cube(0, 0, 0))).toHaveLength(1);
    const parts = splitIslands(merge(cube(0, 0, 0), cube(30, 0, 12)));
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => meshBounds([p])!.min[0]).sort((a, b) => a - b)).toEqual([0, 30]);
    for (const p of parts) expect(p.indices.length).toBe(36); // 12 triângulos cada
  });

  test("vértices repetidos na mesma posição (costura) ainda contam como o mesmo pedaço", () => {
    const a = cube(0, 0, 0);
    // metade dos triângulos usa uma cópia dos vértices: como um STL sem soldar
    const dup = { positions: new Float32Array([...a.positions, ...a.positions]), indices: new Uint32Array([...a.indices.slice(0, 18), ...Array.from(a.indices.slice(18), (i) => i + a.positions.length / 3)]) };
    expect(splitIslands(dup)).toHaveLength(1);
  });

  test("cubos que só se encostam por um vértice ou aresta continuam pedaços separados quando não dividem vértice", () => {
    expect(splitIslands(merge(cube(0, 0, 0), cube(10.5, 0, 0)))).toHaveLength(2);
  });
});
