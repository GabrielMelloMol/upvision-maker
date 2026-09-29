import { fitInto, outerOnly, scoped } from "../shape2d";
import { layoutOnPlate } from "../keychain";
import type { Model } from "../types";
import { moveModel, requireArt, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type ColoringTileParams = {
  size: number;
  thickness: number;
  wall: number; // altura dos traços
  line: number; // largura do traço no modo contorno
  mode: "lines" | "outline";
  /** Relevo (padrão), rebaixado, 2 peças (grade que encaixa na base) ou marchetaria (cada área vira peça) (#61). */
  style?: "raised" | "recessed" | "twoPiece" | "marquetry";
  clearance?: number; // folga dos encaixes
  plateColor: string;
  lineColor: string;
};

export const DEFAULT_COLORING_TILE: ColoringTileParams = { size: 80, thickness: 2, wall: 1.6, line: 1.2, mode: "outline", plateColor: "#f8f8f6", lineColor: "#1c1c1e", style: "raised", clearance: 0.2 };

const GROOVE = 1; // profundidade do encaixe da grade na base (2 peças)
const GAP = 8;
const MIN_PIECE_MM2 = 4; // área menor que isto não vira peça de marchetaria
const MAX_PIECES = 80;

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
    const style = p.style ?? "raised";
    const cl = p.clearance ?? 0.2;
    const warnings: string[] = [];
    // traço que não toca o resto (a grade das 2 peças e da marchetaria precisa ser uma peça só)
    const loose = walls.decompose().map(k).length - 1;
    if (style !== "raised" && style !== "recessed" && loose > 0) warnings.push(`${loose} traço(s) solto(s) não tocam o resto e cairiam da grade: ligue-os no desenho ou engrosse o traço.`);
    const aside = (m: Model, dx: number): Model => moveModel(m, dx, 0);
    if (style === "recessed") {
      // áreas afundadas: a placa inteira na cor dos traços, pinta-se dentro dos rebaixos
      const areas = k(k(plate.offset(-p.line * 1.5, "Round")).subtract(lines));
      const block = k(k(plate.extrude(p.thickness + p.wall)).subtract(k(k(areas.extrude(p.wall + 0.01)).translate([0, 0, p.thickness]))));
      return { models: [{ name: "Plaquinha", parts: [{ name: "Placa", color: p.lineColor, mesh: solidMesh(block) }] }], warnings };
    }
    if (style === "twoPiece") {
      // base com canaletas no desenho da grade (com folga) + grade à parte, que encaixa nelas
      const groove = k(walls.offset(cl, "Round"));
      const base = k(k(plate.extrude(p.thickness)).subtract(k(k(groove.extrude(GROOVE + 0.01)).translate([0, 0, p.thickness - GROOVE]))));
      return {
        models: [
          { name: "Base", parts: [{ name: "Base", color: p.plateColor, mesh: solidMesh(base) }] },
          aside({ name: "Grade", parts: [{ name: "Grade", color: p.lineColor, mesh: slab(walls, p.wall + GROOVE) }] }, p.size + GAP),
        ],
        warnings: [...warnings, "A grade encaixa nas canaletas da base: pinte as áreas da base antes, se quiser."],
      };
    }
    if (style === "marquetry") {
      // grade com base (como o relevo) e cada área como peça que encaixa nela, com folga
      const areas = k(k(k(plate.offset(-p.line * 1.5, "Round")).subtract(lines)).offset(-cl, "Round"));
      const cells = areas.decompose().map(k).filter((c) => c.area() >= MIN_PIECE_MM2);
      if (cells.length > MAX_PIECES) warnings.push(`O desenho tem ${cells.length} áreas: só as ${MAX_PIECES} maiores viraram peças.`);
      const kept = cells.sort((a, b) => b.area() - a.area()).slice(0, MAX_PIECES);
      const pieces: Model[] = kept.map((c, i) => ({ name: `Peça ${i + 1}`, parts: [{ name: "Peça", color: p.plateColor, mesh: slab(c, p.wall) }] }));
      const laid = pieces.length ? layoutOnPlate(pieces, 250, 3).map((m) => aside(m, p.size + GAP + 125)) : [];
      return {
        models: [{ name: "Grade", parts: [{ name: "Base", color: p.lineColor, mesh: slab(plate, p.thickness) }, { name: "Traços", color: p.lineColor, mesh: slab(walls, p.wall, p.thickness) }] }, ...laid],
        warnings: [...warnings, "Marchetaria: imprima cada peça na cor que quiser e encaixe na grade (dá quadro colorido sem AMS)."],
      };
    }
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
      warnings,
    };
  });
}
