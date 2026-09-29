import type { CS } from "../manifold";
import { scoped } from "../shape2d";
import type { Part } from "../types";
import { slab } from "./common";

/** Cavidade para resina epóxi (#53): borda elevada em volta da peça que segura a resina sobre a arte. */
export type ResinParams = { resin?: boolean; resinDepth?: number; resinWall?: number };
export const DEFAULT_RESIN: Required<ResinParams> = { resin: false, resinDepth: 1.5, resinWall: 1.6 };

export const RESIN_TIP =
  "Resina: imprima a base em cor clara (a resina escurece um pouco o fundo), nivele a peça antes de despejar e encha até a borda; espere curar sem mexer.";

/**
 * Borda da cavidade: faixa de largura `resinWall` na beira de `outline`, de `z` até `z + above + resinDepth`
 * (`above` = o que já sobe da base: o relevo da arte). null sem resina.
 */
export function resinRim(outline: CS, z: number, above: number, p: ResinParams, color: string): Part | null {
  if (!p.resin) return null;
  const wall = p.resinWall ?? DEFAULT_RESIN.resinWall;
  return scoped((k) => {
    const ring = k(outline.subtract(k(outline.offset(-wall, "Round"))));
    return { name: "Borda da resina", color, mesh: slab(ring, above + (p.resinDepth ?? DEFAULT_RESIN.resinDepth), z) };
  });
}
