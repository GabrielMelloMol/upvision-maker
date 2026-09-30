import { meshBounds } from "../geometry/bounds";
import type { ManifoldToplevel, Solid } from "../geometry/manifold";
import { scoped } from "../geometry/shape2d";
import type { Model } from "../geometry/types";

/**
 * Checagens de imprimibilidade da varredura de QA (#90), só na geometria (antes do fatiador): malha fechada, nada
 * abaixo da mesa, nenhum corpo solto no ar, cabe na mesa e sem paredes mais finas que um filete de bico 0,4.
 */
export const BED_MM = 256;
export const MIN_WALL = 0.4;
const EPS = 0.05; // mm: "toca a mesa"
const SLICES = [0.1, 0.3, 0.5, 0.7, 0.9]; // alturas relativas onde procura parede fina
const MIN_ISLAND = 0.2; // mm²: ilhas menores que isso são ruído de malha
const THIN_LOSS = 0.3; // fração da ilha que some na abertura de 0,4 mm = parede fina de verdade

export type Problem = { kind: "fail" | "warn"; msg: string };

const solidOf = (M: ManifoldToplevel, m: Model["parts"][number]["mesh"]): Solid =>
  M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

const mm = (n: number) => n.toFixed(1).replace(".", ",");

export function checkModels(M: ManifoldToplevel, models: Model[]): Problem[] {
  const out: Problem[] = [];
  if (!models.length || models.every((m) => !m.parts.length)) return [{ kind: "fail", msg: "não gerou nenhuma peça" }];
  const all = meshBounds(models.flatMap((m) => m.parts.map((p) => p.mesh)));
  if (!all) return [{ kind: "fail", msg: "malha vazia" }];
  const set = [all.max[0] - all.min[0], all.max[1] - all.min[1]];
  if (models.length > 1 && set.some((s) => s > BED_MM)) out.push({ kind: "warn", msg: `o conjunto arrumado ocupa ${set.map(mm).join(" × ")} mm: passa da mesa de ${BED_MM} mm` });
  if (all.min[2] < -EPS) out.push({ kind: "fail", msg: `abaixo da mesa (Z mín. ${mm(all.min[2])} mm)` });
  for (const m of models) {
    const b = meshBounds(m.parts.map((p) => p.mesh));
    if (!b) continue;
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    if (size.some((s) => s > BED_MM)) out.push({ kind: "fail", msg: `"${m.name}" não cabe na mesa de ${BED_MM} mm (${size.map(mm).join(" × ")} mm)` });
    if (b.min[2] > EPS) out.push({ kind: "fail", msg: `"${m.name}" não encosta na mesa (Z mín. ${mm(b.min[2])} mm)` });
    out.push(...checkSolid(M, m));
  }
  return out;
}

function checkSolid(M: ManifoldToplevel, m: Model): Problem[] {
  const out: Problem[] = [];
  return scoped((k) => {
    const solids: Solid[] = [];
    for (const p of m.parts) {
      try {
        const s = k(solidOf(M, p.mesh));
        if (s.status() !== "NoError") out.push({ kind: "fail", msg: `"${m.name} / ${p.name}": malha com erro (${s.status()})` });
        else if (s.isEmpty()) out.push({ kind: "fail", msg: `"${m.name} / ${p.name}": parte vazia` });
        else solids.push(s);
      } catch {
        out.push({ kind: "fail", msg: `"${m.name} / ${p.name}": malha não-manifold (aberta ou com arestas soltas)` });
      }
    }
    if (!solids.length) return out;
    const union = k(M.Manifold.union(solids));
    const bodies = union.decompose().map(k);
    const floating = bodies.filter((s) => s.boundingBox().min[2] > EPS && s.volume() > MIN_ISLAND);
    if (floating.length) out.push({ kind: "fail", msg: `"${m.name}": ${floating.length} corpo(s) solto(s) no ar (Z ${floating.map((s) => mm(s.boundingBox().min[2])).join(", ")} mm)` });
    const thin = thinWalls(union);
    if (thin) out.push({ kind: "warn", msg: `"${m.name}": parede/traço < ${String(MIN_WALL).replace(".", ",")} mm em Z ${thin.map(mm).join(", ")} mm` });
    return out;
  });
}

/** Alturas (mm) onde alguma ilha do corte perde muito na abertura de 0,4 mm (erode 0,2 + dilata 0,2), ou null. */
export function thinWalls(s: Solid): number[] | null {
  const bb = s.boundingBox();
  const hits: number[] = [];
  scoped((k) => {
    for (const t of SLICES) {
      const z = bb.min[2] + (bb.max[2] - bb.min[2]) * t;
      for (const island of k(s.slice(z)).decompose().map(k)) {
        const a = island.area();
        if (a < MIN_ISLAND) continue;
        const opened = k(k(island.offset(-MIN_WALL / 2, "Round")).offset(MIN_WALL / 2, "Round"));
        if ((a - opened.area()) / a > THIN_LOSS) {
          hits.push(z);
          break;
        }
      }
    }
  });
  return hits.length ? hits : null;
}
