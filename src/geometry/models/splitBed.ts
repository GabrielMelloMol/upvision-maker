import type { ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { scoped } from "../shape2d";
import type { Model } from "../types";

/** Margem da mesa: a peça cortada fica um pouco menor que a mesa (saia, brim). */
const BED_MARGIN = 6;

/**
 * Corta um sólido em partes que cabem na mesa (lado `bed`), numa grade de cortes retos em X e Y, com o mínimo de
 * partes. Devolve as partes não vazias (quem chama dá delete()). ponytail: corte reto e colado; pinos de encaixe
 * entre as partes se o alinhamento na colagem virar problema.
 */
export function splitToBed(M: ManifoldToplevel, solid: Solid, bed: number): Solid[] {
  const b = solid.boundingBox();
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
  const usable = bed - BED_MARGIN;
  const [nx, ny] = size.map((s) => Math.max(1, Math.ceil(s / usable)));
  if (nx === 1 && ny === 1) return [solid.translate([0, 0, 0])];
  const [sx, sy] = [size[0] / nx, size[1] / ny];
  const h = b.max[2] - b.min[2] + 2;
  return scoped((k) => {
    const out: Solid[] = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const box = k(k(M.Manifold.cube([sx, sy, h])).translate([b.min[0] + i * sx, b.min[1] + j * sy, b.min[2] - 1]));
        const piece = solid.intersect(box);
        if (piece.isEmpty()) piece.delete();
        else out.push(piece);
      }
    return out;
  });
}

/**
 * Peça de várias cores maior que a mesa: corta todas as partes na mesma grade (a da 1ª parte, a base), para
 * que cada pedaço saia com as suas cores. Um Model por pedaço, chamado "`name` 1", "`name` 2"…
 */
export function splitModelToBed(M: ManifoldToplevel, name: string, parts: { name: string; color: string; solid: Solid }[], bed: number): Model[] {
  return scoped((k) => {
    const b = parts[0].solid.boundingBox();
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
    const [nx, ny] = size.map((s) => Math.max(1, Math.ceil(s / (bed - BED_MARGIN))));
    if (nx === 1 && ny === 1) return [{ name, parts: parts.map((q) => ({ name: q.name, color: q.color, mesh: toMesh(q.solid) })) }];
    const [sx, sy] = [size[0] / nx, size[1] / ny];
    const out: Model[] = [];
    for (let j = ny - 1; j >= 0; j--)
      for (let i = 0; i < nx; i++) {
        const box = k(k(M.Manifold.cube([sx, sy, 1e4])).translate([b.min[0] + i * sx, b.min[1] + j * sy, -5e3]));
        const pieces = parts.map((q) => ({ ...q, solid: k(q.solid.intersect(box)) })).filter((q) => !q.solid.isEmpty());
        if (pieces.length) out.push({ name: `${name} ${out.length + 1}`, parts: pieces.map((q) => ({ name: q.name, color: q.color, mesh: toMesh(q.solid) })) });
      }
    return out;
  });
}
