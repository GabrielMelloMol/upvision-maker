import type { Mesh } from "./types";

/** Posições a menos de 0,1 µm contam como o mesmo ponto (costuras de malhas sem os vértices soldados). */
const KEY = 1e4;

/**
 * Pedaços conectados de uma malha (#118): triângulos que dividem um vértice (na mesma posição) ficam juntos. Serve para
 * assentar na mesa cada pedaço solto de uma peça (as letras de um cubo, por exemplo), que o fatiador não imprime
 * como um objeto só quando há camadas vazias no meio.
 */
export function splitIslands(mesh: Mesh): Mesh[] {
  const { positions, indices } = mesh;
  const n = positions.length / 3;
  const ids = new Map<string, number>();
  const node = new Int32Array(n); // vértice → nó da posição
  for (let v = 0; v < n; v++) {
    const k = `${Math.round(positions[3 * v] * KEY)}|${Math.round(positions[3 * v + 1] * KEY)}|${Math.round(positions[3 * v + 2] * KEY)}`;
    let id = ids.get(k);
    if (id === undefined) ids.set(k, (id = ids.size));
    node[v] = id;
  }
  const parent = Int32Array.from({ length: ids.size }, (_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(node[indices[t]]);
    const b = find(node[indices[t + 1]]);
    const c = find(node[indices[t + 2]]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const groups = new Map<number, number[]>(); // raiz → triângulos
  for (let t = 0; t < indices.length; t += 3) {
    const r = find(node[indices[t]]);
    const g = groups.get(r);
    if (g) g.push(t);
    else groups.set(r, [t]);
  }
  if (groups.size <= 1) return [mesh];
  return [...groups.values()].map((tris) => {
    const remap = new Map<number, number>();
    const pos: number[] = [];
    const idx = new Uint32Array(tris.length * 3);
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const v = indices[t + k];
        let nv = remap.get(v);
        if (nv === undefined) {
          nv = remap.size;
          remap.set(v, nv);
          pos.push(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]);
        }
        idx[3 * i + k] = nv;
      }
    });
    return { positions: new Float32Array(pos), indices: idx };
  });
}
