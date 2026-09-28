import { fitInto, scoped } from "../shape2d";
import { roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type NfcKeychainParams = {
  shape: "circle" | "square";
  size: number;
  tagDiameter: number;
  tagThickness: number;
  layerHeight: number;
  relief: number;
  text: string;
  baseColor: string;
  textColor: string;
};

export const DEFAULT_NFC: NfcKeychainParams = {
  shape: "circle",
  size: 38,
  tagDiameter: 25,
  tagThickness: 0.8,
  layerHeight: 0.2,
  relief: 0.8,
  text: "Ana",
  baseColor: "#ffffff",
  textColor: "#2563eb",
};

const TAG_CLEARANCE = 1.5; // folga no diâmetro
const FLOOR_MM = 0.8;
const COVER_MM = 1.2;
const DEPTH_EXTRA = 0.2;
const TAB_R = 4.5;
const TAB_HOLE_R = 2.2;
export const NFC_MIN_WALL = 2;

/** Arredonda para cima até um múltiplo da altura de camada (com tolerância numérica). */
const toLayers = (mm: number, lh: number) => Math.ceil(mm / lh - 1e-6) * lh;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Onde fica o bolsão da tag e em que altura pausar (antes da 1ª camada acima dele). */
export function nfcLayout(p: Pick<NfcKeychainParams, "tagThickness" | "layerHeight">) {
  const lh = p.layerHeight;
  const bottom = round3(toLayers(FLOOR_MM, lh));
  const top = round3(bottom + toLayers(p.tagThickness + DEPTH_EXTRA, lh));
  const height = round3(top + toLayers(COVER_MM, lh));
  return { bottom, top, height, pauseZ: round3(top + lh) };
}

/**
 * Chaveiro com tag NFC embutida: bolsão fechado no meio da peça e pausa no 3MF logo depois da última
 * camada do bolsão — a impressora para, você encaixa a tag e ela é coberta pelas camadas seguintes.
 */
export function buildNfcKeychain({ M, text }: ModelCtx, p: NfcKeychainParams): ModelOutput {
  const hole = p.tagDiameter + TAG_CLEARANCE;
  if (p.size < hole + 2 * NFC_MIN_WALL) throw new Error(`Para uma tag de ${p.tagDiameter} mm o chaveiro precisa ter pelo menos ${Math.ceil(hole + 2 * NFC_MIN_WALL)} mm.`);
  const L = nfcLayout(p);
  return scoped((k) => {
    const outline = k(p.shape === "circle" ? M.CrossSection.circle(p.size / 2, 96) : roundedRect(M, p.size, p.size, 5));
    const ty = p.size / 2 + TAB_R - 1.5;
    const tab = k(k(M.CrossSection.circle(TAB_R, 48)).translate([0, ty]));
    const body2d = k(k(outline.add(tab)).subtract(k(k(M.CrossSection.circle(TAB_HOLE_R, 32)).translate([0, ty]))));
    const pocket = k(k(k(M.CrossSection.circle(hole / 2, 96)).extrude(L.top - L.bottom)).translate([0, 0, L.bottom]));
    const body = k(k(body2d.extrude(L.height)).subtract(pocket));
    const parts = [{ name: "Base", color: p.baseColor, mesh: solidMesh(body) }];
    const raw = text(p.text, 100);
    if (raw) parts.push({ name: "Texto", color: p.textColor, mesh: slab(k(fitInto(k(raw), p.size * 0.72, p.size * 0.35, 0)), p.relief, L.height) });
    const z = L.pauseZ.toFixed(2).replace(".", ",");
    return {
      models: [{ name: "Chaveiro NFC", parts }],
      pauses: [L.pauseZ],
      warnings: [
        `Pausa em Z = ${z} mm: a impressora para, você coloca a tag no bolsão e retoma.`,
        `OrcaSlicer e PrusaSlicer já abrem com a pausa. Para o Bambu Studio, use “Projeto do Bambu Studio (pausa pronta)”.`,
      ],
    };
  });
}
