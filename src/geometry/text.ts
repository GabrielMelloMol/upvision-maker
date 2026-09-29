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

export type ArcSide = "top" | "bottom";

/**
 * Texto em arco (medalhas): cada letra girada sobre um círculo de raio `radius` (a linha de base), centrado no topo
 * ou embaixo. Em cima as letras apontam para fora; embaixo, para o centro — as duas leem da esquerda para a direita.
 * `heightMm` é a altura do texto (a mesma régua do textToCrossSection). Arco maior que 300° é cortado com erro.
 */
export function arcTextToCrossSection(M: ManifoldToplevel, font: Font, text: string, heightMm: number, radius: number, side: ArcSide): CS {
  const t = text.trim();
  if (!t) throw new Error("Digite um texto.");
  const straight = flatten(glyphCommands(font, t), MAX_SEG);
  if (!straight.length) throw new Error("Esta fonte não tem as letras digitadas.");
  const ys = straight.flat().map((p) => p[1]);
  const s = heightMm / (Math.max(...ys) - Math.min(...ys)); // mm por unidade
  const unit = UNITS / font.unitsPerEm;
  const glyphs = [...t].map((ch) => font.charToGlyph(ch));
  const adv = glyphs.map((g, i) => ((g.advanceWidth ?? 0) + (glyphs[i + 1] ? font.getKerningValue(g, glyphs[i + 1]) : 0)) * unit * s);
  const total = adv.reduce((a, b) => a + b, 0);
  const span = total / radius;
  if (span > (300 * Math.PI) / 180) throw new Error("Texto longo demais para o arco: diminua o tamanho ou encurte o texto.");
  const pieces: CS[] = [];
  let x = 0;
  glyphs.forEach((g, i) => {
    const mid = x + adv[i] / 2;
    x += adv[i];
    const cmds: Cmd[] = [];
    for (const c of g.getPath(0, 0, UNITS).commands) {
      if (c.type === "M" || c.type === "L") cmds.push({ c: c.type, p: [c.x, c.y] });
      else if (c.type === "C") cmds.push({ c: "C", p: [c.x1, c.y1, c.x2, c.y2, c.x, c.y] });
      else if (c.type === "Q") cmds.push({ c: "Q", p: [c.x1, c.y1, c.x, c.y] });
      else cmds.push({ c: "Z", p: [] });
    }
    const contours = flatten(cmds, MAX_SEG);
    if (!contours.length) return; // espaço
    // opentype: Y para baixo; aqui a letra fica em pé (Y para cima), com o centro do avanço em x = 0
    const pts = contours.map((ring) => ring.map(([px, py]) => [px * s - (adv[i] / 2), -py * s] as [number, number]));
    const glyph = new M.CrossSection(pts, "NonZero");
    const a = side === "top" ? Math.PI / 2 + span / 2 - mid / radius : -Math.PI / 2 - span / 2 + mid / radius;
    const rot = ((side === "top" ? a - Math.PI / 2 : a + Math.PI / 2) * 180) / Math.PI;
    const turned = glyph.rotate(rot);
    pieces.push(turned.translate([radius * Math.cos(a), radius * Math.sin(a)]));
    glyph.delete();
    turned.delete();
  });
  const out = M.CrossSection.union(pieces);
  pieces.forEach((p) => p.delete());
  return out;
}
