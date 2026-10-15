import type { Mesh } from "./types";

/**
 * Reparo de malha aberta (STL baixado da internet quase sempre tem um furinho): solda vértices que coincidem, tira
 * triângulos degenerados e fecha cada furo pequeno com um leque a partir do centro dele. O Manifold só aceita sólidos
 * fechados, então sem isso o corte falharia sem explicar.
 */
const WELD = 1e4; // 0,1 µm
const MAX_HOLE_EDGES = 400; // furos maiores não são reparo: a malha está faltando um pedaço
export type Repaired = { mesh: Mesh; holes: number; unfixable: number };

const key = (a: number, b: number) => a * 4294967296 + b;

/** Arestas dirigidas sem a vizinha oposta: a borda dos furos (e das costuras mal fechadas). */
function boundary(indices: Uint32Array): [number, number][] {
  const seen = new Set<number>();
  for (let t = 0; t < indices.length; t += 3) for (let e = 0; e < 3; e++) seen.add(key(indices[t + e], indices[t + ((e + 1) % 3)]));
  const out: [number, number][] = [];
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const [a, b] = [indices[t + e], indices[t + ((e + 1) % 3)]];
      if (!seen.has(key(b, a))) out.push([a, b]);
    }
  }
  return out;
}

export const openEdges = (m: Mesh) => boundary(m.indices).length;

export function repairMesh(m: Mesh): Repaired {
  const ids = new Map<string, number>();
  const pos: number[] = [];
  const remap = new Int32Array(m.positions.length / 3);
  for (let v = 0; v < remap.length; v++) {
    const k = `${Math.round(m.positions[3 * v] * WELD)}|${Math.round(m.positions[3 * v + 1] * WELD)}|${Math.round(m.positions[3 * v + 2] * WELD)}`;
    let id = ids.get(k);
    if (id === undefined) {
      id = pos.length / 3;
      ids.set(k, id);
      pos.push(m.positions[3 * v], m.positions[3 * v + 1], m.positions[3 * v + 2]);
    }
    remap[v] = id;
  }
  const idx: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [remap[m.indices[t]], remap[m.indices[t + 1]], remap[m.indices[t + 2]]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  let holes = 0;
  let unfixable = 0;
  const edges = boundary(Uint32Array.from(idx));
  const from = new Map<number, number[]>();
  for (const [a, b] of edges) from.set(a, [...(from.get(a) ?? []), b]);
  const used = new Set<number>();
  for (const [a0, b0] of edges) {
    if (used.has(key(a0, b0))) continue;
    const loop: number[] = [a0];
    let [a, b] = [a0, b0];
    let closed = false;
    while (loop.length <= MAX_HOLE_EDGES) {
      used.add(key(a, b));
      if (b === a0) {
        closed = true;
        break;
      }
      loop.push(b);
      const next = (from.get(b) ?? []).find((n) => !used.has(key(b, n)));
      if (next === undefined) break;
      [a, b] = [b, next];
    }
    if (!closed || loop.length < 3) {
      unfixable++;
      continue;
    }
    const c = pos.length / 3;
    pos.push(loop.reduce((s, v) => s + pos[3 * v], 0) / loop.length, loop.reduce((s, v) => s + pos[3 * v + 1], 0) / loop.length, loop.reduce((s, v) => s + pos[3 * v + 2], 0) / loop.length);
    for (let i = 0; i < loop.length; i++) idx.push(loop[(i + 1) % loop.length], loop[i], c); // oposta à borda: fecha o furo
    holes++;
  }
  return { mesh: { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) }, holes, unfixable };
}
