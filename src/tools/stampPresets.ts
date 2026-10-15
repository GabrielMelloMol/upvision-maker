import type { StampAlign, StampParams } from "../geometry/stamp";
import type { StampFrame, StampLayout } from "../geometry/stampArt";

/** O que um modelo de uso preenche no Carimbo seco; o resto fica como a pessoa deixou. */
export type StampPreset = {
  id: string;
  label: string;
  hint: string;
  text: string;
  font: string;
  layout?: StampLayout;
  frame: StampFrame;
  arcTop?: string;
  arcBottom?: string;
  p: Partial<StampParams> & { align: StampAlign };
};

export const STAMP_PRESETS: StampPreset[] = [
  {
    id: "wedding",
    label: "Convite de casamento",
    hint: "Selo redondo com os nomes em volta e a inicial no meio. Ímãs deixam carimbar no meio do convite.",
    text: "A & B",
    font: "great-vibes",
    frame: "seal",
    arcTop: "ANA & BRUNO",
    arcBottom: "12 · 10 · 2027",
    p: { shape: "round", w: 45, h: 45, paper: 0.6, relief: 1.2, align: "magnets" },
  },
  {
    id: "card",
    label: "Cartão de visita",
    hint: "Marca discreta em retângulo, para cartão de 300 g. Ímãs: o cartão pode ser maior que a placa.",
    text: "Seu Nome|@seuperfil",
    font: "montserrat",
    frame: "line",
    p: { shape: "rect", w: 50, h: 30, paper: 0.6, relief: 1, align: "magnets" },
  },
  {
    id: "tag",
    label: "Embalagem / tag",
    hint: "Selo pequeno para etiqueta e papel de embrulho. Pinos: o papel precisa caber entre eles.",
    text: "Feito|à mão",
    font: "pacifico",
    frame: "line",
    p: { shape: "round", w: 30, h: 30, paper: 0.5, relief: 1, align: "pins" },
  },
  {
    id: "exlibris",
    label: "Livro (ex-libris)",
    hint: "Para a folha de rosto. Dobradiça: fecha como um livro e a folha sai livre pelos outros lados.",
    text: "EX LIBRIS|Maria Souza",
    font: "cinzel",
    frame: "line",
    p: { shape: "rect", w: 50, h: 60, paper: 0.5, relief: 1.2, align: "hinge" },
  },
];
