import { fitInto, scoped } from "../shape2d";
import { artParts, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

export type MolleTagParams = {
  text: string;
  strap: number; // folga do rasgo para a fita MOLLE (espessura da fita + folga)
  thickness: number;
  relief: number;
  plateColor: string;
  artColor: string;
};

export const DEFAULT_MOLLE_TAG: MolleTagParams = { text: "BRAVO", strap: 3.5, thickness: 4, relief: 1, plateColor: "#4b5320", artColor: "#1c1c1e" };

const W = 118;
const H = 72;
const SAFE_W = 83;
const SAFE_H = 65;
const SLOT_L = 27; // fita MOLLE de 25 mm + folga
const SLOT_X = W / 2 - 8;
const SLOT_Y = 17;

/** MOLLE tag: placa 118×72 com 4 rasgos laterais para as fitas MOLLE e arte (ou texto) na área segura de 83×65. */
export function buildMolleTag(ctx: ModelCtx, p: MolleTagParams): ModelOutput {
  const { M, text, art } = ctx;
  return scoped((k) => {
    let plate = k(roundedRect(M, W, H, 6));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) plate = k(plate.subtract(k(k(roundedRect(M, p.strap, SLOT_L, p.strap / 2)).translate([sx * SLOT_X, sy * SLOT_Y]))));
    const parts = [{ name: "Placa", color: p.plateColor, mesh: slab(plate, p.thickness) }];
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (src) parts.push(...artParts(ctx, k(fitInto(src, SAFE_W * 0.9, SAFE_H * 0.9, 0)), p.artColor, "Arte", p.relief, p.thickness));
    return { models: [{ name: "MOLLE tag", parts }] };
  });
}
