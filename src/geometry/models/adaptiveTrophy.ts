import { fitInto, scoped } from "../shape2d";
import { artParts, backing, moveModel, requireArt, slab, type ModelCtx, type ModelOutput } from "./common";
import { trophyBase } from "./trophy";

export type AdaptiveTrophyParams = {
  height: number; // altura da arte
  thickness: number; // corpo (4–10 mm)
  border: number;
  relief: number;
  baseText: string;
  baseText2: string;
  compact: boolean;
  bodyColor: string;
  artColor: string;
  baseColor: string;
  textColor: string;
};

export const DEFAULT_ADAPTIVE_TROPHY: AdaptiveTrophyParams = {
  height: 100,
  thickness: 5,
  border: 3,
  relief: 1.2,
  baseText: "CAMPEÃO",
  baseText2: "",
  compact: true,
  bodyColor: "#f5c542",
  artColor: "#1c1c1e",
  baseColor: "#1c1c1e",
  textColor: "#f5c542",
};

const TAB_H = 8;
const OVERLAP = 2;

/** Troféu adaptável: corpo no contorno do desenho (com lingueta embaixo) + base original ou compacta com até 2 linhas. */
export function buildAdaptiveTrophy(ctx: ModelCtx, p: AdaptiveTrophyParams): ModelOutput {
  const art = requireArt(ctx.art);
  const { M } = ctx;
  const plate = scoped((k) => {
    const placed = k(fitInto(art, 1e6, p.height, 0));
    const body = k(backing(M, placed, p.border));
    const b = body.bounds();
    const w = b.max[0] - b.min[0];
    const tabW = Math.min(w * 0.5, 40);
    // lingueta sai do ponto mais baixo do meio do contorno
    const band = k(body.intersect(k(M.CrossSection.square([tabW, 1e4], true))));
    const bottom = band.bounds().min[1];
    const tab = k(k(M.CrossSection.square([tabW, TAB_H + OVERLAP], true)).translate([0, bottom - (TAB_H - OVERLAP) / 2]));
    const outline = k(body.add(tab));
    return { tabW, model: { name: "Troféu", parts: [{ name: "Corpo", color: p.bodyColor, mesh: slab(outline, p.thickness) }, ...artParts(ctx, placed, p.artColor, "Arte", p.relief, p.thickness)] }, w };
  });
  const base = trophyBase(ctx, { width: Math.max(plate.w * 0.9, plate.tabW + 20), tabW: plate.tabW, thickness: p.thickness, relief: p.relief, lines: [p.baseText, p.baseText2], compact: p.compact, baseColor: p.baseColor, textColor: p.textColor });
  return { models: [plate.model, moveModel(base, 0, -(p.height / 2 + TAB_H + 45))] };
}
