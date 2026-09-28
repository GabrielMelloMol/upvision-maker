import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { artParts, moveModel, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { nfcLayout } from "./nfcKeychain";
import { trophyBase } from "./trophy";

export type NfcTotemParams = {
  title: string;
  text: string;
  baseText: string;
  width: number;
  height: number;
  tagDiameter: number;
  tagThickness: number;
  layerHeight: number;
  relief: number;
  plateColor: string;
  accentColor: string;
};

export const DEFAULT_NFC_TOTEM: NfcTotemParams = {
  title: "Nos avalie",
  text: "Aproxime o celular",
  baseText: "",
  width: 80,
  height: 110,
  tagDiameter: 25,
  tagThickness: 0.8,
  layerHeight: 0.2,
  relief: 0.8,
  plateColor: "#f8f8f6",
  accentColor: "#1c1c1e",
};

const TAG_CLEARANCE = 1.5;
const TAB_H = 8;
const MARGIN = 6;

/**
 * Totem NFC de balcão: placa em pé com arte no topo, textos e a tag NFC embutida (pausa para colocar),
 * que encaixa numa base. A área da tag é marcada por um anel em relevo ("encoste aqui").
 */
export function buildNfcTotem(ctx: ModelCtx, p: NfcTotemParams): ModelOutput {
  const { M, text, art } = ctx;
  const L = nfcLayout(p);
  const T = Math.max(L.height, 3);
  const hole = p.tagDiameter + TAG_CLEARANCE;
  if (p.width < hole + 2 * MARGIN) throw new Error(`Para uma tag de ${p.tagDiameter} mm o totem precisa de pelo menos ${Math.ceil(hole + 2 * MARGIN)} mm de largura.`);
  const tabW = p.width * 0.4;
  const plate = scoped((k) => {
    const body = k(roundedRect(M, p.width, p.height, 6));
    const tab = k(k(M.CrossSection.square([tabW, TAB_H + 2], true)).translate([0, -p.height / 2 - TAB_H / 2 + 1]));
    const tagY = -p.height / 2 + MARGIN + hole / 2 + 4;
    const pocket = k(k(k(M.CrossSection.circle(hole / 2, 96)).extrude(L.top - L.bottom)).translate([0, tagY, L.bottom]));
    const solid = k(k(k(body.add(tab)).extrude(T)).subtract(pocket));
    const mark = k(k(k(M.CrossSection.circle(hole / 2 + 1.2, 96)).subtract(k(M.CrossSection.circle(hole / 2, 96)))).translate([0, tagY]));
    const inner = k(body.offset(-MARGIN, "Round"));
    const iw = p.width - 2 * MARGIN;
    const textsTop = tagY + hole / 2 + 4;
    const ib = inner.bounds();
    const titleH = iw * 0.16;
    const lineH = iw * 0.1;
    const line = (s: string, h: number, cy: number) => {
      const raw = text(s, h);
      return raw ? k(fitInto(k(raw), iw, h, cy)) : null;
    };
    const cs = [line(p.title, titleH, textsTop + lineH + 3 + titleH / 2), line(p.text, lineH, textsTop + lineH / 2)].filter((c) => c !== null);
    const parts = [
      { name: "Placa", color: p.plateColor, mesh: solidMesh(solid) },
      { name: "Textos", color: p.accentColor, mesh: slab(k(M.CrossSection.union([mark, ...cs])), p.relief, T) },
    ];
    const artTop = textsTop + lineH + 3 + titleH + 4;
    if (art && ib.max[1] - artTop > 10) {
      const h = ib.max[1] - artTop;
      const placed = k(shrinkToFit(k(fitInto(art, iw, h, artTop + h / 2)), inner));
      parts.push(...artParts(ctx, placed, p.accentColor, "Arte", p.relief, T));
    }
    return { name: "Totem", parts };
  });
  const base = trophyBase(ctx, { width: p.width + 20, tabW, thickness: T, relief: p.relief, lines: [p.baseText], compact: false, baseColor: p.accentColor, textColor: p.plateColor });
  const z = L.pauseZ.toFixed(2).replace(".", ",");
  return {
    models: [plate, moveModel(base, 0, -(p.height / 2 + TAB_H + 40))],
    pauses: [L.pauseZ],
    warnings: [`Pausa em Z = ${z} mm: coloque a tag NFC (grave o link de avaliação antes) e retome.`],
  };
}
