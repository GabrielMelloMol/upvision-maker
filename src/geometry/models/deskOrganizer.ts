import { fitInto, scoped } from "../shape2d";
import type { Part } from "../types";
import { roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type DeskOrganizerParams = {
  mode: "row" | "grid";
  widths: string; // proporções dos compartimentos em fila, ex.: "1, 1, 2"
  cols: number; // modo grade
  rows: number;
  length: number;
  depth: number;
  height: number;
  wall: number;
  floor: number;
  drain: boolean; // furos de drenagem no fundo (modo grade: vasinhos, pincéis)
  name: string;
  nameHeight: number;
  relief: number;
  bodyColor: string;
  nameColor: string;
};

export const DEFAULT_DESK_ORGANIZER: DeskOrganizerParams = {
  mode: "row",
  widths: "1, 1, 2",
  cols: 3,
  rows: 2,
  length: 180,
  depth: 80,
  height: 70,
  wall: 2,
  floor: 2,
  drain: false,
  name: "Ana",
  nameHeight: 22,
  relief: 1.2,
  bodyColor: "#f8f8f6",
  nameColor: "#2563eb",
};

const CORNER = 4;
const NAME_MARGIN = 6;
const DRAIN_R = 2;
const MAX_CELLS = 5;

/** "1, 1, 2" → [1, 1, 2] (números positivos, no máximo 5). */
export function parseWidths(s: string): number[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => Number(x.replace(",", ".")))
    .filter((x) => Number.isFinite(x) && x > 0)
    .slice(0, MAX_CELLS);
}

/**
 * Organizador de mesa: bandeja de compartimentos em fila (proporções livres: caneta, clipes, celular em pé) ou em
 * grade H×V (com furos de drenagem opcionais), e o nome em relevo na frente, em outra cor. Imprime em pé.
 */
export function buildDeskOrganizer({ M, text }: ModelCtx, p: DeskOrganizerParams): ModelOutput {
  return scoped((k) => {
    const warnings: string[] = [];
    const innerW = p.length - 2 * p.wall, innerD = p.depth - 2 * p.wall;
    // retângulos dos compartimentos (x0, y0, largura, profundidade), no plano, dentro das paredes
    let cells: [number, number, number, number][];
    if (p.mode === "grid") {
      const cw = (innerW - (p.cols - 1) * p.wall) / p.cols, cd = (innerD - (p.rows - 1) * p.wall) / p.rows;
      cells = Array.from({ length: p.cols * p.rows }, (_, i) => [-innerW / 2 + (i % p.cols) * (cw + p.wall), -innerD / 2 + Math.floor(i / p.cols) * (cd + p.wall), cw, cd]);
    } else {
      const ws = parseWidths(p.widths);
      const parts = ws.length ? ws : [1];
      if (!ws.length) warnings.push("Larguras inválidas: saiu um compartimento só. Use números separados por vírgula, ex.: 1, 1, 2.");
      const free = innerW - (parts.length - 1) * p.wall;
      const sum = parts.reduce((a, b) => a + b, 0);
      let x = -innerW / 2;
      cells = parts.map((w) => {
        const cw = (free * w) / sum;
        const c: [number, number, number, number] = [x, -innerD / 2, cw, innerD];
        x += cw + p.wall;
        return c;
      });
    }
    if (cells.some(([, , w, d]) => w < 10 || d < 10)) warnings.push("Algum compartimento ficou com menos de 1 cm: aumente o tamanho ou use menos divisões.");

    let body = k(k(roundedRect(M, p.length, p.depth, CORNER)).extrude(p.height));
    for (const [x, y, w, d] of cells) {
      if (w <= 0 || d <= 0) continue;
      body = k(body.subtract(k(k(M.Manifold.cube([w, d, p.height])).translate([x, y, p.floor]))));
      if (p.drain) body = k(body.subtract(k(k(M.Manifold.cylinder(p.floor + 2, DRAIN_R, DRAIN_R, 24)).translate([x + w / 2, y + d / 2, -1]))));
    }
    const parts: Part[] = [{ name: "Organizador", color: p.bodyColor, mesh: solidMesh(body) }];

    const raw = text(p.name, p.nameHeight);
    if (raw) {
      const cs = k(fitInto(k(raw), p.length - 2 * NAME_MARGIN, Math.min(p.nameHeight, p.height - 2 * NAME_MARGIN), 0));
      // de pé na frente: Y do texto vira altura, o relevo sai para −Y
      const name = k(k(k(cs.extrude(p.relief)).rotate([90, 0, 0])).translate([0, -p.depth / 2, p.height / 2]));
      parts.push({ name: "Nome", color: p.nameColor, mesh: solidMesh(name) });
    }
    return { models: [{ name: "Organizador", parts }], warnings };
  });
}
