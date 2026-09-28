import type { Solid } from "./manifold";
import type { Mesh } from "./types";

export function toMesh(solid: Solid): Mesh {
  const m = solid.getMesh();
  const n = m.vertProperties.length / m.numProp;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) positions.set(m.vertProperties.subarray(i * m.numProp, i * m.numProp + 3), i * 3);
  return { positions, indices: new Uint32Array(m.triVerts) };
}
