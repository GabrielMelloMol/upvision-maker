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

const DASH = 3; // mm de traço e de vão no contorno tracejado
const GAP = 2;
type Pt2 = [number, number];

/** Barra tracejada ao longo do eixo `axis`, de `from` a `from + len`, com seção t × t. */
function dashedBar(M: ManifoldToplevel, k: K, axis: number, from: Vec3, len: number, t: number): Solid[] {
  const out: Solid[] = [];
  for (let pos = 0; pos < len; pos += DASH + GAP) {
    const size: Vec3 = [t, t, t];
    const at: Vec3 = [from[0] - t / 2, from[1] - t / 2, from[2] - t / 2];
    size[axis] = Math.min(DASH, len - pos);
    at[axis] = from[axis] + pos;
    out.push(k(k(M.Manifold.cube(size, false)).translate(at)));
  }
  return out;
}

/** Anel tracejado no plano XY (centrado na origem, espessura `t` em Z). */
function dashedRing(M: ManifoldToplevel, k: K, radius: number, t: number): Solid {
  const ring = k(k(M.CrossSection.circle(radius + t / 2, SEGMENTS)).subtract(k(M.CrossSection.circle(Math.max(radius - t / 2, 0.01), SEGMENTS))));
  const n = Math.max(6, Math.round((2 * Math.PI * radius) / (DASH + GAP)));
  const R = 2 * (radius + t);
  const wedges = Array.from({ length: n }, (_, i) => {
    const a0 = (i * 2 * Math.PI) / n;
    const a1 = a0 + ((2 * Math.PI) / n) * (DASH / (DASH + GAP));
    const mid = (a0 + a1) / 2;
    const pts: Pt2[] = [[0, 0], [R * Math.cos(a0), R * Math.sin(a0)], [R * Math.cos(mid), R * Math.sin(mid)], [R * Math.cos(a1), R * Math.sin(a1)]];
    return k(new M.CrossSection([pts], "NonZero"));
  });
  const dashes = k(ring.intersect(k(M.CrossSection.union(wedges))));
  return k(k(dashes.extrude(t)).translate([0, 0, -t / 2]));
}

/** Contorno tracejado da região para a prévia (a malha não tem fio): traços nas arestas da caixa, anéis no cilindro e na esfera. */
export function regionOutline(M: ManifoldToplevel, k: K, r: Region): Solid {
  const t = OUTLINE_MM;
  if (r.kind === "box") {
    const bars: Solid[] = [];
    for (let axis = 0; axis < 3; axis++) {
      const [i, j] = [(axis + 1) % 3, (axis + 2) % 3];
      for (const a of [r.min[i], r.max[i]]) {
        for (const b of [r.min[j], r.max[j]]) {
          const from: Vec3 = [0, 0, 0];
          from[axis] = r.min[axis];
          from[i] = a;
          from[j] = b;
          bars.push(...dashedBar(M, k, axis, from, r.max[axis] - r.min[axis], t));
        }
      }
    }
    return k(M.Manifold.union(bars));
  }
  if (r.kind === "sphere") {
    const ring = dashedRing(M, k, r.radius, t);
    const rot = (v: Vec3) => k(k(ring.rotate(v)).translate(r.center));
    return k(M.Manifold.union([rot([0, 0, 0]), rot([90, 0, 0]), rot([0, 90, 0])]));
  }
  const ring = dashedRing(M, k, r.radius, t);
  const at = (s: number) => k(ring.translate([0, 0, (s * r.height) / 2]));
  const rods = [0, 1, 2, 3].flatMap((n) => {
    const ang = (n * Math.PI) / 2;
    return dashedBar(M, k, 2, [r.radius * Math.cos(ang), r.radius * Math.sin(ang), -r.height / 2], r.height, t);
  });
  const body = k(M.Manifold.union([at(1), at(-1), ...rods]));
  return k(k(body.rotate(TO_AXIS[r.axis])).translate(r.center));
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
