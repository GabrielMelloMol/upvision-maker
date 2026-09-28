import { fitInto, scoped } from "../shape2d";
import { moveMesh, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { nfcLayout } from "./nfcKeychain";

export type NfcJewelryParams = {
  diameter: number;
  height: number; // altura da base (pote)
  text: string;
  text2: string;
  tagDiameter: number;
  tagThickness: number;
  layerHeight: number;
  clearance: number; // folga do encaixe da tampa
  relief: number;
  bodyColor: string;
  textColor: string;
};

export const DEFAULT_NFC_JEWELRY: NfcJewelryParams = {
  diameter: 60,
  height: 20,
  text: "Ana",
  text2: "",
  tagDiameter: 25,
  tagThickness: 0.8,
  layerHeight: 0.2,
  clearance: 0.25,
  relief: 0.8,
  bodyColor: "#1c1c1e",
  textColor: "#f5c542",
};

const WALL = 2.4;
const FLOOR = 2;
const COLLAR_W = 1.6;
const COLLAR_H = 2;
const RIM_W = 2.5;
const HUB_R = 5;
const TAG_CLEARANCE = 1.5;
const GAP = 8;

/**
 * Anilha porta-joia com NFC: pote redondo com gola no topo e tampa (cara de anilha de academia) com bolsão
 * para a tag NFC e pausa para colocá-la. A tampa encaixa na gola pelo sulco de baixo.
 */
export function buildNfcJewelry({ M, text }: ModelCtx, p: NfcJewelryParams): ModelOutput {
  const R = p.diameter / 2;
  const hole = p.tagDiameter + TAG_CLEARANCE;
  const grooveIn = R - WALL - COLLAR_W - p.clearance;
  if (hole / 2 + 1.5 > grooveIn) throw new Error(`Para uma tag de ${p.tagDiameter} mm a anilha precisa de pelo menos ${Math.ceil(2 * (hole / 2 + 1.5 + WALL + COLLAR_W + p.clearance))} mm.`);
  const L = nfcLayout(p);
  const lidH = Math.max(L.height, COLLAR_H + p.clearance + 1.2);
  return scoped((k) => {
    const disc = k(M.CrossSection.circle(R, 96));
    const ring = (r0: number, r1: number) => k(k(M.CrossSection.circle(r1, 96)).subtract(k(M.CrossSection.circle(r0, 96))));
    const cup = k(k(k(disc.extrude(p.height)).subtract(k(k(k(M.CrossSection.circle(R - WALL, 96)).extrude(p.height)).translate([0, 0, FLOOR])))).add(k(k(ring(R - WALL - COLLAR_W, R - WALL + 0.01).extrude(COLLAR_H)).translate([0, 0, p.height]))));
    const groove = k(ring(R - WALL - COLLAR_W - p.clearance, R - WALL + p.clearance).extrude(COLLAR_H + p.clearance));
    const pocket = k(k(k(M.CrossSection.circle(hole / 2, 96)).extrude(L.top - L.bottom)).translate([0, 0, L.bottom]));
    const lid = k(k(k(disc.extrude(lidH)).subtract(groove)).subtract(pocket));
    const deco = k(ring(R - RIM_W, R).add(k(M.CrossSection.circle(HUB_R, 48))));
    const lines = [p.text, p.text2].map((t) => t.trim()).filter(Boolean);
    const inner = (R - RIM_W - 2) * 2;
    const lineH = Math.min(inner * 0.2, 12);
    const txt = lines
      .map((l, i) => {
        const raw = text(l, lineH);
        const cy = lines.length > 1 ? (i === 0 ? 1 : -1) * (HUB_R + 2 + lineH / 2) : HUB_R + 2 + lineH / 2;
        return raw ? k(fitInto(k(raw), inner * 0.7, lineH, cy)) : null;
      })
      .filter((c) => c !== null);
    const dx = p.diameter + GAP;
    const lidParts = [
      { name: "Tampa", color: p.bodyColor, mesh: moveMesh(solidMesh(lid), dx, 0) },
      { name: "Anilha", color: p.textColor, mesh: moveMesh(slab(deco, p.relief, lidH), dx, 0) },
    ];
    if (txt.length) lidParts.push({ name: "Texto", color: p.textColor, mesh: moveMesh(slab(k(M.CrossSection.union(txt)), p.relief, lidH), dx, 0) });
    const z = L.pauseZ.toFixed(2).replace(".", ",");
    return {
      models: [
        { name: "Pote", parts: [{ name: "Pote", color: p.bodyColor, mesh: solidMesh(cup) }] },
        { name: "Tampa", parts: lidParts },
      ],
      pauses: [L.pauseZ],
      warnings: [
        `Pausa em Z = ${z} mm: coloque a tag no bolsão da tampa e retome. Se o pote estiver na mesma mesa, ele só espera junto.`,
        "A tampa imprime com o sulco para baixo (ponte curta) e encaixa na gola do pote.",
      ],
    };
  });
}
