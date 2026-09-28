import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { artParts, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type OpenerParams = {
  kind: "bottle" | "can";
  thickness: number;
  relief: number;
  text: string;
  bodyColor: string;
  artColor: string;
};

export const DEFAULT_OPENER: OpenerParams = { kind: "bottle", thickness: 6, relief: 1, text: "Ana", bodyColor: "#1c1c1e", artColor: "#f5c542" };

const L = 78;
const W = 32;
const CAP_R = 13; // tampinha tem ~32 mm; o furo pega a borda dela
const LIP = 5; // "dente" reto que prende a borda da tampinha
const RING_R = 4.5;
const RING_HOLE = 2.2;
const CAN_TIP = 2.2; // espessura da ponta da rampa do abridor de lata
const CAN_RAMP = 18;
const CAN_SLOT = [17, 6] as const; // abertura para enganchar o anel da lata

/**
 * Chaveiro abridor. Garrafa: furo com dente reto numa ponta (encaixa na borda da tampinha e alavanca).
 * Lata: ponta em rampa fina que entra sob o anel da lata, com abertura para enganchar. Arte na outra ponta.
 */
export function buildOpener(ctx: ModelCtx, p: OpenerParams): ModelOutput {
  const { M, text, art } = ctx;
  return scoped((k) => {
    const body = k(roundedRect(M, L, W, W / 2 - 1));
    const ringC: [number, number] = [-L / 2 - RING_R + 2, 0];
    let outline = k(body.add(k(k(M.CrossSection.circle(RING_R + 1.5, 48)).translate(ringC))));
    outline = k(outline.subtract(k(k(M.CrossSection.circle(RING_HOLE, 32)).translate(ringC))));
    const endX = L / 2 - W / 2;
    let solid;
    if (p.kind === "bottle") {
      const hole = k(k(k(M.CrossSection.circle(CAP_R, 64)).intersect(k(k(M.CrossSection.square([2 * CAP_R, 2 * CAP_R], true)).translate([-LIP, 0])))).translate([endX, 0]));
      solid = k(k(outline.subtract(hole)).extrude(p.thickness));
    } else {
      const slot = k(k(roundedRect(M, CAN_SLOT[1], CAN_SLOT[0], 2)).translate([L / 2 - 9, 0]));
      const flat = k(k(outline.subtract(slot)).extrude(p.thickness));
      // rampa: tira material de cima na ponta, descendo até CAN_TIP
      const x0 = L / 2 - CAN_RAMP;
      const wedge = k(
        k(new M.CrossSection([[[x0, p.thickness + 1], [L / 2 + 1, p.thickness + 1], [L / 2 + 1, CAN_TIP]]], "NonZero").extrude(W + 2)).rotate([90, 0, 0]),
      );
      solid = k(flat.subtract(k(wedge.translate([0, W / 2 + 1, 0]))));
    }
    const parts = [{ name: "Abridor", color: p.bodyColor, mesh: solidMesh(solid) }];
    const area = k(k(roundedRect(M, L - 2 * W + 4, W - 8, 4)).translate([-W / 2 + 2, 0]));
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (src) {
      const b = area.bounds();
      const placed = k(shrinkToFit(k(fitInto(src, b.max[0] - b.min[0], b.max[1] - b.min[1], 0)), area));
      parts.push(...artParts(ctx, k(placed.translate([(b.min[0] + b.max[0]) / 2 - (placed.bounds().min[0] + placed.bounds().max[0]) / 2, 0])), p.artColor, "Arte", p.relief, p.thickness));
    }
    return {
      models: [{ name: p.kind === "bottle" ? "Abridor de garrafa" : "Abridor de lata", parts }],
      warnings: ["Peça que faz força: imprima com 4+ paredes e 40%+ de preenchimento; PETG aguenta mais que PLA."],
    };
  });
}
