import { thinPixels } from "./raster";

/**
 * Avisos específicos sobre a silhueta que o app entendeu (kit card): lê só a máscara (1 = figura) e diz se parece vista de
 * frente, se são várias figuras ou se o contorno é fino demais para o bico. Heurísticas simples: servem de aviso, não de bloqueio.
 */
export type SilhouetteNoteKind = "empty" | "front" | "many" | "thin" | "uncertain";
export type SilhouetteNote = { kind: SilhouetteNoteKind; text: string };
export type SilhouetteReport = { pieces: number; notes: SilhouetteNote[] };

const MIN_PIECE_SHARE = 0.08; // uma figura de verdade tem pelo menos isto da área da maior
const FRONT_SYMMETRY = 0.93; // espelhada na vertical central, a vista de frente quase não muda
const FRONT_MAX_ASPECT = 1.3; // largura / altura: bicho e carro de lado são bem mais largos que altos
const THIN_SHARE = 0.3; // fração da área que some ao abrir pelo bico
const NOMINAL_LENGTH_MM = 70; // comprimento típico da peça no cartão, para converter o bico em pixels
const MIN_FEATURE_NOZZLES = 2;

/** Componentes conectados (4 vizinhos): área e caixa de cada um. */
function components(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(mask.length);
  const out: { area: number; x0: number; y0: number; x1: number; y1: number; px: number[] }[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const c = { area: 0, x0: w, y0: h, x1: 0, y1: 0, px: [] as number[] };
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      c.area++;
      c.px.push(i);
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    out.push(c);
  }
  return out;
}

/** Quanto a figura casa com ela mesma espelhada (0 a 1), dentro da própria caixa. */
function mirrorMatch(c: { x0: number; x1: number; px: number[] }, w: number): number {
  const set = new Set(c.px);
  let both = 0;
  for (const i of c.px) {
    const x = i % w;
    if (set.has(i - x + (c.x0 + c.x1 - x))) both++;
  }
  return both / c.px.length;
}

export function checkSilhouette(mask: Uint8Array, w: number, h: number, nozzleMm: number): SilhouetteReport {
  const comps = components(mask, w, h).sort((a, b) => b.area - a.area);
  if (!comps.length) return { pieces: 0, notes: [{ kind: "empty", text: "Não achei nenhuma figura nesta imagem. Use uma silhueta escura sobre fundo liso." }] };
  const main = comps[0];
  const pieces = comps.filter((c) => c.area >= main.area * MIN_PIECE_SHARE).length;
  const notes: SilhouetteNote[] = [];
  if (pieces > 1) notes.push({ kind: "many", text: `Achei ${pieces} figuras separadas. O kit usa uma só: deixe só o bicho ou o carro na imagem (as outras viram peças soltas ou somem).` });
  const bw = main.x1 - main.x0 + 1, bh = main.y1 - main.y0 + 1;
  if (bw / bh <= FRONT_MAX_ASPECT && mirrorMatch(main, w) >= FRONT_SYMMETRY) notes.push({ kind: "front", text: "Parece uma vista de frente (simétrica e mais alta que larga). O kit precisa da vista de lado: de lado dá para ver o comprimento do bicho ou do carro." });
  const r = Math.max(1, Math.round(((MIN_FEATURE_NOZZLES * nozzleMm) / NOMINAL_LENGTH_MM) * Math.max(bw, bh) / 2));
  const { count } = thinPixels(mask, w, h, r);
  if (count / Math.max(1, comps.reduce((a, c) => a + c.area, 0)) >= THIN_SHARE) notes.push({ kind: "thin", text: "O contorno é muito fino (desenho de linha?). Linha fina não imprime: preencha a figura por dentro, em uma cor só." });
  return { pieces, notes };
}
