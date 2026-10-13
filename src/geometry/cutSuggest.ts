import { fitRegionToPart } from "./cutFit";
import type { Box } from "./cutRegion";
import { runCuts } from "./cutSequence";
import type { ManifoldToplevel } from "./manifold";
import { DEFAULT_PARTIAL_CUT } from "./partialCut";
import type { Mesh, Model } from "./types";

/**
 * Sugestão de onde cortar para imprimir com menos suporte: acha as faces de baixo quase horizontais que ficam no ar
 * (saliências: braço, aba, galho), propõe um plano logo abaixo de cada grupo, com a região em volta da parte de cima, e
 * mede o ganho cortando de verdade: o pedaço assenta na mesa pela face cortada e a saliência vira o fundo dele.
 */
export type Suggestion = {
  /** Altura do plano (mm) e a caixa em volta da parte de cima. */
  z: number;
  region: Box;
  /** Área em balanço (mm²) antes e depois de cortar. */
  before: number;
  after: number;
};

const OVERHANG_COS = Math.SQRT1_2; // 45°: mais inclinada que isso (para baixo) precisa de suporte
const FLAT_COS = 0.95; // face de baixo "quase horizontal": candidata a plano
const BED_EPS = 0.3; // mm acima da mesa que já conta como no ar
const CLUSTER_MM = 0.5;
const MIN_CLUSTER_MM2 = 8;
const MAX_CANDIDATES = 5;
const MIN_GAIN = 0.1; // pelo menos 10% da área em balanço
const BELOW_MM = 0.05; // o plano passa um fio abaixo da face de baixo
const MIN_GAP_MM = 1;

type Tri = { area: number; nz: number; z: number; cx: number; cy: number };

function triangles(meshes: Mesh[]): { tris: Tri[]; minZ: number } {
  const tris: Tri[] = [];
  let minZ = Infinity;
  for (const m of meshes) {
    const p = m.positions;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
      const [ux, uy, uz, vx, vy, vz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2], p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) continue;
      const z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
      minZ = Math.min(minZ, p[a + 2], p[b + 2], p[c + 2]);
      tris.push({ area: len / 2, nz: nz / len, z, cx: (p[a] + p[b] + p[c]) / 3, cy: (p[a + 1] + p[b + 1] + p[c + 1]) / 3 });
    }
  }
  return { tris, minZ };
}

/** Área (mm²) das faces que ficam no ar a mais de 45° e acima da mesa de cada peça. `meshes` já na orientação de impressão. */
export function overhangArea(meshes: Mesh[]): number {
  const { tris, minZ } = triangles(meshes);
  return tris.reduce((s, t) => (t.nz < -OVERHANG_COS && t.z > minZ + BED_EPS ? s + t.area : s), 0);
}

function candidates(model: Model): { z: number; cx: number; cy: number }[] {
  const { tris, minZ } = triangles(model.parts.map((p) => p.mesh));
  const groups = new Map<number, { area: number; cx: number; cy: number }>();
  for (const t of tris) {
    if (t.nz > -FLAT_COS || t.z <= minZ + BED_EPS) continue;
    const key = Math.round(t.z / CLUSTER_MM);
    const g = groups.get(key) ?? { area: 0, cx: 0, cy: 0 };
    g.cx += t.cx * t.area;
    g.cy += t.cy * t.area;
    g.area += t.area;
    groups.set(key, g);
  }
  return [...groups]
    .filter(([, g]) => g.area >= MIN_CLUSTER_MM2)
    .sort((a, b) => b[1].area - a[1].area)
    .slice(0, MAX_CANDIDATES)
    .map(([key, g]) => ({ z: key * CLUSTER_MM, cx: g.cx / g.area, cy: g.cy / g.area }));
}

/** Cortes sugeridos, do que mais reduz o suporte para o que menos (só os que reduzem ao menos 10%). */
export function suggestCuts(M: ManifoldToplevel, model: Model): Suggestion[] {
  const before = overhangArea(model.parts.map((p) => p.mesh));
  if (before <= 0) return [];
  const out: Suggestion[] = [];
  for (const c of candidates(model)) {
    const z = c.z - BELOW_MM;
    try {
      const region = fitRegionToPart(M, model, { axis: "z", tilt: 0, offset: z, region: null }, "box", [c.cx, c.cy, c.z]);
      if (region.kind !== "box") continue;
      const box: Box = { min: region.min, max: region.max };
      const cut = runCuts(M, model, { cuts: [{ ...DEFAULT_PARTIAL_CUT, offset: z, region: { kind: "box", ...box }, pin: "none", color: null }], restColor: null });
      const after = overhangArea(cut.models.flatMap((m) => m.parts.map((p) => p.mesh)));
      if (before - after >= before * MIN_GAIN) out.push({ z, region: box, before, after });
    } catch {
      /* esse plano não corta nada útil: segue para o próximo */
    }
  }
  return out.sort((a, b) => b.before - b.after - (a.before - a.after)).filter((s, i, all) => all.findIndex((o) => Math.abs(o.z - s.z) < MIN_GAP_MM) === i);
}
