import { MIC_SHAPE_WIDTH } from "../../geometry/models/micHolder";
import type { GuideDef } from "./fields";
import { FAMILY_HELP } from "./help/familyHelp";

/**
 * Canopla de microfone (#274): os microfones vêm das fichas oficiais (sem ímã ou clipe, que não têm medida publicada) e
 * os temas trocam só o formato e o texto. Fontes no estudo `documentos/docs/2026-10-24-estudo-microfone-resultado.md`.
 */
export const MIC_GUIDE: GuideDef = {
  presetsLabel: "Comece pelo microfone ou pelo tema",
  presets: [
    { id: "larkM2", label: "Hollyland Lark M2", blurb: "Botão redondo de Ø26 × 9,9 mm (ficha da Hollyland).", patch: { micW: 26, micH: 26, micT: 9.9, micRound: true } },
    { id: "larkA1", label: "Hollyland Lark A1", blurb: "Retangular de 30 × 16,3 × 8,8 mm (ficha da Hollyland).", patch: { micW: 30, micH: 16.3, micT: 8.8, micRound: false } },
    { id: "djiMini", label: "DJI Mic Mini", blurb: "Quase quadrado, 26,55 × 26,06 × 15,96 mm (ficha da DJI).", patch: { micW: 26.55, micH: 26.06, micT: 15.96, micRound: false } },
    { id: "architect", label: "Arquiteto", blurb: "Meio em forma de casa.", patch: { shape: "house", width: MIC_SHAPE_WIDTH.house, front: "text", text: "ARQ" } },
    { id: "gym", label: "Academia", blurb: "Meio em forma de halter.", patch: { shape: "dumbbell", width: MIC_SHAPE_WIDTH.dumbbell, front: "text", text: "FIT" } },
    { id: "health", label: "Saúde", blurb: "Cruz arredondada, para médico, dentista ou enfermagem.", patch: { shape: "medical", width: MIC_SHAPE_WIDTH.medical, front: "text", text: "Dra." } },
    { id: "podcast", label: "Podcast", blurb: "Balão de fala com o nome do programa.", patch: { shape: "podcast", width: MIC_SHAPE_WIDTH.podcast, front: "text", text: "PODCAST" } },
    { id: "teacher", label: "Professor", blurb: "Livro aberto.", patch: { shape: "book", width: MIC_SHAPE_WIDTH.book, front: "text", text: "PROF" } },
  ],
  help: FAMILY_HELP.micHolder,
};
