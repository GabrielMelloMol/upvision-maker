import { fitInto, scoped } from "../shape2d";
import { artParts, backing, requireArt, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type KeyHolderParams = {
  width: number;
  hooks: number;
  thickness: number;
  hookDepth: number; // quanto o gancho sai da parede
  relief: number;
  panelColor: string;
  artColor: string;
};

export const DEFAULT_KEY_HOLDER: KeyHolderParams = { width: 180, hooks: 5, thickness: 5, hookDepth: 14, relief: 1.2, panelColor: "#1c1c1e", artColor: "#f5c542" };

const BAR_H = 16;
const BORDER = 2.5;
const SCREW_D = 4.5;
const HOOK_W = 6;
const HOOK_DROP = 14;
const HOOK_LIP = 6;

/**
 * Porta-chave de parede: painel no contorno do desenho, barra com ganchos em J e 2 furos de parafuso.
 * Imprime deitado: os ganchos saem da parede na espessura `hookDepth`.
 */
export function buildKeyHolder(ctx: ModelCtx, p: KeyHolderParams): ModelOutput {
  const art = requireArt(ctx.art);
  const { M } = ctx;
  return scoped((k) => {
    const placed = k(fitInto(art, p.width, 1e6, 0));
    const panel = k(backing(M, placed, BORDER));
    const pb = panel.bounds();
    const barW = Math.max(p.width * 0.9, p.hooks * 22);
    const barY = pb.min[1] - BAR_H / 2 + 3;
    let bar = k(k(roundedRect(M, barW, BAR_H, 4)).translate([0, barY]));
    for (const sx of [-1, 1]) bar = k(bar.subtract(k(k(M.CrossSection.circle(SCREW_D / 2, 32)).translate([sx * (barW / 2 - 8), barY]))));
    const step = barW / (p.hooks + 1);
    const hooks = Array.from({ length: p.hooks }, (_, i) => {
      const x = -barW / 2 + step * (i + 1);
      const stem = k(M.CrossSection.square([HOOK_W, HOOK_DROP], true).translate([x, barY - BAR_H / 2 - HOOK_DROP / 2 + 1]));
      const foot = k(k(roundedRect(M, HOOK_W + HOOK_LIP, HOOK_W, 2)).translate([x + HOOK_LIP / 2, barY - BAR_H / 2 - HOOK_DROP]));
      const lip = k(k(roundedRect(M, HOOK_W, HOOK_LIP + HOOK_W, 2)).translate([x + HOOK_LIP, barY - BAR_H / 2 - HOOK_DROP + HOOK_LIP / 2]));
      return k(M.CrossSection.union([stem, foot, lip]));
    });
    const plate = k(panel.add(bar));
    const hookSolid = k(k(M.CrossSection.union(hooks)).extrude(p.hookDepth));
    const body = k(k(plate.extrude(p.thickness)).add(hookSolid));
    return {
      models: [{ name: "Porta-chave", parts: [{ name: "Painel", color: p.panelColor, mesh: solidMesh(body) }, ...artParts(ctx, placed, p.artColor, "Arte", p.relief, p.thickness)] }],
      warnings: ["Furos de 4,5 mm para parafuso com bucha 6. Ganchos aguentam chaves; para bolsa, aumente a espessura."],
    };
  });
}
