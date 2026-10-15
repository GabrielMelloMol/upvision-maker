import { planeNormal, type PartialCutOptions } from "./partialCut";
import type { Box, Region, RegionKind, Vec3 } from "./cutRegion";
import { regionCenter } from "./cutRegion";
import { solidFromMesh } from "./cutSolid";
import type { ManifoldToplevel, Solid } from "./manifold";
import { scoped } from "./shape2d";
import type { Model } from "./types";

/**
 * Região que envolve a parte de cima do plano que fica perto de `near` (a cabeça, não só o pescoço onde o plano passa):
 * caixa = caixa da parte + folga; cilindro/esfera = raio da parte + margem. Evita o "tarugo" que tira só o miolo.
 */
const BOX_PAD = 1;
const MARGIN = 1.5;
const AXIS = { x: 0, y: 1, z: 2 } as const;

/** Distância de um ponto à caixa de um sólido (0 se estiver dentro). */
function distTo(s: Solid, p: Vec3): number {
  const b = s.boundingBox();
  return Math.hypot(...[0, 1, 2].map((a) => Math.max(b.min[a] - p[a], 0, p[a] - b.max[a])));
}

export function fitRegionToPart(M: ManifoldToplevel, model: Model, o: Pick<PartialCutOptions, "axis" | "tilt" | "offset" | "region">, kind: RegionKind, near: Vec3): Region {
  return scoped((k) => {
    const n = planeNormal(o.axis, o.tilt);
    const all = k(M.Manifold.union(model.parts.map((p) => k(solidFromMesh(M, p.mesh).solid))));
    const comps = k(all.trimByPlane(n, o.offset)).decompose().map(k);
    const part = comps.sort((a, b) => distTo(a, near) - distTo(b, near))[0];
    if (!part) throw new Error("O plano de corte não passa pela peça.");
    const bb = part.boundingBox();
    const box: Box = { min: bb.min.map((v) => v - BOX_PAD) as Vec3, max: bb.max.map((v) => v + BOX_PAD) as Vec3 };
    if (kind === "box") return { kind, ...box };
    const mesh = part.getMesh();
    const c = bb.min.map((v, i) => (v + bb.max[i]) / 2) as Vec3;
    const far = (skip: number | null) => {
      let r = 0;
      for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
        const d = [0, 1, 2].map((a) => (a === skip ? 0 : mesh.vertProperties[i + a] - c[a]));
        r = Math.max(r, Math.hypot(d[0], d[1], d[2]));
      }
      return r;
    };
    if (kind === "sphere") return { kind, center: c, radius: far(null) + MARGIN };
    const a = AXIS[o.axis];
    const [lo, hi] = [bb.min[a] - MARGIN, bb.max[a] + MARGIN];
    const center = c.map((v, i) => (i === a ? (lo + hi) / 2 : v)) as Vec3;
    return { kind, center, radius: far(a) + MARGIN, height: hi - lo, axis: o.axis };
  });
}

/** Ponto de referência da região atual (para escolher a parte quando não há clique). */
export const regionAnchor = (r: Region | null, fallback: Vec3): Vec3 => (r ? regionCenter(r) : fallback);
