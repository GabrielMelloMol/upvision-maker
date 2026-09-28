import { fitInto, scoped } from "../shape2d";
import { artParts, backing, requireArt, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

export type AdaptiveMedalParams = {
  width: number; // largura da arte
  thickness: number; // corpo 4–10 mm
  border: number;
  relief: number;
  ribbon: number; // largura da fita
  bodyColor: string;
  artColor: string;
};

export const DEFAULT_ADAPTIVE_MEDAL: AdaptiveMedalParams = { width: 60, thickness: 4, border: 3, relief: 1.2, ribbon: 20, bodyColor: "#f5c542", artColor: "#1c1c1e" };

const TAB_H = 12;
const SLOT_H = 3.5;
const OVERLAP = 3;

/** Medalha adaptável: corpo reforçado no contorno do desenho e alça com rasgo para a fita no topo. */
export function buildAdaptiveMedal(ctx: ModelCtx, p: AdaptiveMedalParams): ModelOutput {
  const art = requireArt(ctx.art);
  const { M } = ctx;
  return scoped((k) => {
    const placed = k(fitInto(art, p.width, 1e6, 0));
    const body = k(backing(M, placed, p.border));
    const band = k(body.intersect(k(M.CrossSection.square([p.ribbon, 1e4], true))));
    const top = band.bounds().max[1];
    const tabW = p.ribbon + 8;
    const tab = k(k(roundedRect(M, tabW, TAB_H + OVERLAP, 3)).translate([0, top + (TAB_H - OVERLAP) / 2]));
    const slot = k(k(M.CrossSection.square([p.ribbon + 1, SLOT_H], true)).translate([0, top + TAB_H / 2]));
    const outline = k(k(body.add(tab)).subtract(slot));
    return { models: [{ name: "Medalha", parts: [{ name: "Corpo", color: p.bodyColor, mesh: slab(outline, p.thickness) }, ...artParts(ctx, placed, p.artColor, "Arte", p.relief, p.thickness)] }] };
  });
}
