import { fitInto, scoped } from "../shape2d";
import { moveMesh, size2, slab, solidMesh, type ModelCtx, type ModelOutput, MissingInput } from "./common";

export type WordDecorParams = {
  base: string;
  baseHeight: number;
  baseThickness: number;
  word: string;
  wordHeight: number;
  wordThickness: number;
  recess: number; // profundidade do rebaixo onde a palavra encaixa
  clearance: number; // folga do encaixe
  baseColor: string;
  wordColor: string;
};

export const DEFAULT_WORD_DECOR: WordDecorParams = {
  base: "AMOR",
  baseHeight: 50,
  baseThickness: 10,
  word: "Família",
  wordHeight: 29,
  wordThickness: 3,
  recess: 1,
  clearance: 0.2,
  baseColor: "#f8f8f6",
  wordColor: "#d6262e",
};

const BAR_H = 3; // barra que une as letras da palavra base (fica em pé sobre ela)
const GAP = 8;

/**
 * Decoração de palavras: palavra base grossa (fica em pé) com um rebaixo no formato da palavra de encaixe,
 * que é impressa à parte, fina, e encaixa na frente. As duas imprimem deitadas.
 */
export function buildWordDecor({ M, text }: ModelCtx, p: WordDecorParams): ModelOutput {
  return scoped((k) => {
    const rawBase = text(p.base, p.baseHeight);
    const rawWord = text(p.word, p.wordHeight);
    if (!rawBase || !rawWord) throw new MissingInput("Digite a palavra base e a palavra de encaixe.");
    const letters = k(fitInto(k(rawBase), 1e6, p.baseHeight, 0));
    const b = letters.bounds();
    const bar = k(k(M.CrossSection.square([b.max[0] - b.min[0], BAR_H], true)).translate([(b.min[0] + b.max[0]) / 2, b.min[1] + BAR_H / 2]));
    const base2d = k(letters.add(bar));
    const [bw] = size2(base2d);
    const word = k(fitInto(k(rawWord), bw * 0.95, p.wordHeight, 0));
    const pocket = k(k(word.offset(p.clearance, "Round")).intersect(base2d));
    if (pocket.area() < word.area() * 0.2) throw new Error("A palavra de encaixe quase não toca a palavra base: aumente a altura dela.");
    const recess = k(k(pocket.extrude(p.recess + 0.01)).translate([0, 0, p.baseThickness - p.recess]));
    const baseSolid = k(k(base2d.extrude(p.baseThickness)).subtract(recess));
    const dy = -(p.baseHeight / 2 + GAP + p.wordHeight / 2);
    return {
      models: [
        { name: p.base.trim(), parts: [{ name: "Palavra base", color: p.baseColor, mesh: solidMesh(baseSolid) }] },
        { name: p.word.trim(), parts: [{ name: "Palavra de encaixe", color: p.wordColor, mesh: moveMesh(slab(word, p.wordThickness), 0, dy) }] },
      ],
      warnings: ["A palavra de encaixe sai separada: cole no rebaixo da palavra base (a folga é para ela entrar sem forçar)."],
    };
  });
}
