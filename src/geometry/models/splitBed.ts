import type { ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { scoped } from "../shape2d";
import type { Model } from "../types";

/** Margem da mesa: a peça cortada fica um pouco menor que a mesa (saia, brim). */
const BED_MARGIN = 6;
const SLIVER_MM = 0.6; // pedaço mais fino que isso (o corte raspando numa letra) não imprime: sai

/** Tira os pedaços soltos mais finos que um filete que o corte deixou (ex.: 0,3 mm da borda de uma letra). */
function dropSlivers(M: ManifoldToplevel, s: Solid): Solid {
  return scoped((k) => {
    const comps = s.decompose().map(k);
    const keep = comps.filter((c) => {
      const b = c.boundingBox();
      return Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]) >= SLIVER_MM;
    });
    return keep.length === comps.length ? s.translate([0, 0, 0]) : M.Manifold.compose(keep);
  });
}

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
        const piece = dropSlivers(M, k(solid.intersect(box)));
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
        const pieces = parts.map((q) => ({ ...q, solid: k(dropSlivers(M, k(q.solid.intersect(box)))) })).filter((q) => !q.solid.isEmpty());
        if (pieces.length) out.push({ name: `${name} ${out.length + 1}`, parts: pieces.map((q) => ({ name: q.name, color: q.color, mesh: toMesh(q.solid) })) });
      }
    return out;
  });
}

const PIN_LEN = 14; // metade para cada lado do corte
const PIN_STEP = 4; // passo da busca por lugar para o pino
const MAX_PINS = 2;

/**
 * Furos de pino atravessando cada corte que `splitToBed` fará (para um pedaço de filamento alinhar as partes na
 * colagem): até 2 por corte, onde o furo inteiro cabe dentro da peça, na altura `z`. Devolve o sólido furado.
 */
export function pinHoles(M: ManifoldToplevel, solid: Solid, bed: number, r: number, z: number): Solid {
  return scoped((k) => {
    const b = solid.boundingBox();
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
    const [nx, ny] = size.map((s) => Math.max(1, Math.ceil(s / (bed - BED_MARGIN))));
    const probe = (axis: 0 | 1, at: number, along: number) => {
      const c = k(M.Manifold.cylinder(PIN_LEN, r, r, 16, true));
      const turned = k(c.rotate(axis === 0 ? [0, 90, 0] : [90, 0, 0]));
      return k(turned.translate(axis === 0 ? [at, along, z] : [along, at, z]));
    };
    let out = solid;
    const cuts: [0 | 1, number][] = [
      ...Array.from({ length: nx - 1 }, (_, i) => [0, b.min[0] + ((i + 1) * size[0]) / nx] as [0, number]),
      ...Array.from({ length: ny - 1 }, (_, j) => [1, b.min[1] + ((j + 1) * size[1]) / ny] as [1, number]),
    ];
    for (const [axis, at] of cuts) {
      const lo = b.min[1 - axis], hi = b.max[1 - axis];
      const fits: number[] = [];
      for (let v = lo + r + 1; v <= hi - r - 1; v += PIN_STEP) {
        const pin = probe(axis, at, v);
        if (k(solid.intersect(pin)).volume() > pin.volume() * 0.999) fits.push(v);
      }
      // os mais afastados entre si
      const chosen = fits.length <= MAX_PINS ? fits : [fits[0], fits[fits.length - 1]];
      for (const v of chosen) out = k(out.subtract(probe(axis, at, v)));
    }
    return out === solid ? solid.translate([0, 0, 0]) : out.translate([0, 0, 0]);
  });
}
