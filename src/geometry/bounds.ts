import type { Mesh, Model } from "./types";

export type Bounds = { min: [number, number, number]; max: [number, number, number] };

export function meshBounds(meshes: Mesh[]): Bounds | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i++) {
      const a = i % 3;
      if (m.positions[i] < min[a]) min[a] = m.positions[i];
      if (m.positions[i] > max[a]) max[a] = m.positions[i];
    }
  }
  return min[0] === Infinity ? null : { min, max };
}

export const modelsBounds = (models: Model[]) => meshBounds(models.flatMap((m) => m.parts.map((p) => p.mesh)));
