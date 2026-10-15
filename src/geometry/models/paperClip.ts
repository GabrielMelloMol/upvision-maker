import type { CS, ManifoldToplevel } from "../manifold";
import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { artParts, backing, slab, type ModelCtx, type ModelOutput } from "./common";

/*
 * Clipe de papel (#213): um clipe chato de verdade, impresso deitado, no formato do clipe de arame (três voltas e duas
 * pontas soltas), com uma "cabeça" decorativa (texto ou desenho) emendada no lado fechado. O clipe é uma fita fina
 * (~1,6 mm) de 1,7 mm de altura: o PLA e o PETG flexionam o bastante para abrir 1 a 2 folhas.
 */
type K = <D extends { delete(): void }>(o: D) => D;
type Pt = [number, number];

export type PaperClipParams = {
  length: number; // comprimento do clipe (sem a cabeça)
  width: number;
  band: number; // largura da fita
  thickness: number;
  headSize: number; // largura máxima da cabeça (texto ou desenho)
  border: number; // borda da cabeça em volta da arte
  relief: number;
  text: string;
  clipColor: string;
  artColor: string;
};

export const DEFAULT_PAPER_CLIP: PaperClipParams = { length: 38, width: 14, band: 1.6, thickness: 1.7, headSize: 28, border: 1.8, relief: 0.6, text: "LER", clipColor: "#2563eb", artColor: "#f8f8f6" };

const RUN_GAP = 1.0; // vão entre duas fitas vizinhas: o papel entra ali
const HEAD_OVERLAP = 3; // quanto a cabeça entra na curva fechada do clipe

/** Linha central do clipe de arame (x ao longo do comprimento, y na largura), do fim de dentro ao fim de fora. */
export function paperClipPath(length: number, width: number, band: number): Pt[] {
  const pitch = band + RUN_GAP;
  const yB = band / 2; // fita de baixo (externa)
  const yT = width - band / 2; // fita de cima (externa)
  const yIT = yT - pitch; // fita interna de cima
  const yIB = yB + pitch; // fita interna de baixo
  const arc = (cx: number, cy: number, r: number, from: number, to: number, n = 28): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = from + ((to - from) * i) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
  const rLeft = (yT - yIB) / 2; // volta da esquerda: liga a fita interna de baixo à externa de cima
  const rRight = (yT - yB) / 2; // volta externa da direita: liga a externa de cima à externa de baixo
  const rMid = (yIT - yIB) / 2; // volta interna da direita: liga a interna de cima à interna de baixo
  const xR = length - rRight - band / 2; // a fita redonda sai meia largura além da linha central: o clipe mede `length`
  const xL = rLeft + band / 2;
  const pts: Pt[] = [];
  // ponta de dentro (fita interna de cima) → volta interna da direita → fita interna de baixo →
  // volta da esquerda → fita externa de cima → volta externa da direita → fita externa de baixo (ponta de fora)
  pts.push([length * 0.42, yIT], [xR - 2.2, yIT]);
  pts.push(...arc(xR - 2.2, (yIT + yIB) / 2, rMid, Math.PI / 2, -Math.PI / 2));
  pts.push([xL, yIB]);
  pts.push(...arc(xL, (yT + yIB) / 2, rLeft, -Math.PI / 2, -3 * Math.PI / 2));
  pts.push([xR, yT]);
  pts.push(...arc(xR, (yT + yB) / 2, rRight, Math.PI / 2, -Math.PI / 2));
  pts.push([length * 0.3, yB]);
  return pts;
}

/** A fita em volta da linha central: cada trecho vira uma cápsula (cantos redondos), todas unidas. */
function strip(M: ManifoldToplevel, k: K, pts: Pt[], band: number): CS {
  const r = band / 2;
  const segs: CS[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    segs.push(k(M.CrossSection.hull([k(k(M.CrossSection.circle(r, 12)).translate(a)), k(k(M.CrossSection.circle(r, 12)).translate(b))])));
  }
  return M.CrossSection.union(segs);
}

export function buildPaperClip(ctx: ModelCtx, p: PaperClipParams): ModelOutput {
  const { M, text, art, artLayers } = ctx;
  return scoped((k) => {
    const clip = k(strip(M, k, paperClipPath(p.length, p.width, p.band), p.band));
    const warnings: string[] = [];
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    let body = clip;
    const parts = [];
    if (src) {
      const h = p.width * 1.9;
      const fitted = k(fitInto(src, p.headSize, h, 0));
      const head = k(backing(M, fitted, p.border));
      const hb = head.bounds();
      // a cabeça fica à esquerda, entrando um pouco na volta fechada
      const placedHead = k(head.translate([-hb.max[0] + HEAD_OVERLAP, p.width / 2]));
      const placedArt = k(fitted.translate([-hb.max[0] + HEAD_OVERLAP, p.width / 2]));
      body = k(M.CrossSection.union([clip, placedHead]));
      const shrunk = k(shrinkToFit(placedArt, placedHead));
      if (!shrunk.isEmpty()) parts.push(...artParts({ M, text, art, artLayers }, shrunk, p.artColor, "Arte", p.relief, p.thickness));
      if (hb.max[0] - hb.min[0] > p.headSize * 1.3) warnings.push("A cabeça ficou larga: diminua o texto ou o tamanho da cabeça.");
    }
    return { models: [{ name: "Clipe de papel", parts: [{ name: "Clipe", color: p.clipColor, mesh: slab(body, p.thickness) }, ...parts] }], warnings };
  });
}
