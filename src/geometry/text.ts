import type { Font } from "opentype.js";
import type { CS, ManifoldToplevel } from "./manifold";
import { fitHeight } from "./shape2d";
import { flatten, type Cmd } from "./svgPath";

const UNITS = 100; // tamanho de fonte de trabalho (unidades arbitrárias antes de escalar para mm)
const MAX_SEG = 0.5;

/**
 * Texto → região 2D em mm (Y para cima, centrada), com a altura total pedida.
 * Os contornos dos glifos são unidos com NonZero: letras cursivas que se sobrepõem viram uma peça só.
 * `fallback`: fonte reserva para caracteres que a principal não tem (emoji).
 */
export function textToCrossSection(M: ManifoldToplevel, font: Font, text: string, heightMm: number, fallback?: Font): CS {
  const t = text.trim();
  if (!t) throw new Error("Digite um texto.");
  const contours = flatten(glyphCommands(font, t, fallback), MAX_SEG);
  if (!contours.length) throw new Error("Esta fonte não tem as letras digitadas.");
  const raw = new M.CrossSection(contours, "NonZero");
  try {
    return fitHeight(raw, heightMm);
  } finally {
    raw.delete();
  }
}

type Glyph = ReturnType<Font["charToGlyph"]>;
type Placed = { g: Glyph; font: Font };

/** Seletor de variação (emoji/texto) e ZWJ: não desenham nada. */
const INVISIBLE = new Set(["\uFE0E", "\uFE0F", "\u200D"]);

/** Glifo de cada caractere: da fonte principal ou, quando ela não tem, da reserva (emoji). */
function glyphsOf(font: Font, text: string, fallback?: Font): Placed[] {
  return [...text]
    .filter((ch) => !INVISIBLE.has(ch))
    .map((ch) => {
      const g = font.charToGlyph(ch);
      if (g.index !== 0 || !fallback) return { g, font };
      const e = fallback.charToGlyph(ch);
      return e.index !== 0 ? { g: e, font: fallback } : { g, font };
    });
}

/** Avanço de cada glifo em unidades de trabalho (kerning só entre glifos da mesma fonte). */
const advances = (list: Placed[]) =>
  list.map(({ g, font }, i) => {
    const next = list[i + 1];
    const kern = next && next.font === font ? font.getKerningValue(g, next.g) : 0;
    return ((g.advanceWidth ?? 0) + kern) * (UNITS / font.unitsPerEm);
  });

function pathCmds(g: Glyph, x: number): Cmd[] {
  const out: Cmd[] = [];
  for (const c of g.getPath(x, 0, UNITS).commands) {
    if (c.type === "M" || c.type === "L") out.push({ c: c.type, p: [c.x, c.y] });
    else if (c.type === "C") out.push({ c: "C", p: [c.x1, c.y1, c.x2, c.y2, c.x, c.y] });
    else if (c.type === "Q") out.push({ c: "Q", p: [c.x1, c.y1, c.x, c.y] });
    else out.push({ c: "Z", p: [] });
  }
  return out;
}

/**
 * Posiciona glifo a glifo (avanço + kerning), sem o "shaper" do opentype.js, que falha em algumas
 * substituições GSUB (ex.: Hanken Grotesk). Para nomes e frases curtas o resultado é o mesmo.
 */
function glyphCommands(font: Font, text: string, fallback?: Font): Cmd[] {
  const list = glyphsOf(font, text, fallback);
  const adv = advances(list);
  let x = 0;
  return list.flatMap(({ g }, i) => {
    const cmds = pathCmds(g, x);
    x += adv[i];
    return cmds;
  });
}

/** Tem emoji: só então vale carregar a fonte reserva (loadEmojiFont). */
export const hasEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

export type ArcSide = "top" | "bottom";

/**
 * Texto em arco (medalhas): cada letra girada sobre um círculo de raio `radius` (a linha de base), centrado no topo
 * ou embaixo. Em cima as letras apontam para fora; embaixo, para o centro — as duas leem da esquerda para a direita.
 * `heightMm` é a altura do texto (a mesma régua do textToCrossSection). Arco maior que 300° é cortado com erro.
 */
export function arcTextToCrossSection(M: ManifoldToplevel, font: Font, text: string, heightMm: number, radius: number, side: ArcSide, fallback?: Font): CS {
  const t = text.trim();
  if (!t) throw new Error("Digite um texto.");
  const straight = flatten(glyphCommands(font, t, fallback), MAX_SEG);
  if (!straight.length) throw new Error("Esta fonte não tem as letras digitadas.");
  const ys = straight.flat().map((p) => p[1]);
  const s = heightMm / (Math.max(...ys) - Math.min(...ys)); // mm por unidade
  const glyphs = glyphsOf(font, t, fallback);
  const adv = advances(glyphs).map((a) => a * s);
  const total = adv.reduce((a, b) => a + b, 0);
  const span = total / radius;
  if (span > (300 * Math.PI) / 180) throw new Error("Texto longo demais para o arco: diminua o tamanho ou encurte o texto.");
  const pieces: CS[] = [];
  let x = 0;
  glyphs.forEach(({ g }, i) => {
    const mid = x + adv[i] / 2;
    x += adv[i];
    const contours = flatten(pathCmds(g, 0), MAX_SEG);
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
