import type { Model } from "../../geometry/types";

/*
 * Composição da cena da foto (#251): move, gira e copia peças (Z para cima, mm). Tudo devolve cópias novas.
 */
export type Pose = { x?: number; y?: number; z?: number; rotZ?: number; rotX?: number };

const rad = (d: number) => (d * Math.PI) / 180;

/** Gira em X (graus), depois em Z, depois move. */
export function placeModels(models: Model[], pose: Pose): Model[] {
  const [cx, sx] = [Math.cos(rad(pose.rotX ?? 0)), Math.sin(rad(pose.rotX ?? 0))];
  const [cz, sz] = [Math.cos(rad(pose.rotZ ?? 0)), Math.sin(rad(pose.rotZ ?? 0))];
  return models.map((m) => ({
    ...m,
    parts: m.parts.map((p) => {
      const out = new Float32Array(p.mesh.positions.length);
      for (let i = 0; i < out.length; i += 3) {
        const x0 = p.mesh.positions[i], y0 = p.mesh.positions[i + 1], z0 = p.mesh.positions[i + 2];
        const y1 = y0 * cx - z0 * sx, z1 = y0 * sx + z0 * cx; // gira em X
        out[i] = x0 * cz - y1 * sz + (pose.x ?? 0);
        out[i + 1] = x0 * sz + y1 * cz + (pose.y ?? 0);
        out[i + 2] = z1 + (pose.z ?? 0);
      }
      return { ...p, mesh: { positions: out, indices: p.mesh.indices } };
    }),
  }));
}

export function boundsOf(models: Model[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of models) for (const p of m.parts) for (let i = 0; i < p.mesh.positions.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = p.mesh.positions[i + k];
    if (v < min[k]) min[k] = v;
    if (v > max[k]) max[k] = v;
  }
  return { min, max };
}

/** Põe o centro (x, y) da peça na origem e o fundo em z = 0. */
export function grounded(models: Model[]): Model[] {
  const b = boundsOf(models);
  return placeModels(models, { x: -(b.min[0] + b.max[0]) / 2, y: -(b.min[1] + b.max[1]) / 2, z: -b.min[2] });
}

/** Troca a cor das partes (mapa de cores antigas → novas, sem diferenciar maiúsculas). */
export function recolor(models: Model[], map: Record<string, string>): Model[] {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return models.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, color: lower[p.color.toLowerCase()] ?? p.color })) }));
}
