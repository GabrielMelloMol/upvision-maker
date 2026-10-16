import { deltaE2000 } from "./colorMatch";

/** Nomes de cor em português para mostrar no lugar do código (#rrggbb): o mais parecido pela diferença perceptual (CIEDE2000). */
const NAMES: readonly (readonly [string, string])[] = [
  ["preto", "#1c1c1e"],
  ["branco", "#f8f8f6"],
  ["cinza", "#8e8e93"],
  ["cinza-claro", "#c7c7cc"],
  ["cinza-escuro", "#48484a"],
  ["vermelho", "#d6262e"],
  ["vinho", "#7a1f2b"],
  ["laranja", "#f97316"],
  ["amarelo", "#facc15"],
  ["verde", "#22a04b"],
  ["verde-claro", "#8fd18b"],
  ["verde-escuro", "#14532d"],
  ["turquesa", "#14b8a6"],
  ["azul", "#2563eb"],
  ["azul-claro", "#7cc4f5"],
  ["azul-escuro", "#1e3a8a"],
  ["roxo", "#7e3fd6"],
  ["lilás", "#c4a6ec"],
  ["rosa", "#f472b6"],
  ["salmão", "#f4978e"],
  ["marrom", "#7b4a2a"],
  ["bege", "#d9b78d"],
  ["creme", "#f3ecd2"],
  ["dourado", "#c9a227"],
];

export function colorName(hex: string): string {
  let best = NAMES[0][0];
  let d = Infinity;
  for (const [name, h] of NAMES) {
    const e = deltaE2000(hex, h);
    if (e < d) [best, d] = [name, e];
  }
  return best;
}

export const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
