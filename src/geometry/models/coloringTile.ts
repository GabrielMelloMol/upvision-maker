import { fitInto, outerOnly, scoped } from "../shape2d";
import { requireArt, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

export type ColoringTileParams = {
  size: number;
  thickness: number;
  wall: number; // altura dos traços
  line: number; // largura do traço no modo contorno
  mode: "lines" | "outline";
  plateColor: string;
  lineColor: string;
};

export const DEFAULT_COLORING_TILE: ColoringTileParams = { size: 80, thickness: 2, wall: 1.6, line: 1.2, mode: "outline", plateColor: "#f8f8f6", lineColor: "#1c1c1e" };

const MARGIN = 5;

/**
 * Plaquinha de colorir: placa com os traços do desenho em relevo, formando "piscininhas" para tinta.
 * Linhas: o desenho vira traço como está (bom para desenho de linha). Contorno: cada área cheia ganha uma borda.
 */
export function buildColoringTile({ M, art }: ModelCtx, p: ColoringTileParams): ModelOutput {
  const src = requireArt(art);
  return scoped((k) => {
    const plate = k(roundedRect(M, p.size, p.size, 4));
    const placed = k(fitInto(src, p.size - 2 * MARGIN, p.size - 2 * MARGIN, 0));
    const lines = p.mode === "lines" ? placed : k(k(placed.offset(p.line / 2, "Round")).subtract(k(placed.offset(-p.line / 2, "Round"))));
    const frame = k(plate.subtract(k(plate.offset(-p.line * 1.5, "Round"))));
    const walls = k(k(lines.add(frame)).intersect(k(outerOnly(M, plate))));
    return {
      models: [
        {
          name: "Plaquinha",
          parts: [
            { name: "Placa", color: p.plateColor, mesh: slab(plate, p.thickness) },
            { name: "Traços", color: p.lineColor, mesh: slab(walls, p.wall, p.thickness) },
          ],
        },
      ],
    };
  });
}
