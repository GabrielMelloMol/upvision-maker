import type { Font } from "opentype.js";
import { nozzleMm } from "./bed";
import { stackLines } from "./keychain";
import type { CS, ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";
import type { StampShape } from "./stamp";
import { arcTextToCrossSection, textToCrossSection } from "./text";

type K = <D extends { delete(): void }>(o: D) => D;

export type StampLayout = "stack" | "side";
export type StampFrame = "none" | "line" | "seal";

/** Ajuste feito à mão: giro (graus, anti-horário) e deslocamento em mm do desenho já no tamanho final. */
export type ArtMove = { rot: number; dx: number; dy: number };
export const NO_MOVE: ArtMove = { rot: 0, dx: 0, dy: 0 };

export type StampArtInput = {
  shape: StampShape;
  /** Área carimbada (mm): largura/diâmetro e altura. */
  w: number;
  h: number;
  /** Logo já lido do SVG (qualquer tamanho, centrado) ou null. */
  logo: CS | null;
  lines: string[];
  font: Font;
  emoji?: Font;
  layout: StampLayout;
  /** Altura do bloco de texto em % da altura do logo. */
  textScale: number;
  frame: StampFrame;
  lineW: number;
  arcTop: string;
  arcBottom: string;
  arcFont?: Font;
  arcH: number;
  /** Tamanho do conteúdo dentro da moldura, em % (100 = ocupa o espaço). */
  scale: number;
  move: ArtMove;
};

export const DEFAULT_ART = {
  layout: "stack" as StampLayout,
  textScale: 55,
  frame: "none" as StampFrame,
  lineW: 1.2,
  arcTop: "",
  arcBottom: "",
  arcH: 4,
  scale: 100,
  move: NO_MOVE,
};

const NOMINAL_LOGO_H = 100; // unidades de trabalho antes de ir a mm
const LOGO_TEXT_GAP = 0.12; // fração da altura do logo
const LINE_GAP = 0.25; // espaço entre linhas, em fração da altura da linha
const PAD_MM = 1.5; // respiro entre o conteúdo e a moldura
const RING_GAP_MM = 0.8; // entre o texto em arco e os anéis
const RING_TO_RING_MM = 1.6;
const INNER_RING_FRAC = 0.6;
const FRAME_CORNER_R = 2;
const CIRCLE_SEGS = 96;
const MIN_SCALE = 0.05;
const SIMPLIFY_MM = 0.02; // letras e curvas vêm com pontos demais; o 3D fica bem mais rápido sem perder nada que o bico veja
const MAX_FILL = 0.92; // acima disto o "desenho" é quase um bloco: fundo branco no SVG?

const bbox = (cs: CS) => {
  const b = cs.bounds();
  return { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], cx: (b.min[0] + b.max[0]) / 2, cy: (b.min[1] + b.max[1]) / 2 };
};

const centered = (cs: CS, k: K): CS => {
  const b = bbox(cs);
  return k(cs.translate([-b.cx, -b.cy]));
};

/** Linhas de texto empilhadas e centradas; null se não há texto. */
function textBlock(M: ManifoldToplevel, input: StampArtInput, heightUnits: number, k: K): CS | null {
  const lines = input.lines.map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const each = heightUnits / (lines.length + (lines.length - 1) * LINE_GAP);
  const cs = lines.map((l) => k(textToCrossSection(M, input.font, l, each, input.emoji)));
  return centered(cs.length === 1 ? cs[0] : k(stackLines(M, cs, each * LINE_GAP)), k);
}

/** Logo + texto, centrados em torno da origem, em unidades de trabalho. */
function compose(M: ManifoldToplevel, input: StampArtInput, k: K): CS | null {
  const logo = input.logo ? centered(k(input.logo.scale(NOMINAL_LOGO_H / bbox(input.logo).h)), k) : null;
  const text = textBlock(M, input, ((logo ? NOMINAL_LOGO_H : 60) * input.textScale) / 100, k);
  if (!logo) return text;
  if (!text) return logo;
  const gap = NOMINAL_LOGO_H * LOGO_TEXT_GAP;
  const lb = bbox(logo), tb = bbox(text);
  if (input.layout === "side") {
    const total = lb.w + gap + tb.w;
    const lm = k(logo.translate([-total / 2 + lb.w / 2, 0]));
    const tm = k(text.translate([total / 2 - tb.w / 2, 0]));
    return k(lm.add(tm));
  }
  const total = lb.h + gap + tb.h;
  const lm = k(logo.translate([0, total / 2 - lb.h / 2]));
  const tm = k(text.translate([0, -total / 2 + tb.h / 2]));
  return k(lm.add(tm));
}

/** Maior distância de qualquer ponto do desenho à origem. */
function maxRadius(cs: CS): number {
  let m = 0;
  for (const ring of cs.toPolygons()) for (const [x, y] of ring) m = Math.max(m, Math.hypot(x, y));
  return m;
}

type FramePlan = {
  /** Metade da área útil: retângulo (rect) ou raio (round) onde o conteúdo cabe. */
  innerW: number;
  innerH: number;
  innerR: number;
  frame: CS | null;
};

const roundedRect = (M: ManifoldToplevel, w: number, h: number, r: number, k: K): CS => {
  const rr = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  return rr > 0 ? k(k(M.CrossSection.square([w - 2 * rr, h - 2 * rr], true)).offset(rr, "Round")) : k(M.CrossSection.square([w, h], true));
};

const ring = (M: ManifoldToplevel, outer: number, width: number, k: K): CS => k(k(M.CrossSection.circle(outer, CIRCLE_SEGS)).subtract(k(M.CrossSection.circle(Math.max(0.01, outer - width), CIRCLE_SEGS))));

/** Moldura e a área que sobra para o conteúdo. Selo: dois anéis com texto em arco; só em placa redonda. */
function planFrame(M: ManifoldToplevel, input: StampArtInput, k: K): FramePlan {
  const { w, h, shape, frame, lineW } = input;
  const R = w / 2;
  if (shape === "round") {
    if (frame === "none") return { innerW: w, innerH: w, innerR: R - PAD_MM, frame: null };
    if (frame === "line") return { innerW: w, innerH: w, innerR: R - lineW - PAD_MM, frame: ring(M, R, lineW, k) };
    const inner = lineW * INNER_RING_FRAC;
    const hasArc = !!(input.arcTop.trim() || input.arcBottom.trim());
    const band = hasArc ? input.arcH + 2 * RING_GAP_MM : RING_TO_RING_MM;
    const rA = R - lineW - band; // raio externo do anel interno
    const rings = k(ring(M, R, lineW, k).add(ring(M, rA, inner, k)));
    return { innerW: w, innerH: w, innerR: rA - inner - PAD_MM, frame: rings };
  }
  if (frame === "none") return { innerW: w - 2 * PAD_MM, innerH: h - 2 * PAD_MM, innerR: 0, frame: null };
  const line = k(roundedRect(M, w, h, FRAME_CORNER_R, k).subtract(roundedRect(M, w - 2 * lineW, h - 2 * lineW, Math.max(0, FRAME_CORNER_R - lineW), k)));
  return { innerW: w - 2 * (lineW + PAD_MM), innerH: h - 2 * (lineW + PAD_MM), innerR: 0, frame: line };
}

/** Texto em volta, entre os anéis do selo (em cima e/ou embaixo). */
function arcTexts(M: ManifoldToplevel, input: StampArtInput, k: K): CS[] {
  const R = input.w / 2;
  const rA = R - input.lineW - (input.arcH + 2 * RING_GAP_MM);
  const font = input.arcFont ?? input.font;
  const out: CS[] = [];
  if (input.arcTop.trim()) out.push(k(arcTextToCrossSection(M, font, input.arcTop, input.arcH, rA + RING_GAP_MM, "top", input.emoji)));
  // embaixo as letras apontam para o centro: a linha de base fica no lado de fora do texto
  if (input.arcBottom.trim()) out.push(k(arcTextToCrossSection(M, font, input.arcBottom, input.arcH, R - input.lineW - RING_GAP_MM, "bottom", input.emoji)));
  return out;
}

export type StampArt = { art: CS; warnings: string[] };

/**
 * Monta o desenho do carimbo na área (mm, Y para cima, centro na origem, como se lê no papel): logo + texto no
 * tamanho que cabe, a moldura (linha ou selo com texto em arco) e o ajuste manual. O quanto o conteúdo enche o espaço
 * vem de `scale`; o deslocamento é aplicado depois do tamanho, em mm. Quem chama apaga o `art` (e só ele).
 */
export function buildStampArt(M: ManifoldToplevel, input: StampArtInput): StampArt {
  const warnings: string[] = [];
  const art = scoped((k) => {
    const frame = planFrame(M, input, k);
    const raw = compose(M, input, k);
    const arcs = input.shape === "round" && input.frame === "seal" ? arcTexts(M, input, k) : [];
    if (!raw && !arcs.length && !frame.frame) throw new Error("Digite um texto ou envie um logo.");
    let content: CS | null = null;
    if (raw) {
      const rotated = k(raw.rotate(input.move.rot));
      const b = bbox(rotated);
      let s = Math.min(frame.innerW / b.w, frame.innerH / b.h);
      if (input.shape === "round") s = Math.min(s, frame.innerR / maxRadius(k(rotated.translate([-b.cx, -b.cy]))));
      s = Math.max(s * (input.scale / 100), MIN_SCALE);
      content = k(k(k(rotated.translate([-b.cx, -b.cy])).scale(s)).translate([input.move.dx, input.move.dy]));
    }
    const parts = [content, frame.frame, ...arcs].filter((c): c is CS => !!c);
    const all = k(M.CrossSection.union(parts));
    if (content) {
      const fill = content.area() / (bbox(content).w * bbox(content).h);
      if (input.logo && fill > MAX_FILL) warnings.push("O desenho ocupa quase toda a área: o SVG deve ter um fundo (retângulo branco) que virou parte do relevo. Apague o fundo no SVG ou use \"Imagem em desenho\".");
    }
    // o desenho tem que ficar dentro da área carimbada
    const bounds = all.bounds();
    const out = input.shape === "round" ? maxRadius(all) > input.w / 2 + 1e-6 : bounds.max[0] > input.w / 2 + 1e-6 || bounds.min[0] < -input.w / 2 - 1e-6 || bounds.max[1] > input.h / 2 + 1e-6 || bounds.min[1] < -input.h / 2 - 1e-6;
    if (out) warnings.push("O desenho passa da área do carimbo: diminua o tamanho ou o deslocamento.");
    return all.simplify(SIMPLIFY_MM);
  });
  return { art, warnings };
}

export type ThinFix = { cs: CS; thin: boolean; fixed: boolean };
const THIN_MIN_AREA = 0.2; // área mínima de um resto, em bicos quadrados: menos que isso é ponta de canto vivo, não traço

/**
 * Procura traços mais finos que o bico: o que some na abertura (−bico/2, +bico/2). Com `thicken`, engrossa só esses
 * traços (o resto do desenho fica como está). Quem chama apaga `cs`.
 */
export function fixThinStrokes(M: ManifoldToplevel, art: CS, thicken: boolean, nozzle = nozzleMm()): ThinFix {
  return scoped((k) => {
    const opened = k(k(art.offset(-nozzle / 2, "Round")).offset(nozzle / 2, "Round"));
    const lost = k(art.subtract(opened));
    const real = lost.decompose().map(k).filter((c) => c.area() >= nozzle * nozzle * THIN_MIN_AREA);
    const thin = real.length > 0;
    if (!thin || !thicken) return { cs: art.translate([0, 0]), thin, fixed: false };
    const fat = k(k(M.CrossSection.union(real)).offset(nozzle / 2, "Round"));
    return { cs: M.CrossSection.union([art, fat]), thin, fixed: true };
  });
}

/** Aviso do traço fino; vazio se não havia. */
export function thinWarning(t: ThinFix): string[] {
  if (!t.thin) return [];
  return t.fixed
    ? ["Havia traços mais finos que o bico da impressora e eu os engrossei para o relevo sair inteiro."]
    : ["O desenho tem traços mais finos que o bico da impressora: eles somem no relevo. Engrosse o desenho ou aumente o carimbo."];
}
