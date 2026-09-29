import { fitInto, scoped, shrinkToFit } from "../shape2d";
import type { CS } from "../manifold";
import { boxOf, placeIn, roundedRect, slab, solidMesh, union, type ElementBox, type ModelCtx, type ModelOutput, MissingInput } from "./common";
import { DEFAULT_TEXTURE, recessMesh, type TextureParams } from "./textures";

export type SignPlateParams = {
  text: string;
  width: number;
  height: number;
  thickness: number;
  panel: number; // altura do painel elevado da arte
  relief: number; // relevo do texto
  plateColor: string;
  accentColor: string;
} & Partial<TextureParams>;

export const DEFAULT_SIGN_PLATE: SignPlateParams = {
  text: "Recepção",
  width: 150,
  height: 50,
  thickness: 3,
  panel: 1.6,
  relief: 0.8,
  plateColor: "#1c1c1e",
  accentColor: "#ffffff",
  ...DEFAULT_TEXTURE,
};

const MARGIN_FRAC = 0.1;
const ART_FRAC = 0.8;
const TEXT_H_FRAC = 0.4;

/**
 * Placa de sinalização: placa retangular; à esquerda um painel elevado com a arte recortada (negativa,
 * mostra a cor da placa) e à direita o texto em relevo. Sem desenho, o texto ocupa a placa toda.
 */
export function buildSignPlate(ctx: ModelCtx, p: SignPlateParams): ModelOutput {
  const { M, text, art } = ctx;
  return scoped((k) => {
    const elements: ElementBox[] = [];
    const m = p.height * MARGIN_FRAC;
    const side = p.height - 2 * m;
    const parts = [{ name: "Placa", color: p.plateColor, mesh: slab(k(roundedRect(M, p.width, p.height, m)), p.thickness) }];
    let textLeft = -p.width / 2 + m;
    const keep: CS[] = []; // textura do fundo fica fora do painel e do texto
    if (art) {
      const cx0 = -p.width / 2 + m + side / 2;
      const [pdx, pdy] = placeIn(ctx, "panel", [-side / 2, -side / 2, side / 2, side / 2], [cx0 - side / 2, -side / 2, cx0 + side / 2, side / 2]);
      const panel = k(k(roundedRect(M, side, side, m / 2)).translate([pdx, pdy]));
      const inner = k(panel.offset(-m / 2, "Round"));
      const cut = k(shrinkToFit(k(k(fitInto(art, side * ART_FRAC, side * ART_FRAC, 0)).translate([pdx, pdy])), inner));
      elements.push({ id: "panel", label: "Ícone", box: boxOf(panel) });
      keep.push(panel);
      parts.push({ name: "Painel", color: p.accentColor, mesh: solidMesh(k(k(k(panel.subtract(cut)).extrude(p.panel)).translate([0, 0, p.thickness]))) });
      textLeft = cx0 + side / 2 + m;
    }
    const raw = text(p.text, 100);
    if (raw) {
      const maxW = p.width / 2 - m - textLeft;
      const t = k(fitInto(k(raw), maxW, p.height * TEXT_H_FRAC, 0));
      const [tdx, tdy] = placeIn(ctx, "text", boxOf(t), [textLeft, -p.height / 2 + m, p.width / 2 - m, p.height / 2 - m]);
      const placed = k(t.translate([tdx, tdy]));
      elements.push({ id: "text", label: "Texto", box: boxOf(placed) });
      keep.push(placed);
      parts.push({ name: "Texto", color: p.accentColor, mesh: slab(placed, p.relief, p.thickness) });
    }
    if (parts.length === 1) throw new MissingInput("Digite o texto ou envie um desenho.");
    parts[0] = { ...parts[0], mesh: recessMesh(M, parts[0].mesh, k(union(M, keep)), p) };
    return { models: [{ name: "Placa", parts }], elements };
  });
}
