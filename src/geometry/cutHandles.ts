import { centerRegionAt, regionCenter, type Region, type Vec3 } from "./cutRegion";

/**
 * Alças da região e do plano na vista 3D (corte parcial): onde ficam e o que cada arrasto muda. Puro: a vista só leva
 * o ponteiro até aqui e devolve a região nova.
 */
export type RegionHandle = { id: string; pos: Vec3; axis?: Vec3; color?: string };
export type PlaneRef = { normal: Vec3; offset: number };

const MIN_SIZE = 0.5;
const MIN_RADIUS = 1;
const PLANE_COLOR = "#ef4444";
const unitAxis = (a: number): Vec3 => [a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0];
const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const with1 = (v: Vec3, i: number, x: number): Vec3 => v.map((y, j) => (j === i ? x : y)) as Vec3;

/** Ponto do plano mais perto de `p` (onde fica a alça do plano). */
const onPlane = (plane: PlaneRef, p: Vec3): Vec3 => {
  const d = dot(plane.normal, p) - plane.offset;
  return p.map((v, i) => v - plane.normal[i] * d) as Vec3;
};

export function regionHandles(region: Region | null, plane: PlaneRef, anchor: Vec3): RegionHandle[] {
  const planeHandle: RegionHandle = { id: "plane", pos: onPlane(plane, region ? regionCenter(region) : anchor), axis: plane.normal, color: PLANE_COLOR };
  if (!region) return [planeHandle];
  const c = regionCenter(region);
  const out: RegionHandle[] = [planeHandle, { id: "move", pos: c }];
  if (region.kind === "box") {
    for (let a = 0; a < 3; a++) {
      out.push({ id: `min${a}`, pos: with1(c, a, region.min[a]), axis: unitAxis(a) });
      out.push({ id: `max${a}`, pos: with1(c, a, region.max[a]), axis: unitAxis(a) });
    }
  } else if (region.kind === "sphere") {
    out.push({ id: "r", pos: with1(c, 0, c[0] + region.radius), axis: unitAxis(0) });
  } else {
    const a = AXIS_INDEX[region.axis];
    const p = (a + 1) % 3;
    out.push({ id: "r", pos: with1(c, p, c[p] + region.radius), axis: unitAxis(p) });
    out.push({ id: "top", pos: with1(c, a, c[a] + region.height / 2), axis: unitAxis(a) });
    out.push({ id: "bottom", pos: with1(c, a, c[a] - region.height / 2), axis: unitAxis(a) });
  }
  return out;
}

/** Região e posição do plano depois de arrastar a alça `id` até `pos`. */
export function applyHandle(region: Region | null, plane: PlaneRef, id: string, pos: Vec3): { region: Region | null; offset: number } {
  if (id === "plane") return { region, offset: dot(plane.normal, pos) };
  if (!region) return { region, offset: plane.offset };
  const keep = (r: Region) => ({ region: r, offset: plane.offset });
  if (id === "move") return keep(centerRegionAt(region, pos));
  if (region.kind === "box") {
    const side = id.slice(0, 3);
    const a = Number(id.slice(3));
    if (side === "min") return keep({ ...region, min: with1(region.min, a, Math.min(pos[a], region.max[a] - MIN_SIZE)) });
    return keep({ ...region, max: with1(region.max, a, Math.max(pos[a], region.min[a] + MIN_SIZE)) });
  }
  if (region.kind === "sphere") return keep({ ...region, radius: Math.max(MIN_RADIUS, Math.abs(pos[0] - region.center[0])) });
  const a = AXIS_INDEX[region.axis];
  const p = (a + 1) % 3;
  if (id === "r") return keep({ ...region, radius: Math.max(MIN_RADIUS, Math.abs(pos[p] - region.center[p])) });
  const [bottom, top] = [region.center[a] - region.height / 2, region.center[a] + region.height / 2];
  const [lo, hi] = id === "top" ? [bottom, Math.max(pos[a], bottom + MIN_SIZE)] : [Math.min(pos[a], top - MIN_SIZE), top];
  return keep({ ...region, height: hi - lo, center: with1(region.center, a, (lo + hi) / 2) });
}
