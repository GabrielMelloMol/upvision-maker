import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { artParts, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { nfcLayout } from "./nfcKeychain";

export type OpenerParams = {
  kind: "bottle" | "can";
  thickness: number;
  relief: number;
  text: string;
  bodyColor: string;
  artColor: string;
  /** Lata: posição (mm, a partir da posição padrão) e giro da fenda (#69). */
  slotX?: number;
  slotY?: number;
  slotAngle?: number;
  /** Bolso para tag NFC embutida, com pausa (#69). */
  nfc?: boolean;
  tagDiameter?: number;
  tagThickness?: number;
  layerHeight?: number;
};

export const DEFAULT_OPENER: OpenerParams = {
  kind: "bottle",
  thickness: 6,
  relief: 1,
  text: "Ana",
  bodyColor: "#1c1c1e",
  artColor: "#f5c542",
  slotX: 0,
  slotY: 0,
  slotAngle: 0,
  nfc: false,
  tagDiameter: 25,
  tagThickness: 0.8,
  layerHeight: 0.2,
};
const TAG_CLEARANCE = 1.5;
const SLOT_WALL = 1.5; // a fenda precisa ficar a esta distância da borda

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
    const warnings: string[] = [];
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
      const slot = k(k(k(roundedRect(M, CAN_SLOT[1], CAN_SLOT[0], 2)).rotate(p.slotAngle ?? 0)).translate([L / 2 - 9 + (p.slotX ?? 0), p.slotY ?? 0]));
      if (!k(slot.subtract(k(body.offset(-SLOT_WALL, "Round")))).isEmpty()) warnings.push("A fenda encosta na borda: aproxime do centro ou gire menos.");
      const flat = k(k(outline.subtract(slot)).extrude(p.thickness));
      // rampa: tira material de cima na ponta, descendo até CAN_TIP
      const x0 = L / 2 - CAN_RAMP;
      const wedge = k(
        k(new M.CrossSection([[[x0, p.thickness + 1], [L / 2 + 1, p.thickness + 1], [L / 2 + 1, CAN_TIP]]], "NonZero").extrude(W + 2)).rotate([90, 0, 0]),
      );
      solid = k(flat.subtract(k(wedge.translate([0, W / 2 + 1, 0]))));
    }
    const pauses: number[] = [];
    if (p.nfc) {
      // bolso fechado no meio da espessura, sob a arte; a impressora pausa para colocar a tag
      const lay = nfcLayout({ tagThickness: p.tagThickness ?? 0.8, layerHeight: p.layerHeight ?? 0.2 });
      const r = ((p.tagDiameter ?? 25) + TAG_CLEARANCE) / 2;
      const cx = p.kind === "bottle" ? -W / 2 + 2 : -W / 2 - 2;
      const room = k(body.offset(-SLOT_WALL, "Round"));
      const disc = k(k(M.CrossSection.circle(r, 96)).translate([cx, 0]));
      if (!k(disc.subtract(room)).isEmpty()) throw new Error(`A tag de ${p.tagDiameter} mm não cabe no abridor: use uma tag de até ${Math.floor(W - 2 * SLOT_WALL - TAG_CLEARANCE)} mm.`);
      solid = k(solid.subtract(k(k(disc.extrude(lay.top - lay.bottom)).translate([0, 0, lay.bottom]))));
      pauses.push(lay.pauseZ);
      warnings.push(`Pausa em Z = ${lay.pauseZ.toFixed(2).replace(".", ",")} mm: coloque a tag NFC no bolso e retome.`);
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
      pauses,
      warnings: ["Peça que faz força: imprima com 4+ paredes e 40%+ de preenchimento; PETG aguenta mais que PLA.", ...warnings],
    };
  });
}
