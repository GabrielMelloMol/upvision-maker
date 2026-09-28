import type { Mesh } from "./types";

/** STL binário → malha indexada (vértices iguais são unidos, o que o 3MF e o fatiador esperam). */
export function readBinaryStl(data: Uint8Array): Mesh {
  if (data.byteLength < 84) throw new Error("STL vazio ou inválido.");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = v.getUint32(80, true);
  if (data.byteLength < 84 + n * 50) throw new Error("STL truncado.");
  const index = new Map<string, number>();
  const pos: number[] = [];
  const idx = new Uint32Array(n * 3);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const o = 84 + t * 50 + 12 + k * 12;
      const x = v.getFloat32(o, true), y = v.getFloat32(o + 4, true), z = v.getFloat32(o + 8, true);
      const key = `${x},${y},${z}`;
      let i = index.get(key);
      if (i === undefined) {
        i = pos.length / 3;
        index.set(key, i);
        pos.push(x, y, z);
      }
      idx[t * 3 + k] = i;
    }
  }
  return { positions: new Float32Array(pos), indices: idx };
}
