/**
 * Minha letra (#314): letras desenhadas pela pessoa num quadro de 100 × 100 (Y para baixo, como na tela), com até
 * 3 versões cada, sorteadas para letras repetidas não ficarem iguais. Letra sem desenho usa a cursiva de traço único.
 */
import { z } from "zod";
import { hersheyLines, type Spacing } from "./hershey";

type Pt = [number, number];
export type Strokes = Pt[][];
/** Letra → versões → traços → pontos (no quadro de 100). */
export type Alphabet = Record<string, Strokes[]>;

export const PAD = 100;
/** Linhas-guia do quadro: topo da maiúscula, altura do "x" e linha de base (as mesmas da cursiva, para casar). */
export const GUIDES = { cap: 20, x: 49, base: 70 };
export const MAX_VERSIONS = 3;
/** Pad → unidades da cursiva Hershey (maiúscula de 21, base em y = -9, Y para cima). */
const K = 21 / (GUIDES.base - GUIDES.cap);
const toFont = ([x, y]: Pt): Pt => [x * K, -9 + (GUIDES.base - y) * K];
const SPACE = 10;
const GAP = 2;

export const CHARSET = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  ..."áàâãéêíóôõúç",
  ...".,!?-:;'\"()&@",
];

const pt = z.tuple([z.number().min(0).max(PAD), z.number().min(0).max(PAD)]);
const strokes = z.array(z.array(pt).min(2).max(2000)).min(1).max(40);
export const AlphabetSchema = z.record(z.string().max(2), z.array(strokes).min(1).max(MAX_VERSIONS));

/** Tira pontos colados (menos de 0,8 do anterior): o arquivo fica leve e o traço continua igual. */
export function simplify(s: Pt[]): Pt[] {
  const out: Pt[] = [];
  s.forEach((p, i) => {
    const last = out[out.length - 1];
    if (!last || i === s.length - 1 || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.8) out.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  });
  return out;
}

/** Sorteio fixo pela posição: a prévia não muda a cada tela, mas letras repetidas variam. */
function rand(seed: number) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function bbox(lines: { pts: Pt[] }[]) {
  const xs = lines.flatMap((l) => l.pts.map((p) => p[0]));
  return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs) } : null;
}

/**
 * Texto com a letra da pessoa, Y para cima (placeOnBed escala). `variation` de 0 a 1: quanto cada letra sobe, desce ou
 * anda de lado (até ~1,5 unidade, menos que a grossura de um traço numa letra de 1 cm).
 */
export function myLines(text: string, alphabet: Alphabet, variation: number, seed = 1, { gap = 0, line: lineK = 1 }: Spacing = {}): { pts: Pt[]; closed: boolean }[] {
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let n = 0;
  text.split("\n").forEach((line, row) => {
    let x = 0;
    for (const ch of line.normalize("NFC")) {
      n++;
      if (ch === " ") {
        x += SPACE + gap;
        continue;
      }
      const versions = alphabet[ch];
      const glyph = versions?.length
        ? versions[Math.floor(rand(seed * 7919 + n) * versions.length)].map((s) => ({ pts: s.map(toFont), closed: false }))
        : hersheyLines(ch);
      const b = bbox(glyph);
      if (!b) continue;
      const dx = x - b.x0 + (rand(seed * 31 + n) - 0.5) * 3 * variation;
      const dy = -row * 32 * lineK + (rand(seed * 131 + n) - 0.5) * 3 * variation;
      for (const g of glyph) out.push({ pts: g.pts.map(([px, py]): Pt => [px + dx, py + dy]), closed: false });
      x += b.x1 - b.x0 + GAP + gap;
    }
  });
  return out;
}

/** Desenho à mão livre (mesmo quadro), Y para cima. */
export const handLines = (s: Strokes) => s.map((st) => ({ pts: st.map(([x, y]): Pt => [x, PAD - y]), closed: false }));
