import type { CS, ManifoldToplevel } from "../manifold";
import { samplePath } from "../medalDecor";
import { fitInto, outerOnly, scoped } from "../shape2d";
import type { Part } from "../types";
import { MissingInput, roundedRect, slab, solidMesh, union, type ModelCtx, type ModelOutput } from "./common";
import { heart } from "./shapes";

export type StringFrame = "rect" | "heart" | "circle" | "art";
export type StringPattern = "radial" | "vertical" | "crossed";

export type StringArtParams = {
  frame: StringFrame;
  line1: string;
  line2: string;
  mode: "print" | "nails"; // fios impressos ou tábua com furos para pregos de verdade
  pattern: StringPattern;
  size: number;
  frameWidth: number;
  spacing: number; // distância entre fios (ou entre furos)
  threadWidth: number; // espessura mínima: 2 larguras de linha
  height: number; // altura da moldura e do texto
  threadHeight: number;
  backing: boolean; // placa fina de fundo
  frameColor: string;
  textColor: string;
  threadColor: string;
};

export const DEFAULT_STRING_ART: StringArtParams = {
  frame: "heart",
  line1: "Amor",
  line2: "",
  mode: "print",
  pattern: "radial",
  size: 150,
  frameWidth: 4,
  spacing: 3,
  threadWidth: 0.8,
  height: 3,
  threadHeight: 1.2,
  backing: false,
  frameColor: "#1c1c1e",
  textColor: "#1c1c1e",
  threadColor: "#d6262e",
};

const TEXT_FILL = 0.55; // o texto ocupa esta fração da largura do miolo
const TEXT_PAD = 2; // folga em volta do texto antes dos fios
const BACKING = 0.8;
const NAIL_R = 0.9; // furo para prego de 1,5 mm
const NAIL_BOARD = 8;
const LINE_GAP = 0.25;

type Pt = [number, number];

function frameShape(ctx: ModelCtx, kind: StringFrame, size: number): CS {
  const { M } = ctx;
  if (kind === "circle") return M.CrossSection.circle(size / 2, 128);
  if (kind === "heart") return heart(M, size);
  if (kind === "art" && ctx.art) return scoped((k) => outerOnly(M, k(fitInto(ctx.art!, size, size, 0))));
  return roundedRect(M, size, size * 0.75, size * 0.04);
}

/** Fio reto de a a b, com largura w. */
function thread(M: ManifoldToplevel, a: Pt, b: Pt, w: number): CS {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
  const nx = (-(b[1] - a[1]) / len) * (w / 2), ny = ((b[0] - a[0]) / len) * (w / 2);
  return new M.CrossSection([[[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]]], "NonZero");
}

/**
 * String art impresso: moldura (retângulo, coração, círculo ou desenho), texto de 1 ou 2 linhas no meio e fios
 * gerados entre a moldura e o texto (radial, vertical ou cruzado), numa peça só e sem pregos. Modo tábua: placa com
 * furos nos mesmos pontos, para pregos e linha de verdade.
 */
export function buildStringArt(ctx: ModelCtx, p: StringArtParams): ModelOutput {
  const { M, text } = ctx;
  if (p.frame === "art" && !ctx.art) throw new MissingInput("Envie o desenho da moldura.");
  return scoped((k) => {
    const outer = k(frameShape(ctx, p.frame, p.size));
    const inner = k(outer.offset(-p.frameWidth, "Round"));
    const ib = inner.bounds();
    const [iw, ih] = [ib.max[0] - ib.min[0], ib.max[1] - ib.min[1]];
    const c: Pt = [(ib.min[0] + ib.max[0]) / 2, (ib.min[1] + ib.max[1]) / 2];
    // texto: 1 ou 2 linhas empilhadas no centro do miolo
    const lines = [p.line1, p.line2].map((s) => text(s, 20)).filter((x): x is CS => !!x).map(k);
    let y = 0;
    const stacked = lines.map((l) => {
      const b = l.bounds();
      const out = k(l.translate([-(b.min[0] + b.max[0]) / 2, y - b.max[1]]));
      y -= b.max[1] - b.min[1] + 20 * LINE_GAP;
      return out;
    });
    const words = stacked.length ? k(fitInto(k(union(M, stacked)), iw * TEXT_FILL, ih * TEXT_FILL, c[1])) : null;
    const wordsAt = words ? k(words.translate([c[0], 0])) : null;
    const keepOut = wordsAt ? k(outerOnly(M, k(wordsAt.offset(TEXT_PAD, "Round")))) : null;

    // pontos na borda de dentro da moldura e em volta do texto
    const framePts = samplePath(inner, p.spacing).map((s) => s.p);
    const textPts = keepOut ? samplePath(keepOut, p.spacing).map((s) => s.p) : [];

    if (p.mode === "nails") {
      const holes = [...framePts, ...textPts].map((q) => k(k(M.CrossSection.circle(NAIL_R, 12)).translate(q)));
      const board = k(k(outer.subtract(k(union(M, holes)))).extrude(NAIL_BOARD));
      const parts: Part[] = [{ name: "Tábua", color: p.frameColor, mesh: solidMesh(board) }];
      if (wordsAt) parts.push({ name: "Texto", color: p.textColor, mesh: slab(wordsAt, 0.8, NAIL_BOARD) });
      return { models: [{ name: "Tábua de string art", parts }], warnings: [`${framePts.length + textPts.length} furos para prego de até 1,5 mm.`] };
    }

    const segs: CS[] = [];
    if (p.pattern === "radial" && textPts.length) {
      // cada ponto da moldura liga ao ponto do texto com o mesmo ângulo a partir do centro
      const ang = (q: Pt) => Math.atan2(q[1] - c[1], q[0] - c[0]);
      const tp = textPts.map((q) => ({ q, a: ang(q) }));
      for (const f of framePts) {
        const a = ang(f);
        const best = tp.reduce((m, t) => (Math.abs(Math.atan2(Math.sin(t.a - a), Math.cos(t.a - a))) < Math.abs(Math.atan2(Math.sin(m.a - a), Math.cos(m.a - a))) ? t : m));
        segs.push(k(thread(M, f, best.q, p.threadWidth)));
      }
    } else {
      const R = Math.hypot(iw, ih);
      const dirs = p.pattern === "crossed" ? [45, -45] : [90];
      for (const d of dirs) {
        const r = (d * Math.PI) / 180, v: Pt = [Math.cos(r), Math.sin(r)], n: Pt = [-v[1], v[0]];
        for (let t = -R; t <= R; t += p.spacing) {
          const o: Pt = [c[0] + n[0] * t, c[1] + n[1] * t];
          segs.push(k(thread(M, [o[0] - v[0] * R, o[1] - v[1] * R], [o[0] + v[0] * R, o[1] + v[1] * R], p.threadWidth)));
        }
      }
    }
    let threads = k(k(union(M, segs)).intersect(inner));
    if (keepOut) threads = k(threads.subtract(keepOut));
    const z = p.backing ? BACKING : 0;
    const parts: Part[] = [];
    if (p.backing) parts.push({ name: "Fundo", color: p.frameColor, mesh: slab(outer, BACKING) });
    parts.push({ name: "Moldura", color: p.frameColor, mesh: slab(k(outer.subtract(inner)), p.height, z) });
    if (wordsAt) {
      // o texto ganha uma borda que segura a ponta dos fios
      const rim = k(k(keepOut!.subtract(k(keepOut!.offset(-p.threadWidth * 2, "Round")))).add(wordsAt));
      parts.push({ name: "Texto", color: p.textColor, mesh: slab(rim, p.height, z) });
    }
    if (!threads.isEmpty()) parts.push({ name: "Fios", color: p.threadColor, mesh: slab(threads, p.threadHeight, z) });
    const warnings = p.threadWidth < 0.8 ? ["Fio com menos de 0,8 mm pode falhar: use 2 larguras de linha (0,84 mm com bico 0,4)."] : [];
    if (!p.backing) warnings.push("Sem fundo, a peça fica presa só pelos fios: tire da mesa com cuidado (espátula fina).");
    return { models: [{ name: "String art", parts }], warnings };
  });
}
