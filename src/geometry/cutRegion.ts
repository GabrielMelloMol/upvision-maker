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
const OUTLINE_MM = 0.6;
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

/** Contorno para a prévia (a malha não tem fio): barras finas nas arestas da caixa, anéis no cilindro e na esfera. */
export function regionOutline(M: ManifoldToplevel, k: K, r: Region): Solid {
  const t = OUTLINE_MM;
  if (r.kind === "box") {
    const bars: Solid[] = [];
    for (let axis = 0; axis < 3; axis++) {
      for (const a of [r.min, r.max]) {
        for (const b of [r.min, r.max]) {
          const size: Vec3 = [t, t, t];
          const at: Vec3 = [0, 0, 0];
          const [i, j] = [(axis + 1) % 3, (axis + 2) % 3];
          size[axis] = r.max[axis] - r.min[axis] + t;
          at[axis] = r.min[axis] - t / 2;
          at[i] = a[i] - t / 2;
          at[j] = b[j] - t / 2;
          bars.push(k(k(M.Manifold.cube(size, false)).translate(at)));
        }
      }
    }
    return k(M.Manifold.union(bars));
  }
  const ring = (radius: number, rot: Vec3, at: Vec3) => {
    const outer = k(M.Manifold.cylinder(t, radius + t / 2, radius + t / 2, SEGMENTS, true));
    const inner = k(M.Manifold.cylinder(t * 3, Math.max(radius - t / 2, 0.01), Math.max(radius - t / 2, 0.01), SEGMENTS, true));
    return k(k(k(outer.subtract(inner)).rotate(rot)).translate(at));
  };
  if (r.kind === "sphere") return k(M.Manifold.union([ring(r.radius, [0, 0, 0], r.center), ring(r.radius, [90, 0, 0], r.center), ring(r.radius, [0, 90, 0], r.center)]));
  const a = AXIS_INDEX[r.axis];
  const up = (s: number): Vec3 => r.center.map((v, i) => (i === a ? v + (s * r.height) / 2 : v)) as Vec3;
  const rods = [0, 1, 2, 3].map((n) => {
    const ang = (n * Math.PI) / 2;
    const local: Vec3 = [r.radius * Math.cos(ang) - t / 2, r.radius * Math.sin(ang) - t / 2, -r.height / 2];
    const rod = k(k(M.Manifold.cube([t, t, r.height], false)).translate(local));
    return k(k(rod.rotate(TO_AXIS[r.axis])).translate(r.center));
  });
  return k(M.Manifold.union([ring(r.radius, TO_AXIS[r.axis], up(1)), ring(r.radius, TO_AXIS[r.axis], up(-1)), ...rods]));
}

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
