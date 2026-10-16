import type { Font } from "opentype.js";
import { nozzleMm } from "../bed";
import type { CS, ManifoldToplevel } from "../manifold";
import { toMesh } from "../mesh";
import { fixThinStrokes, thinWarning } from "../stampArt";
import { textToCrossSection } from "../text";
import type { Part } from "../types";
import type { K } from "./motifs";

export type CardStyle = "relief" | "inlay";

export type CardText = { name: string; title: string; phrase: string; date: string; place: string };

export type CardParams = {
  w: number;
  h: number;
  style: CardStyle;
  /** Espessura da placa e altura do texto (em relevo) ou profundidade (embutido). */
  plate: number;
  relief: number;
  /** Maiúsculas no nome, título e local. */
  caps: boolean;
};

export const DEFAULT_CARD: CardParams = { w: 112, h: 82, style: "relief", plate: 1.2, relief: 0.6, caps: true };

export type CardOut = { parts: Part[]; warnings: string[] };

const MARGIN = 6;
const CORNER = 3;
// altura da letra maiúscula de cada linha, como fração da altura útil do cartão
const CAP = { name: 0.2, title: 0.095, phrase: 0.058, date: 0.1, place: 0.07 } as const;
const GAP = 0.045;
const SHRINK_WARN = 0.9;
const TIGHT = 0.55; // as linhas da mesma frase ficam mais juntas
const SIMPLIFY_MM = 0.02;
const THIN_TEXT_AREA = 3; // pontas de letra (serifa, A, N) perdem área na abertura, mas não são traço fino: só conta o que passa disto, em bicos quadrados

/** Altura do traço do texto a 100 px, glifo a glifo (sem o motor de ligaduras, que não lê todas as fontes). */
const rawHeight = (font: Font, t: string) => {
  let lo = Infinity, hi = -Infinity;
  for (const ch of t) {
    const b = font.charToGlyph(ch).getPath(0, 0, 100).getBoundingBox();
    if (b.y2 > b.y1) {
      lo = Math.min(lo, b.y1);
      hi = Math.max(hi, b.y2);
    }
  }
  return Math.max(1e-6, hi - lo);
};

/** Linha de texto com a letra maiúscula do tamanho `cap` (e não a caixa inteira, que muda com os acentos). */
function line(M: ManifoldToplevel, k: K, font: Font, text: string, cap: number, emoji?: Font): CS {
  const raw = k(textToCrossSection(M, font, text, (cap * rawHeight(font, text)) / rawHeight(font, "H"), emoji));
  return k(raw.simplify(SIMPLIFY_MM)); // contornos de fonte têm vértices demais para o offset do bico
}

type Entry = { cs: CS; tone: "text" | "accent"; tight: boolean };

/** As linhas do cartão empilhadas e centradas, no limite da caixa útil (encolhe tudo se passar). */
function layout(M: ManifoldToplevel, k: K, p: CardParams, t: CardText, fonts: { name: Font; text: Font; emoji?: Font }, warnings: string[]): Entry[] {
  const ibox = { w: p.w - 2 * MARGIN, h: p.h - 2 * MARGIN };
  const up = (s: string) => (p.caps ? s.toLocaleUpperCase("pt-BR") : s);
  const phrase = t.phrase.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const specs: { text: string; font: Font; cap: number; tone: Entry["tone"]; tight: boolean }[] = [
    ...(t.name.trim() ? [{ text: up(t.name.trim()), font: fonts.name, cap: CAP.name * ibox.h, tone: "text" as const, tight: false }] : []),
    ...(t.title.trim() ? [{ text: up(t.title.trim()), font: fonts.text, cap: CAP.title * ibox.h, tone: "accent" as const, tight: false }] : []),
    ...phrase.map((l, i) => ({ text: l, font: fonts.text, cap: CAP.phrase * ibox.h, tone: "accent" as const, tight: i > 0 })),
    ...(t.date.trim() ? [{ text: t.date.trim(), font: fonts.text, cap: CAP.date * ibox.h, tone: "text" as const, tight: false }] : []),
    ...(t.place.trim() ? [{ text: up(t.place.trim()), font: fonts.text, cap: CAP.place * ibox.h, tone: "accent" as const, tight: false }] : []),
  ];
  const lines = specs.map((s) => {
    let cs = line(M, k, s.font, s.text, s.cap, fonts.emoji);
    const b = cs.bounds();
    const w = b.max[0] - b.min[0];
    if (w > ibox.w) {
      // só avisa quando a letra encolhe a ponto de mudar o desenho do cartão
      if (ibox.w / w < SHRINK_WARN) warnings.push(`A linha "${s.text.length > 24 ? `${s.text.slice(0, 23)}…` : s.text}" foi reduzida para caber no cartão.`);
      cs = k(cs.scale(ibox.w / w));
    }
    return { cs, tone: s.tone, tight: s.tight };
  });
  const gap = GAP * ibox.h;
  const heights = lines.map((l) => l.cs.bounds()).map((b) => b.max[1] - b.min[1]);
  const gapBefore = (i: number) => (i === 0 ? 0 : lines[i].tight ? gap * TIGHT : gap);
  const total = heights.reduce((a, b) => a + b, 0) + lines.reduce((a, _, i) => a + gapBefore(i), 0);
  const fit = total > ibox.h ? ibox.h / total : 1;
  if (fit < 1) warnings.push("O texto não cabe na altura do cartão: reduzi tudo. Corte a frase ou aumente o envelope.");
  let y = (total * fit) / 2;
  return lines.map((l, i) => {
    const s = k(l.cs.scale(fit));
    const sb = s.bounds();
    y -= gapBefore(i) * fit;
    const top = y;
    y -= heights[i] * fit;
    return { cs: k(s.translate([-(sb.min[0] + sb.max[0]) / 2, top - sb.max[1]])), tone: l.tone, tight: l.tight };
  });
}

/** O cartão do convite: placa transparente com o texto em duas cores, em relevo ou embutido. */
export function buildCard(M: ManifoldToplevel, k: K, p: CardParams, text: CardText, fonts: { name: Font; text: Font; emoji?: Font }, colors: { plate: string; text: string; accent: string }): CardOut {
  const warnings: string[] = [];
  const plateCs = k(k(M.CrossSection.square([p.w - 2 * CORNER, p.h - 2 * CORNER], true)).offset(CORNER, "Round"));
  const entries = layout(M, k, p, text, fonts, warnings);
  const group = (tone: Entry["tone"]) => {
    const raw = k(M.CrossSection.union(entries.filter((e) => e.tone === tone).map((e) => e.cs)));
    if (raw.isEmpty()) return raw;
    const fixed = fixThinStrokes(M, raw, true, nozzleMm(), THIN_TEXT_AREA);
    warnings.push(...thinWarning(fixed));
    return k(fixed.cs);
  };
  const main = group("text"), accent = group("accent");
  const up = (cs: CS, h: number, z: number) => k(k(cs.extrude(h)).translate([0, 0, z]));
  const T = p.plate;
  if (p.style === "relief") {
    const parts: Part[] = [{ name: "Cartão", color: colors.plate, mesh: toMesh(k(plateCs.extrude(T))) }];
    if (!main.isEmpty()) parts.push({ name: "Texto", color: colors.text, mesh: toMesh(up(main, p.relief, T)) });
    if (!accent.isEmpty()) parts.push({ name: "Destaque", color: colors.accent, mesh: toMesh(up(accent, p.relief, T)) });
    return { parts, warnings };
  }
  // embutido: o texto ocupa os últimos `relief` mm da placa, rente à face
  const z0 = T - p.relief;
  const inked = k(M.CrossSection.union([main, accent]));
  const lower = k(plateCs.extrude(z0));
  const upper = up(k(plateCs.subtract(inked)), p.relief, z0);
  const parts: Part[] = [{ name: "Cartão", color: colors.plate, mesh: toMesh(k(lower.add(upper))) }];
  if (!main.isEmpty()) parts.push({ name: "Texto", color: colors.text, mesh: toMesh(up(main, p.relief, z0)) });
  if (!accent.isEmpty()) parts.push({ name: "Destaque", color: colors.accent, mesh: toMesh(up(accent, p.relief, z0)) });
  return { parts, warnings };
}
