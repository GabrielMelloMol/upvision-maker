import { outerOnly, fitInto, scoped } from "../shape2d";
import { moveMesh, requireArt, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type EjectorParams = {
  size: number; // largura do desenho
  height: number; // altura da forma
  wall: number;
  clearance: number; // folga entre o ejetor e a forma
  frameColor: string;
  ejectorColor: string;
};

export const DEFAULT_EJECTOR: EjectorParams = { size: 30, height: 18, wall: 1.6, clearance: 0.4, frameColor: "#f472b6", ejectorColor: "#f8f8f6" };

const LIP_W = 3;
const LIP_H = 1.6;
const PLATE_H = 2.5;
const STEM_R = 3.5;
const KNOB_R = 8;
const KNOB_H = 2.5;
const FLARE_H = 4.5; // alarga o cabo em ~45° até o botão: imprime sem suporte
const GAP = 8;

/**
 * Ejetor de brigadeiro: forma no contorno do desenho (tubo com aba) e êmbolo que desliza dentro dela,
 * com haste e botão. A forma imprime com a aba na mesa; o êmbolo com a placa na mesa.
 */
export function buildEjector({ M, art }: ModelCtx, p: EjectorParams): ModelOutput {
  const src = requireArt(art);
  return scoped((k) => {
    const shape = k(outerOnly(M, k(fitInto(src, p.size, p.size, 0))));
    const wall = k(k(shape.offset(p.wall, "Round")).subtract(shape));
    const lip = k(k(shape.offset(p.wall + LIP_W, "Round")).subtract(shape));
    const frame = k(M.Manifold.union(k(wall.extrude(p.height)), k(lip.extrude(LIP_H))));
    const plate = k(shape.offset(-p.clearance, "Round"));
    if (plate.isEmpty()) throw new Error("Desenho pequeno demais para o ejetor.");
    const b = plate.bounds();
    const c: [number, number] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    const stemH = p.height + 4;
    const stem = k(M.Manifold.cylinder(stemH, STEM_R, STEM_R, 32));
    const flare = k(k(M.Manifold.cylinder(FLARE_H, STEM_R, KNOB_R, 48)).translate([0, 0, stemH]));
    const knob = k(k(M.Manifold.cylinder(KNOB_H, KNOB_R, KNOB_R, 48)).translate([0, 0, stemH + FLARE_H]));
    const handle = k(k(M.Manifold.union([stem, flare, knob])).translate([c[0], c[1], PLATE_H]));
    const ejector = k(k(plate.extrude(PLATE_H)).add(handle));
    const fb = frame.boundingBox();
    const eb = ejector.boundingBox();
    return {
      models: [
        { name: "Forma", parts: [{ name: "Forma", color: p.frameColor, mesh: solidMesh(frame) }] },
        { name: "Ejetor", parts: [{ name: "Ejetor", color: p.ejectorColor, mesh: moveMesh(solidMesh(ejector), fb.max[0] - eb.min[0] + KNOB_R + GAP, 0) }] },
      ],
    };
  });
}
