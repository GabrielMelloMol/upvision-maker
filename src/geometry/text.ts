import type { Font } from "opentype.js";
import type { CS, ManifoldToplevel } from "./manifold";
import { fitHeight } from "./shape2d";
import { flatten, type Cmd } from "./svgPath";

const UNITS = 100; // tamanho de fonte de trabalho (unidades arbitrárias antes de escalar para mm)
const MAX_SEG = 0.5;

/**
 * Texto → região 2D em mm (Y para cima, centrada), com a altura total pedida.
 * Os contornos dos glifos são unidos com NonZero: letras cursivas que se sobrepõem viram uma peça só.
 */
export function textToCrossSection(M: ManifoldToplevel, font: Font, text: string, heightMm: number): CS {
  const t = text.trim();
  if (!t) throw new Error("Digite um texto.");
  const contours = flatten(glyphCommands(font, t), MAX_SEG);
  if (!contours.length) throw new Error("Esta fonte não tem as letras digitadas.");
  const raw = new M.CrossSection(contours, "NonZero");
  try {
    return fitHeight(raw, heightMm);
  } finally {
    raw.delete();
  }
}

/**
 * Posiciona glifo a glifo (avanço + kerning), sem o "shaper" do opentype.js, que falha em algumas
 * substituições GSUB (ex.: Hanken Grotesk). Para nomes e frases curtas o resultado é o mesmo.
 */
function glyphCommands(font: Font, text: string): Cmd[] {
  const scale = UNITS / font.unitsPerEm;
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  const out: Cmd[] = [];
  let x = 0;
  glyphs.forEach((g, i) => {
    for (const c of g.getPath(x, 0, UNITS).commands) {
      if (c.type === "M" || c.type === "L") out.push({ c: c.type, p: [c.x, c.y] });
      else if (c.type === "C") out.push({ c: "C", p: [c.x1, c.y1, c.x2, c.y2, c.x, c.y] });
      else if (c.type === "Q") out.push({ c: "Q", p: [c.x1, c.y1, c.x, c.y] });
      else out.push({ c: "Z", p: [] });
    }
    const next = glyphs[i + 1];
    x += ((g.advanceWidth ?? 0) + (next ? font.getKerningValue(g, next) : 0)) * scale;
  });
  return out;
}
