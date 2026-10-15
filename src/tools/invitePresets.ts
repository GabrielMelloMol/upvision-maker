import type { ButterflyMode } from "../geometry/invite/build";
import type { CardText } from "../geometry/invite/card";
import type { LacePattern } from "../geometry/invite/lace";

/** O que um modelo pronto preenche no Convite envelope; o resto fica como a pessoa deixou. */
export type InvitePreset = {
  id: string;
  label: string;
  hint: string;
  text: CardText;
  nameFont: string;
  textFont: string;
  palette: string;
  pattern: LacePattern;
  butterfly: ButterflyMode;
  flowers: number;
  /** Nomes das variações (uma por linha), se o modelo é para várias pessoas. */
  names?: string;
  palettes?: string[];
};

export const INVITE_PRESETS: InvitePreset[] = [
  { id: "xv", label: "XV anos", hint: "Rosa, flores e borboleta em relevo, como o convite de debutante.", text: { name: "Amanda", title: "XV anos", phrase: "Uma noite cheia de glamour,\nbrilho e a minha ilustre presença", date: "06.12.26", place: "Palácio dos Lírios" }, nameFont: "playfair", textFont: "montserrat", palette: "rosa", pattern: "floral", butterfly: "relief", flowers: 2 },
  { id: "casamento", label: "Casamento", hint: "Arabescos dourados, sem borboleta.", text: { name: "Ana & Bruno", title: "Casamento", phrase: "Convidamos você para celebrar\no nosso amor", date: "20.03.27", place: "Quinta das Rosas" }, nameFont: "great-vibes", textFont: "montserrat", palette: "dourado", pattern: "arabesque", butterfly: "none", flowers: 2 },
  { id: "cha-bebe", label: "Chá de bebê", hint: "Azul bebê com borboletas.", text: { name: "Helena", title: "Chá de bebê", phrase: "Venha celebrar a chegada\nda nossa princesa", date: "12.04.27", place: "Casa da vovó" }, nameFont: "pacifico", textFont: "montserrat", palette: "azul", pattern: "butterflies", butterfly: "relief", flowers: 1 },
  { id: "batizado", label: "Batizado", hint: "Verde sálvia com folhagem.", text: { name: "Miguel", title: "Batizado", phrase: "Com muita alegria, convidamos você\npara esta bênção", date: "08.05.27", place: "Igreja Matriz" }, nameFont: "playfair", textFont: "montserrat", palette: "salvia", pattern: "leaves", butterfly: "none", flowers: 2 },
  { id: "madrinhas", label: "Madrinhas e padrinhos", hint: "O mesmo convite em várias cores, um nome para cada pessoa.", text: { name: "Marina", title: "Madrinha", phrase: "Quero você ao meu lado\nneste dia tão especial", date: "", place: "" }, nameFont: "great-vibes", textFont: "montserrat", palette: "lilas", pattern: "floral", butterfly: "relief", flowers: 2, names: "Marina\nJúlia\nCamila\nBeatriz", palettes: ["lilas", "rosa", "salvia", "vinho"] },
];
