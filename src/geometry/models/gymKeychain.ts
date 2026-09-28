import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { artParts, slab, type ModelCtx, type ModelOutput } from "./common";

export type GymKeychainParams = {
  diameter: number;
  thickness: number;
  relief: number;
  text: string; // usado sem desenho (ex.: 20 KG)
  plateColor: string;
  artColor: string;
};

export const DEFAULT_GYM_KEYCHAIN: GymKeychainParams = { diameter: 40, thickness: 4, relief: 1.2, text: "20 KG", plateColor: "#1c1c1e", artColor: "#d6262e" };

const RIM_W = 2.5;
const HUB_R_FRAC = 0.14;
const TAB_R = 4.5;
const TAB_HOLE_R = 2.2;

/** Chaveiro peso de academia (anilha): disco com aro e cubo em relevo, argola no topo e a arte (ou texto) na face. */
export function buildGymKeychain({ M, text, art, artLayers }: ModelCtx, p: GymKeychainParams): ModelOutput {
  return scoped((k) => {
    const r = p.diameter / 2;
    const disc = k(M.CrossSection.circle(r, 96));
    const ty = r + TAB_R - 1.5;
    const outline = k(k(disc.add(k(k(M.CrossSection.circle(TAB_R, 48)).translate([0, ty])))).subtract(k(k(M.CrossSection.circle(TAB_HOLE_R, 32)).translate([0, ty]))));
    const rim = k(disc.subtract(k(disc.offset(-RIM_W, "Round"))));
    const hub = k(M.CrossSection.circle(r * HUB_R_FRAC, 48));
    const inner = k(k(disc.offset(-RIM_W - 1.5, "Round")).subtract(k(hub.offset(1.5, "Round"))));
    const parts = [
      { name: "Anilha", color: p.plateColor, mesh: slab(outline, p.thickness) },
      { name: "Aro", color: p.plateColor, mesh: slab(k(rim.add(hub)), p.relief, p.thickness) },
    ];
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (src) {
      const side = (r - RIM_W - 1.5) * 2 * 0.72;
      const placed = k(shrinkToFit(k(fitInto(src, side, side, 0)), inner));
      if (!placed.isEmpty()) parts.push(...artParts({ M, text, art, artLayers }, placed, p.artColor, "Arte", p.relief, p.thickness));
    }
    return { models: [{ name: "Anilha", parts }] };
  });
}
