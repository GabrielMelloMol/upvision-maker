import type { GuideDef } from "./fields";
import { FAMILY_HELP } from "./help/familyHelp";

/**
 * Canopla de microfone (#274): os microfones vêm das fichas oficiais (sem ímã ou clipe, que não têm medida publicada);
 * o tema fica no campo Formato (a sugestão troca tudo, então o microfone vem primeiro). Fontes no estudo `documentos/docs/2026-10-24-estudo-microfone-resultado.md`.
 */
export const MIC_GUIDE: GuideDef = {
  presetsLabel: "Comece pelo microfone",
  presets: [
    { id: "larkM2", label: "Hollyland Lark M2", blurb: "Redondo, Ø31,7 × 12,3 mm: medido no modelo de referência, feito com o microfone de verdade.", patch: { micW: 31.7, micH: 31.7, micT: 12.3, micRound: true } },
    { id: "larkA1", label: "Hollyland Lark A1", blurb: "Retangular de 30 × 16,3 × 8,8 mm (ficha da Hollyland).", patch: { micW: 30, micH: 16.3, micT: 8.8, micRound: false } },
    { id: "djiMini", label: "DJI Mic Mini", blurb: "Quase quadrado, 26,55 × 26,06 × 15,96 mm (ficha da DJI).", patch: { micW: 26.55, micH: 26.06, micT: 15.96, micRound: false } },
  ],
  help: FAMILY_HELP.micHolder,
};
