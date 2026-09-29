import { buildKeychain } from "../keychain";
import { fitInto, followTransform, scoped } from "../shape2d";
import { requireArt, type ModelCtx, type ModelOutput } from "./common";
import { DEFAULT_TEXTURE, recessMesh, type TextureParams } from "./textures";

export type LogoPlateParams = {
  width: number; // largura da arte
  base: number;
  relief: number;
  border: number;
  ring: boolean;
  baseColor: string;
  artColor: string;
} & Partial<TextureParams>;

export const DEFAULT_LOGO_KEYCHAIN: LogoPlateParams = { width: 40, base: 2.4, relief: 1, border: 2.4, ring: true, baseColor: "#1c1c1e", artColor: "#ffffff" };
export const DEFAULT_ADAPTIVE_PLATE: LogoPlateParams = { width: 120, base: 3, relief: 1.2, border: 4, ring: false, baseColor: "#1c1c1e", artColor: "#ffffff", ...DEFAULT_TEXTURE };

const RING_OUTER = 4.5;
const RING_HOLE = 2.2;

/** Chaveiro de logo / placa adaptável: base que segue o contorno do desenho (com argola opcional) e a arte em relevo, uma parte por cor. */
export function buildLogoPlate(ctx: ModelCtx, p: LogoPlateParams): ModelOutput {
  const art = requireArt(ctx.art);
  return scoped((k) => {
    const placed = k(fitInto(art, p.width, 1e6, 0));
    const layers = ctx.artLayers && ctx.artLayers.length > 1 ? ctx.artLayers.map((l) => ({ color: l.color, cs: k(k(followTransform(art, placed, l.cs)).intersect(placed)) })) : null;
    const model = buildKeychain(
      ctx.M,
      placed,
      { base: p.base, relief: p.relief, border: p.border, ring: p.ring, ringOuter: RING_OUTER, ringHole: RING_HOLE, baseColor: p.baseColor, topColor: p.artColor },
      p.ring ? "Chaveiro" : "Placa",
      layers,
    );
    // textura no fundo visível da base, fora da arte (#50)
    const parts = model.parts.map((x) => (x.name === "Texto" ? { ...x, name: "Arte" } : x.name === "Base" ? { ...x, mesh: recessMesh(ctx.M, x.mesh, placed, p) } : x));
    return { models: [{ ...model, parts }] };
  });
}
