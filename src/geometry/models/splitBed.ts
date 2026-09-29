import type { ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";

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
