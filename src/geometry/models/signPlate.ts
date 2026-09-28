import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type SignPlateParams = {
  text: string;
  width: number;
  height: number;
  thickness: number;
  panel: number; // altura do painel elevado da arte
  relief: number; // relevo do texto
  plateColor: string;
  accentColor: string;
};

export const DEFAULT_SIGN_PLATE: SignPlateParams = {
  text: "Recepção",
  width: 150,
  height: 50,
  thickness: 3,
  panel: 1.6,
  relief: 0.8,
  plateColor: "#1c1c1e",
  accentColor: "#ffffff",
};

const MARGIN_FRAC = 0.1;
const ART_FRAC = 0.8;
const TEXT_H_FRAC = 0.4;

/**
 * Placa de sinalização: placa retangular; à esquerda um painel elevado com a arte recortada (negativa,
 * mostra a cor da placa) e à direita o texto em relevo. Sem desenho, o texto ocupa a placa toda.
 */
export function buildSignPlate({ M, text, art }: ModelCtx, p: SignPlateParams): ModelOutput {
  return scoped((k) => {
    const m = p.height * MARGIN_FRAC;
    const side = p.height - 2 * m;
    const parts = [{ name: "Placa", color: p.plateColor, mesh: slab(k(roundedRect(M, p.width, p.height, m)), p.thickness) }];
    let textLeft = -p.width / 2 + m;
    if (art) {
      const cx = -p.width / 2 + m + side / 2;
      const panel = k(k(roundedRect(M, side, side, m / 2)).translate([cx, 0]));
      const inner = k(panel.offset(-m / 2, "Round"));
      const cut = k(shrinkToFit(k(k(fitInto(art, side * ART_FRAC, side * ART_FRAC, 0)).translate([cx, 0])), inner));
      parts.push({ name: "Painel", color: p.accentColor, mesh: solidMesh(k(k(k(panel.subtract(cut)).extrude(p.panel)).translate([0, 0, p.thickness]))) });
      textLeft = cx + side / 2 + m;
    }
    const raw = text(p.text, 100);
    if (raw) {
      const maxW = p.width / 2 - m - textLeft;
      const t = k(fitInto(k(raw), maxW, p.height * TEXT_H_FRAC, 0));
      parts.push({ name: "Texto", color: p.accentColor, mesh: slab(k(t.translate([textLeft + maxW / 2, 0])), p.relief, p.thickness) });
    }
    if (parts.length === 1) throw new Error("Digite o texto ou envie um desenho.");
    return { models: [{ name: "Placa", parts }] };
  });
}
