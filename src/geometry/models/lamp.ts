import { fitInto, outerOnly, scoped } from "../shape2d";
import { backing, moveMesh, slab, solidMesh, type ModelCtx, type ModelOutput, MissingInput } from "./common";

export type LampParams = {
  text: string; // sem desenho, a luminária é do texto
  width: number;
  depth: number; // profundidade da caixa (espaço da fita de LED)
  margin: number; // margem estrutural em volta da arte
  clearance: number; // folga da tampa traseira
  frameColor: string;
  diffuserColor: string;
};

export const DEFAULT_LAMP: LampParams = { text: "LOVE", width: 160, depth: 22, margin: 8, clearance: 0.2, frameColor: "#1c1c1e", diffuserColor: "#f8f8f6" };

const DIFFUSER = 0.8;
const FRONT = 1.6;
const WALL = 2;
const BACK = 2;
const LIP_H = 5;
const LIP_W = 1.6;
const CABLE: [number, number] = [15, 10];
const KEY_R = 4.5;
const KEY_SLOT_R = 2.25;
const GAP = 10;

/**
 * Luminária: caixa no contorno da arte; na frente, a arte vazada sobre um difusor fino (0,8 mm, filamento branco)
 * que acende com LED por dentro. Tampa traseira com lábio de encaixe, passagem de cabo e furo de fechadura para parede.
 * A frente imprime de cara para a mesa (difusor na 1ª camada).
 */
export function buildLamp({ M, text, art }: ModelCtx, p: LampParams): ModelOutput {
  return scoped((k) => {
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (!src) throw new MissingInput("Digite o texto ou envie um desenho.");
    const glow = k(fitInto(src, p.width - 2 * p.margin, 1e6, 0));
    const outline = k(outerOnly(M, k(backing(M, glow, p.margin))));
    const inner = k(outline.offset(-WALL, "Round"));
    if (inner.isEmpty()) throw new Error("Luminária pequena demais para a parede.");
    const ob = outline.bounds();
    const cableCut = k(k(M.Manifold.cube([CABLE[0], WALL * 4, CABLE[1]], true)).translate([0, ob.min[1], p.depth - CABLE[1] / 2 + 0.01]));
    const walls = k(k(k(k(outline.subtract(inner)).extrude(p.depth - DIFFUSER)).translate([0, 0, DIFFUSER])).subtract(cableCut));
    const front = k(k(k(inner.subtract(glow)).extrude(FRONT)).translate([0, 0, DIFFUSER]));
    const body = k(walls.add(front));
    const lid2d = k(inner.offset(-p.clearance, "Round"));
    const lip = k(k(k(lid2d.subtract(k(lid2d.offset(-LIP_W, "Round")))).extrude(LIP_H)).translate([0, 0, BACK]));
    const keyY = ob.max[1] - p.margin - KEY_R * 2;
    const keyhole = k(k(M.CrossSection.union([k(M.CrossSection.circle(KEY_R, 32)), k(k(M.CrossSection.square([KEY_SLOT_R * 2, KEY_R * 2], true)).translate([0, KEY_R])), k(k(M.CrossSection.circle(KEY_SLOT_R, 32)).translate([0, KEY_R * 2]))])).translate([0, keyY]));
    const lid = k(k(k(outline.subtract(keyhole)).extrude(BACK)).add(lip));
    const lb = lid.boundingBox();
    return {
      models: [
        {
          name: "Luminária",
          parts: [
            { name: "Difusor", color: p.diffuserColor, mesh: slab(outline, DIFFUSER) },
            { name: "Caixa", color: p.frameColor, mesh: solidMesh(body) },
          ],
        },
        { name: "Tampa", parts: [{ name: "Tampa", color: p.frameColor, mesh: moveMesh(solidMesh(lid), 0, ob.min[1] - lb.max[1] - GAP) }] },
      ],
      warnings: ["Use filamento branco no difusor (1ª camada). Cabe fita de LED de até " + (p.depth - DIFFUSER - FRONT - 2).toFixed(0) + " mm de altura."],
    };
  });
}
