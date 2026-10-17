import { loadFont } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { buildPixelArt, DEFAULT_PIXEL_OPTIONS, type PixelGrid } from "../geometry/pixelArt";
import { scoped, shrinkToFit } from "../geometry/shape2d";
import { buildStampArt, DEFAULT_ART } from "../geometry/stampArt";
import { buildThermo, thermoDefaults } from "../geometry/thermo/build";
import { presetSilhouette } from "../geometry/thermo/shapes";
import { BASKET_VESSEL, buildVessel, DEFAULT_VESSEL } from "../geometry/thermo/vessel";
import type { Model } from "../geometry/types";
import { renderModels, THUMB_H, THUMB_W } from "./renderThumb";

/*
 * Miniaturas dos cartões da Criar que são ferramentas, não Modelos prontos: uma por produto (id de products.ts),
 * em src/assets/product-thumbs/<id>.webp. Mesmo render e mesma câmera das miniaturas dos modelos.
 */
const HEART = ["..aa...aa..", ".aaaa.aaaa.", "aabaaaaaaaa", "aabbaaaaaaa", "aaaaaaaaaaa", ".aaaaaaaaa.", "..aaaaaaa..", "...aaaaa...", "....aaa....", ".....a....."];
const PIXEL_PALETTE = ["#e11d48", "#fda4af"];

const caixinha = async (): Promise<Model[]> => {
  const M = await getManifold();
  const p = thermoDefaults();
  const font = await loadFont("great-vibes");
  const sil = presetSilhouette(M, "heart", 70);
  const area = scoped((k) => k(sil.offset(-(p.screen.border + 4), "Round")).bounds());
  const w = (area.max[0] - area.min[0]) * 0.8;
  const h = (area.max[1] - area.min[1]) * 0.8;
  const art = buildStampArt(M, { shape: "rect", w, h, logo: null, lines: ["Feliz", "Natal"], font, layout: "stack", textScale: 55, frame: "none", lineW: DEFAULT_ART.lineW, arcTop: "", arcBottom: "", arcH: DEFAULT_ART.arcH, scale: 100, move: DEFAULT_ART.move });
  const design = scoped((k) => shrinkToFit(art.art, k(sil.offset(-(p.screen.border + 4), "Round"))));
  art.art.delete();
  return [buildThermo(M, sil, design, p, { preview: true }).assembled];
};

const cesto = async (): Promise<Model[]> => [buildVessel(await getManifold(), { ...DEFAULT_VESSEL, ...BASKET_VESSEL }, { preview: true }).assembled];

const pixel = async (): Promise<Model[]> => {
  const M = await getManifold();
  const cells = HEART.flatMap((row) => [...row].map((c) => (c === "." ? -1 : c === "b" ? 1 : 0)));
  const grid: PixelGrid = { cols: 11, rows: HEART.length, cells, palette: PIXEL_PALETTE };
  return buildPixelArt(M, grid, DEFAULT_PIXEL_OPTIONS, () => null).models;
};

const BUILDERS: Record<string, () => Promise<Model[]>> = { thermoform: caixinha, thermoware: cesto, pixelMosaic: pixel };

export const productThumbIds = () => Object.keys(BUILDERS);
export async function renderProductThumb(id: string): Promise<string> {
  return renderModels(await BUILDERS[id](), THUMB_W, THUMB_H, { studio: true });
}
