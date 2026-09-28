import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

export type BookmarkParams = {
  text: string;
  length: number;
  width: number;
  thickness: number;
  relief: number;
  hole: boolean;
  baseColor: string;
  textColor: string;
};

export const DEFAULT_BOOKMARK: BookmarkParams = {
  text: "Boa leitura",
  length: 150,
  width: 40,
  thickness: 1.6,
  relief: 0.8,
  hole: true,
  baseColor: "#1c1c1e",
  textColor: "#f5c542",
};

const HOLE_R = 2.5;
const MARGIN = 4;

/** Marca-página: tira arredondada com furo para o cordão, texto ao longo do comprimento e desenho opcional no topo. */
export function buildBookmark({ M, text, art }: ModelCtx, p: BookmarkParams): ModelOutput {
  return scoped((k) => {
    const L = p.length, W = p.width;
    const holeY = L / 2 - MARGIN - HOLE_R;
    let body = k(roundedRect(M, W, L, 4));
    if (p.hole) body = k(body.subtract(k(k(M.CrossSection.circle(HOLE_R, 32)).translate([0, holeY]))));
    const inner = k(body.offset(-MARGIN, "Round"));
    const top = p.hole ? holeY - HOLE_R - MARGIN : L / 2 - MARGIN;
    const artH = art ? Math.min(W - 2 * MARGIN, L * 0.3) : 0;
    const slots = [];
    if (art) slots.push(k(shrinkToFit(k(fitInto(art, W - 2 * MARGIN, artH, top - artH / 2)), inner)));
    const raw = text(p.text, 100);
    if (raw) {
      // texto deitado ao longo do comprimento, lido de baixo para cima
      const turned = k(k(raw).rotate(90));
      const room = top - (art ? artH + MARGIN : 0) - (-L / 2 + MARGIN);
      const cy = -L / 2 + MARGIN + room / 2;
      slots.push(k(shrinkToFit(k(fitInto(turned, (W - 2 * MARGIN) * 0.7, room, cy)), inner)));
    }
    if (!slots.length) throw new Error("Digite um texto ou envie um desenho.");
    return {
      models: [
        {
          name: "Marca-página",
          parts: [
            { name: "Base", color: p.baseColor, mesh: slab(body, p.thickness) },
            { name: "Texto", color: p.textColor, mesh: slab(k(M.CrossSection.union(slots)), p.relief, p.thickness) },
          ],
        },
      ],
    };
  });
}
