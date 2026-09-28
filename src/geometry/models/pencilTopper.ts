import { fitInto, scoped } from "../shape2d";
import { backing, slab, solidMesh, type ModelCtx, type ModelOutput, MissingInput } from "./common";

export type PencilTopperParams = {
  text: string;
  textHeight: number;
  maxWidth: number;
  holeD: number; // furo do lápis (folga incluída)
  body: number; // espessura do corpo
  relief: number;
  border: number;
  bodyColor: string;
  textColor: string;
};

export const DEFAULT_PENCIL_TOPPER: PencilTopperParams = {
  text: "Ana",
  textHeight: 12,
  maxWidth: 50,
  holeD: 7.8,
  body: 12,
  relief: 1.4,
  border: 2.4,
  bodyColor: "#f97316",
  textColor: "#ffffff",
};

const NECK_WALL = 2;
const NECK_LEN = 14;
const HOLE_INTO_BODY = 4;
const MIN_SIDE_WALL = 1.2;

/**
 * Topo de lápis: nome em relevo sobre um corpo grosso com "pescoço" embaixo; o furo do lápis entra pelo pescoço.
 * Impresso deitado (furo na horizontal, sem suporte).
 */
export function buildPencilTopper({ M, text }: ModelCtx, p: PencilTopperParams): ModelOutput {
  if (p.body < p.holeD + 2 * MIN_SIDE_WALL) throw new Error(`O corpo precisa ter pelo menos ${(p.holeD + 2 * MIN_SIDE_WALL).toFixed(1).replace(".", ",")} mm para o furo de ${String(p.holeD).replace(".", ",")} mm.`);
  return scoped((k) => {
    const raw = text(p.text, p.textHeight);
    if (!raw) throw new MissingInput("Digite o nome.");
    const letters = k(fitInto(k(raw), p.maxWidth, p.textHeight, 0));
    const plate = k(backing(M, letters, p.border));
    const bottom = plate.bounds().min[1];
    const neckW = p.holeD + 2 * NECK_WALL;
    const neck = k(k(M.CrossSection.square([neckW, NECK_LEN + p.border], true)).translate([0, bottom - NECK_LEN / 2 + p.border / 2]));
    const outline = k(plate.add(neck));
    const yStart = bottom - NECK_LEN;
    const depth = NECK_LEN + HOLE_INTO_BODY;
    const hole = k(k(k(M.Manifold.cylinder(depth + 1, p.holeD / 2, p.holeD / 2, 48)).rotate([-90, 0, 0])).translate([0, yStart - 1, p.body / 2]));
    const body = k(k(outline.extrude(p.body)).subtract(hole));
    return {
      models: [
        {
          name: p.text.trim(),
          parts: [
            { name: "Corpo", color: p.bodyColor, mesh: solidMesh(body) },
            { name: "Texto", color: p.textColor, mesh: slab(letters, p.relief, p.body) },
          ],
        },
      ],
      warnings: [`Furo de ${String(p.holeD).replace(".", ",")} mm: lápis comum tem ~7,5 mm. Se ficar justo ou folgado, ajuste e imprima de novo.`],
    };
  });
}
