/**
 * Cortar peça grande para a mesa (#218), parte 1: quantos cortes em cada eixo, em que orientação cada pedaço cabe e os
 * sistemas de coordenadas dos planos de corte (o eixo do corte vira o "w" local; "u" e "v" ficam no plano).
 */
export type Axis = "x" | "y" | "z";
export type Vec3 = [number, number, number];
export type BedBox = { x: number; y: number; z: number };

export const AXES: Axis[] = ["x", "y", "z"];
export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
export const MAX_PARTS_PER_AXIS = 8;

/** A área útil da mesa: a margem de segurança sai de cada lado (só nas medidas da mesa, não na altura). */
export function usable(bed: BedBox, margin: number): BedBox {
  return { x: Math.max(1, bed.x - 2 * margin), y: Math.max(1, bed.y - 2 * margin), z: bed.z };
}

/** O pedaço (a, b, c em mm) cabe numa orientação qualquer: uma das medidas na vertical, as outras duas na mesa (de um jeito ou do outro). */
export function fitsBed(cell: Vec3, u: BedBox): boolean {
  const eps = 1e-6;
  return [0, 1, 2].some((i) => {
    const [p, q] = [cell[(i + 1) % 3], cell[(i + 2) % 3]];
    return cell[i] <= u.z + eps && ((p <= u.x + eps && q <= u.y + eps) || (p <= u.y + eps && q <= u.x + eps));
  });
}

export type CutPlan = { counts: Vec3; pieces: number; fits: boolean };

/** Menos pedaços possível, cada um cabendo; no empate, a menor área de corte (menos encaixes). */
export function planCuts(dims: Vec3, bed: BedBox, margin: number): CutPlan {
  const u = usable(bed, margin);
  let best: (CutPlan & { area: number }) | null = null;
  for (let nx = 1; nx <= MAX_PARTS_PER_AXIS; nx++)
    for (let ny = 1; ny <= MAX_PARTS_PER_AXIS; ny++)
      for (let nz = 1; nz <= MAX_PARTS_PER_AXIS; nz++) {
        if (!fitsBed([dims[0] / nx, dims[1] / ny, dims[2] / nz], u)) continue;
        const pieces = nx * ny * nz;
        const area = (nx - 1) * dims[1] * dims[2] + (ny - 1) * dims[0] * dims[2] + (nz - 1) * dims[0] * dims[1];
        if (!best || pieces < best.pieces || (pieces === best.pieces && area < best.area)) best = { counts: [nx, ny, nz], pieces, fits: true, area };
      }
  if (best) return { counts: best.counts, pieces: best.pieces, fits: true };
  return { counts: [MAX_PARTS_PER_AXIS, MAX_PARTS_PER_AXIS, MAX_PARTS_PER_AXIS], pieces: MAX_PARTS_PER_AXIS ** 3, fits: false };
}

/** Matrizes 4×4 (coluna a coluna, como o Manifold pede) entre o mundo e o sistema do plano de corte no eixo `axis`, na posição `p`. */
export type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
const mat = (cols: Vec3[], t: Vec3): Mat4 => [...cols[0], 0, ...cols[1], 0, ...cols[2], 0, ...t, 1] as Mat4;

export function planeFrame(axis: Axis, p: number): { toWorld: Mat4; toLocal: Mat4; lateral: [0 | 1 | 2, 0 | 1 | 2] } {
  if (axis === "z") return { toWorld: mat([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, p]), toLocal: mat([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, -p]), lateral: [0, 1] };
  if (axis === "x") return { toWorld: mat([[0, 1, 0], [0, 0, 1], [1, 0, 0]], [p, 0, 0]), toLocal: mat([[0, 0, 1], [1, 0, 0], [0, 1, 0]], [0, 0, -p]), lateral: [1, 2] };
  return { toWorld: mat([[0, 0, 1], [1, 0, 0], [0, 1, 0]], [0, p, 0]), toLocal: mat([[0, 1, 0], [0, 0, 1], [1, 0, 0]], [0, 0, -p]), lateral: [2, 0] };
}

/** Giro (graus) que leva a face de fora na direção `dir` para baixo (−Z): o pedaço assenta nela na mesa. */
export const FACE_DOWN: { label: string; rotate: Vec3 }[] = [
  { label: "−Z", rotate: [0, 0, 0] },
  { label: "+Z", rotate: [180, 0, 0] },
  { label: "+X", rotate: [0, 90, 0] },
  { label: "−X", rotate: [0, -90, 0] },
  { label: "+Y", rotate: [-90, 0, 0] },
  { label: "−Y", rotate: [90, 0, 0] },
];
