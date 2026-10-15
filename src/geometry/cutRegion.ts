import type { CutAxis } from "./planeCut";
import type { K } from "./planeCut";
import type { ManifoldToplevel, Solid } from "./manifold";

/**
 * Região onde o corte vale (corte parcial): caixa, cilindro (cabeça, braço, galho) ou esfera, em mm no sistema do modelo.
 */
export type Vec3 = [number, number, number];
export type Box = { min: Vec3; max: Vec3 };
export type Region =
  | ({ kind: "box" } & Box)
  | { kind: "cylinder"; center: Vec3; radius: number; height: number; axis: CutAxis }
  | { kind: "sphere"; center: Vec3; radius: number };
export type RegionKind = Region["kind"];

const SEGMENTS = 48;
const AXIS_INDEX: Record<CutAxis, number> = { x: 0, y: 1, z: 2 };
/** Rotação que leva o eixo Z do cilindro padrão para o eixo pedido. */
const TO_AXIS: Record<CutAxis, Vec3> = { z: [0, 0, 0], x: [0, 90, 0], y: [-90, 0, 0] };

export const boxRegion = (b: Box): Region => ({ kind: "box", min: b.min, max: b.max });

/** Caixa que envolve a região (para sliders, enquadramento e alças). */
export function regionBox(r: Region): Box {
  if (r.kind === "box") return { min: r.min, max: r.max };
  if (r.kind === "sphere") return { min: r.center.map((v) => v - r.radius) as Vec3, max: r.center.map((v) => v + r.radius) as Vec3 };
  const a = AXIS_INDEX[r.axis];
  const ext = [r.radius, r.radius, r.radius] as Vec3;
  ext[a] = r.height / 2;
  return { min: r.center.map((v, i) => v - ext[i]) as Vec3, max: r.center.map((v, i) => v + ext[i]) as Vec3 };
}

/** Região de cada forma que cobre a mesma caixa (troca de forma sem perder o lugar). */
export function regionOfKind(kind: RegionKind, from: Box): Region {
  const c = from.min.map((v, i) => (v + from.max[i]) / 2) as Vec3;
  const e = from.min.map((v, i) => from.max[i] - v);
  if (kind === "box") return { kind, min: from.min, max: from.max };
  if (kind === "sphere") return { kind, center: c, radius: Math.max(...e) / 2 };
  return { kind, center: c, radius: Math.max(e[0], e[1]) / 2, height: e[2], axis: "z" };
}

export function regionSolid(M: ManifoldToplevel, k: K, r: Region): Solid {
  if (r.kind === "box") return k(k(M.Manifold.cube([r.max[0] - r.min[0], r.max[1] - r.min[1], r.max[2] - r.min[2]], false)).translate(r.min));
  if (r.kind === "sphere") return k(k(M.Manifold.sphere(r.radius, SEGMENTS)).translate(r.center));
  const cyl = k(M.Manifold.cylinder(r.height, r.radius, r.radius, SEGMENTS, true));
  return k(k(cyl.rotate(TO_AXIS[r.axis])).translate(r.center));
}

const CIRCLE_SEGMENTS = 72;

/** Pares de pontos dos 12 lados da caixa. */
function boxSegments(min: Vec3, max: Vec3): number[] {
  const out: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const [i, j] = [(axis + 1) % 3, (axis + 2) % 3];
    for (const a of [min[i], max[i]]) {
      for (const b of [min[j], max[j]]) {
        const p: Vec3 = [0, 0, 0];
        p[axis] = min[axis];
        p[i] = a;
        p[j] = b;
        const q: Vec3 = [...p];
        q[axis] = max[axis];
        out.push(...p, ...q);
      }
    }
  }
  return out;
}

/** Círculo de raio `r` em volta de `c`, no plano perpendicular ao eixo `axis`, em segmentos. */
function circleSegments(c: Vec3, r: number, axis: number, offset = 0): number[] {
  const [i, j] = [(axis + 1) % 3, (axis + 2) % 3];
  const at = (n: number): Vec3 => {
    const p: Vec3 = [...c];
    p[axis] += offset;
    p[i] += r * Math.cos((2 * Math.PI * n) / CIRCLE_SEGMENTS);
    p[j] += r * Math.sin((2 * Math.PI * n) / CIRCLE_SEGMENTS);
    return p;
  };
  const out: number[] = [];
  for (let n = 0; n < CIRCLE_SEGMENTS; n++) out.push(...at(n), ...at(n + 1));
  return out;
}

/** Contorno da região como segmentos (a vista os desenha finos e tracejados, de largura fixa em pixels). */
export function regionSegments(r: Region): Float32Array {
  if (r.kind === "box") return Float32Array.from(boxSegments(r.min, r.max));
  if (r.kind === "sphere") return Float32Array.from([0, 1, 2].flatMap((a) => circleSegments(r.center, r.radius, a)));
  const a = AXIS_INDEX[r.axis];
  const [i, j] = [(a + 1) % 3, (a + 2) % 3];
  const rods = [0, 1, 2, 3].flatMap((n) => {
    const p: Vec3 = [...r.center];
    p[i] += r.radius * Math.cos((n * Math.PI) / 2);
    p[j] += r.radius * Math.sin((n * Math.PI) / 2);
    const [lo, hi]: [Vec3, Vec3] = [[...p], [...p]];
    lo[a] -= r.height / 2;
    hi[a] += r.height / 2;
    return [...lo, ...hi];
  });
  return Float32Array.from([...circleSegments(r.center, r.radius, a, r.height / 2), ...circleSegments(r.center, r.radius, a, -r.height / 2), ...rods]);
}

/** Traço do tracejado em mm: acompanha o tamanho da região (peça pequena, traço curto). */
export function dashFor(r: Region): number {
  const b = regionBox(r);
  const size = Math.max(...[0, 1, 2].map((a) => b.max[a] - b.min[a]));
  return Math.min(3, Math.max(0.4, size / 30));
}

/** Malha vazia (a parte só tem linhas). Sempre nova: o worker não aceita o mesmo buffer duas vezes. */
export const emptyMesh = () => ({ positions: new Float32Array(0), indices: new Uint32Array(0) });

/** Centro da região. */
export const regionCenter = (r: Region): Vec3 => (r.kind === "box" ? (r.min.map((v, i) => (v + r.max[i]) / 2) as Vec3) : r.center);

/** Move a região para que o centro caia em `p`. */
export function centerRegionAt(r: Region, p: Vec3): Region {
  const c = regionCenter(r);
  return shiftRegion(r, p.map((v, i) => v - c[i]) as Vec3);
}

export function shiftRegion(r: Region, d: Vec3): Region {
  const add = (v: Vec3): Vec3 => v.map((x, i) => x + d[i]) as Vec3;
  return r.kind === "box" ? { ...r, min: add(r.min), max: add(r.max) } : { ...r, center: add(r.center) };
}
