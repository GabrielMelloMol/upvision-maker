import type { CS, ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { moveModel, solidMesh, type ModelCtx, type ModelOutput } from "./common";

/*
 * Régua 3D rápida (#140): tira fina de 25 cm, marcas gravadas (mm, 5 mm e cm com número). Cabe na A1 inteira; em
 * 2 partes, as metades encaixam por uma cauda de andorinha (mesa pequena ou para guardar).
 */
export type RulerParams = { length: number; width: number; thickness: number; end: number; split: boolean; color: string };
export const DEFAULT_RULER: RulerParams = { length: 250, width: 16, thickness: 1, end: 2, split: false, color: "#1c1c1e" };

const TICK_W = 0.45; // ≥ bico 0,4
const DEPTH = 0.4;
const TICK = { cm: 7, half: 5, mm: 3 };
const NUM_H = 4;
const DOVE = { len: 6, narrow: 4, wide: 7 }; // cauda de andorinha
const CLEAR = 0.15; // folga por lado no encaixe
const PART_GAP = 10;

function marks(ctx: ModelCtx, p: RulerParams): CS {
  const { M } = ctx;
  return scoped((k) => {
    const cuts: CS[] = [];
    for (let i = 0; i <= p.length; i++) {
      const h = i % 10 === 0 ? TICK.cm : i % 5 === 0 ? TICK.half : TICK.mm;
      cuts.push(k(M.CrossSection.square([TICK_W, h + 0.01]).translate([p.end + i - TICK_W / 2, -0.01])));
      if (i % 10 === 0) {
        const t = ctx.text(String(i / 10), NUM_H);
        if (t) {
          k(t);
          const b = t.bounds();
          // número ao lado da marca (o 0 para dentro da régua, o último para fora não passa da ponta)
          const cx = i === 0 ? p.end + TICK_W + (b.max[0] - b.min[0]) / 2 + 0.6 : i === p.length ? p.end + i - (b.max[0] - b.min[0]) / 2 - 0.8 : p.end + i;
          cuts.push(k(t.translate([cx - (b.min[0] + b.max[0]) / 2, TICK.cm + 1.5 + NUM_H / 2 - (b.min[1] + b.max[1]) / 2])));
        }
      }
    }
    return M.CrossSection.union(cuts);
  });
}

/** Trapézio da cauda de andorinha com a base estreita em x = `x0`, abrindo para +x. */
const dovetail = (M: ManifoldToplevel, x0: number, cy: number, grow: number): CS =>
  new M.CrossSection(
    [
      [
        [x0 - grow, cy - DOVE.narrow / 2 - grow],
        [x0 + DOVE.len + grow, cy - DOVE.wide / 2 - grow],
        [x0 + DOVE.len + grow, cy + DOVE.wide / 2 + grow],
        [x0 - grow, cy + DOVE.narrow / 2 + grow],
      ],
    ],
    "NonZero",
  );

export function buildRuler3d(ctx: ModelCtx, p: RulerParams): ModelOutput & { assembled?: Model[] } {
  const { M } = ctx;
  return scoped((k) => {
    const total = p.length + 2 * p.end;
    const strip = k(k(M.CrossSection.square([total, p.width])).extrude(p.thickness));
    const engraved = k(k(k(marks(ctx, p)).extrude(DEPTH + 0.01)).translate([0, 0, p.thickness - DEPTH]));
    const ruler = k(strip.subtract(engraved));
    const warnings = ["Imprima deitada, com a face das marcas para cima; confira com uma régua de verdade ou com a régua de papel."];
    if (!p.split) return { models: [{ name: "Régua 25 cm", parts: [{ name: "Régua", color: p.color, mesh: solidMesh(ruler) }] }], warnings };
    // corte no meio (12,5 cm): a metade de cá leva a cauda, a de lá o encaixe com folga
    const cut = p.end + p.length / 2, cy = p.width / 2;
    const tail = k(k(k(dovetail(M, cut, cy, 0)).extrude(p.thickness)).subtract(engraved)); // as marcas continuam na cauda
    const socket = k(k(dovetail(M, cut, cy, CLEAR)).extrude(p.thickness + 1));
    const left = k(k(ruler.trimByPlane([-1, 0, 0], -cut)).add(tail));
    const right = k(k(ruler.trimByPlane([1, 0, 0], cut)).subtract(k(socket.translate([0, 0, -0.5]))));
    const piece = (name: string, s: typeof ruler): Model => ({ name, parts: [{ name: "Régua", color: p.color, mesh: solidMesh(s) }] });
    const assembled = [piece("Régua (0 a 12,5 cm)", left), piece("Régua (12,5 a 25 cm)", right)];
    const half = cut + DOVE.len;
    return { models: [assembled[0], moveModel(assembled[1], -half + PART_GAP, p.width + PART_GAP)], warnings: [...warnings, "Em 2 partes: encaixe a cauda de andorinha deslizando por cima; aperte com a unha se ficar frouxa."], assembled };
  });
}
