import type { CS, ManifoldToplevel } from "../manifold";
import { fitInto, outerOnly, scoped } from "../shape2d";
import type { Mesh, Model, Part } from "../types";
import { MissingInput, moveMesh, moveModel, plateStand, slab, type ModelCtx, type ModelOutput } from "./common";
import { knobDepth, puzzleGrid, type CutOptions, type Knob } from "./puzzleCuts";
import { heart } from "./shapes";

export type PuzzleOutline = "rect" | "circle" | "heart" | "art";

export type PuzzleParams = {
  width: number; // largura do quebra-cabeça montado
  columns: number; // peças por linha
  rows: number; // 0 = segue a proporção do desenho/contorno
  knob: Knob; // tipo de encaixe (#159)
  knobSize: number; // altura da orelha, % do lado da peça
  random: boolean; // cada peça diferente (sorteio pela semente)
  seed: number;
  outline: PuzzleOutline;
  thickness: number;
  inlay: number; // profundidade da arte embutida na face
  clearance: number; // folga entre peças (e com a moldura)
  face: "up" | "down"; // face para baixo: arte lisa, na primeira camada
  numbers: boolean; // número gravado no verso para montar
  output: "full" | "test"; // test = 4 peças (2 × 2) sem arte para acertar a folga
  layout: "spread" | "assembled"; // assembled: só para ver montado
  frame: boolean;
  stand: boolean;
  pieceColor: string;
  artColor: string;
  backColor: string;
  frameColor: string;
};

export const DEFAULT_PUZZLE: PuzzleParams = {
  width: 120,
  columns: 4,
  rows: 0,
  knob: "classic",
  knobSize: 22,
  random: true,
  seed: 1,
  outline: "rect",
  thickness: 4,
  inlay: 0.6,
  clearance: 0.25,
  face: "up",
  numbers: true,
  output: "full",
  layout: "spread",
  frame: false,
  stand: false,
  pieceColor: "#f8f8f6",
  artColor: "#2563eb",
  backColor: "#1c1c1e",
  frameColor: "#c9a227",
};

const SPREAD = 3; // espaço livre entre as peças na mesa (além da orelha)
const BACK_MM = 0.6; // verso em outra cor
const NUM_DEPTH = 0.4; // número gravado no verso
const NUM_MAX_MM = 8;
const FRAME_WALL = 6;
const FRAME_FLOOR = 1.2;
const SMALL_PIECE_MM = 32; // abaixo disso a peça cabe no cilindro de teste de engasgo
const MIN_NECK_MM = 2.4;
const SLIVER = 0.15; // pedaço cortado pelo contorno menor que isso (fração da peça) gruda na vizinha

/** Gira 180° em torno de Y (face para baixo): x → −x, z → h − z. Duas reflexões: a orientação dos triângulos se mantém. */
function flip(m: Mesh, h: number): Mesh {
  const p = m.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i] = -p[i];
    p[i + 2] = h - p[i + 2];
  }
  return { positions: p, indices: m.indices };
}

/** Contorno do quebra-cabeça montado, dentro de W × H e centrado. */
function outlineShape(M: ManifoldToplevel, kind: PuzzleOutline, art: CS | null, W: number, H: number): CS {
  if (kind === "circle") return M.CrossSection.circle(Math.min(W, H) / 2, 96);
  if (kind === "heart") return scoped((k) => fitInto(k(heart(M, H)), W, H, 0));
  if (kind === "art") {
    if (!art) throw new MissingInput("Envie o desenho para usar o contorno dele.");
    return scoped((k) => outerOnly(M, k(fitInto(art, W, H, 0))));
  }
  return M.CrossSection.square([W, H], true);
}

type Region = { cs: CS; r: number; c: number };
type K = <D extends { delete(): void }>(o: D) => D;

/**
 * Regiões das peças antes da folga: cada célula da grade cortada pelo contorno; pedaço pequeno que o contorno deixou
 * gruda na vizinha com quem divide mais borda; peças fora do contorno somem.
 */
export function pieceRegions(M: ManifoldToplevel, k: K, cut: CutOptions, outline: CS): Region[] {
  const min = SLIVER * cut.cell * cut.cell;
  const big: Region[] = [], small: CS[] = [];
  puzzleGrid(cut).forEach((row, r) =>
    row.forEach((poly, c) => {
      const cs = k(k(new M.CrossSection([poly], "Positive")).intersect(outline));
      for (const part of cs.decompose().map(k)) {
        if (part.area() >= min) big.push({ cs: part, r, c });
        else if (part.area() > 1e-6) small.push(part);
      }
    }),
  );
  for (const s of small) {
    const grown = k(s.offset(0.05, "Square"));
    const best = big.map((b, i) => ({ i, a: k(grown.intersect(b.cs)).area() })).sort((a, b) => b.a - a.a)[0];
    if (best && best.a > 0) big[best.i] = { ...big[best.i], cs: k(big[best.i].cs.add(s)) };
  }
  return big;
}

/** Número no verso, espelhado (lê-se virando a peça), dentro da peça. */
function backNumber(ctx: ModelCtx, k: K, n: number, shape: CS, cell: number): CS | null {
  const t = ctx.text(String(n), Math.min(NUM_MAX_MM, cell * 0.28));
  if (!t) return null;
  const tb = k(t).bounds(), sb = shape.bounds();
  const placed = k(k(k(t.translate([-(tb.min[0] + tb.max[0]) / 2, -(tb.min[1] + tb.max[1]) / 2])).scale([-1, 1])).translate([(sb.min[0] + sb.max[0]) / 2, (sb.min[1] + sb.max[1]) / 2]));
  const inside = k(placed.intersect(k(shape.offset(-0.8, "Round"))));
  return inside.isEmpty() ? null : inside;
}

/**
 * Quebra-cabeça com encaixe de verdade (#159): orelhas de vários tipos (com sorteio pela semente), contorno retângulo,
 * círculo, coração ou o do desenho, arte embutida rente na face (uma cor por camada), verso em outra cor com número
 * gravado, moldura e suporte opcionais, e a peça de teste 2 × 2 para acertar a folga. As peças saem espalhadas com
 * folga para as orelhas; a checagem de mesa rearruma ou divide se não couber.
 */
export function buildPuzzle(ctx: ModelCtx, p: PuzzleParams): ModelOutput {
  const { M } = ctx;
  const test = p.output === "test";
  const src = test || !ctx.art || ctx.art.isEmpty() ? null : ctx.art;
  if (!test && p.outline === "art" && !src) throw new MissingInput("Envie o desenho para usar o contorno dele.");
  return scoped((k) => {
    const cols = test ? 2 : Math.round(p.columns);
    const cell = p.width / Math.round(p.columns);
    const b0 = src?.bounds();
    // linhas automáticas: seguem a proporção do desenho (retângulo ou contorno do desenho); círculo e coração, quadrado
    const aspect = b0 && (p.outline === "rect" || p.outline === "art") ? (b0.max[1] - b0.min[1]) / (b0.max[0] - b0.min[0]) : 1;
    const rows = test ? 2 : p.rows > 0 ? Math.round(p.rows) : Math.max(1, Math.round(cols * aspect));
    const W = cell * cols, H = cell * rows;
    const outline = k(test ? M.CrossSection.square([W, H], true) : outlineShape(M, p.outline, src, W, H));
    const cut: CutOptions = { cols, rows, cell, knob: p.knob, size: p.knobSize / 100, seed: p.seed, random: p.random };
    const regions = pieceRegions(M, k, cut, outline);

    // arte cobrindo o contorno inteiro (sem sobra de cor da peça nas bordas)
    const ob = outline.bounds();
    const fit = (cs: CS) => {
      const b = src!.bounds();
      const s = Math.max((ob.max[0] - ob.min[0]) / (b.max[0] - b.min[0]), (ob.max[1] - ob.min[1]) / (b.max[1] - b.min[1]));
      return k(k(k(cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2])).scale(s)).translate([(ob.min[0] + ob.max[0]) / 2, (ob.min[1] + ob.max[1]) / 2]));
    };
    const art = src ? k(fit(src).intersect(outline)) : null;
    const layers: { color: string; cs: CS }[] = !art ? [] : ctx.artLayers && ctx.artLayers.length > 1 ? ctx.artLayers.map((l) => ({ color: l.color, cs: fit(l.cs) })) : [{ color: p.artColor, cs: art }];

    const top = p.thickness;
    const z0 = top - (art ? p.inlay : 0);
    const assembled = p.layout === "assembled";
    const pitch = knobDepth(cut) + SPREAD; // afasta cada coluna/linha o bastante para a orelha não entrar na vizinha
    const pieces = regions.map((g, i): Model => {
      const shape = k(g.cs.offset(-p.clearance / 2, "Round"));
      const num = p.numbers ? backNumber(ctx, k, i + 1, shape, cell) : null;
      const back = num ? k(shape.subtract(num)) : shape;
      const parts: Part[] = [{ name: "Verso", color: p.backColor, mesh: slab(back, num ? NUM_DEPTH : BACK_MM) }];
      if (num) parts.push({ name: "Verso", color: p.backColor, mesh: slab(shape, BACK_MM - NUM_DEPTH, NUM_DEPTH) });
      parts.push({ name: "Peça", color: p.pieceColor, mesh: slab(shape, z0 - BACK_MM, BACK_MM) });
      if (art) {
        const rest = k(shape.subtract(art));
        if (!rest.isEmpty()) parts.push({ name: "Peça", color: p.pieceColor, mesh: slab(rest, p.inlay, z0) });
        for (const l of layers) {
          const cs = k(l.cs.intersect(shape));
          if (!cs.isEmpty()) parts.push({ name: "Arte", color: l.color, mesh: slab(cs, p.inlay, z0) });
        }
      }
      const placed = p.face === "down" ? parts.map((q) => ({ ...q, mesh: flip(q.mesh, top) })) : parts;
      const name = `Peça ${i + 1}`;
      if (assembled) return { name, parts: p.frame ? placed.map((q) => ({ ...q, mesh: moveMesh(q.mesh, 0, 0, FRAME_FLOOR) })) : placed };
      // espalha: cada coluna/linha anda `pitch` a partir do centro (face para baixo espelha X)
      const dx = (g.c - (cols - 1) / 2) * pitch * (p.face === "down" ? -1 : 1), dy = ((rows - 1) / 2 - g.r) * pitch;
      return moveModel({ name, parts: placed }, dx, dy);
    });

    const extra: Model[] = [];
    if (p.frame && !test) {
      const inner = k(outline.offset(p.clearance / 2, "Round"));
      const outer = k(inner.offset(FRAME_WALL, "Round"));
      const tray: Model = {
        name: "Moldura",
        parts: [
          { name: "Moldura", color: p.frameColor, mesh: slab(outer, FRAME_FLOOR) },
          { name: "Moldura", color: p.frameColor, mesh: slab(k(outer.subtract(inner)), top, FRAME_FLOOR) },
        ],
      };
      const fb = outer.bounds();
      const fh = fb.max[1] - fb.min[1];
      let y = -(H + (rows - 1) * pitch) / 2 - SPREAD * 3;
      extra.push(assembled ? tray : moveModel(tray, 0, y - fh / 2));
      y -= fh + SPREAD * 3;
      if (p.stand) extra.push(moveModel(plateStand(M, fb.max[0] - fb.min[0], FRAME_FLOOR + top, p.frameColor, 0), 0, assembled ? -fh / 2 - 20 : y - 15));
    }

    const warnings: string[] = [];
    if (cell < SMALL_PIECE_MM) warnings.push("Peças pequenas: não é brinquedo para menores de 3 anos (risco de engasgo).");
    // pescoço do encaixe clássico (0,46 × orelha × lado, menos a folga): fino demais quebra ao desmontar
    if (p.knob === "classic" && 0.462 * (p.knobSize / 100) * cell - p.clearance < MIN_NECK_MM) warnings.push("Pescoço do encaixe fino demais: aumente o tamanho da orelha ou das peças.");
    if (test) warnings.push(`Peça de teste: imprima, encaixe e ajuste a folga (agora ${String(p.clearance).replace(".", ",")} mm). Justa demais, aumente; frouxa, diminua.`);
    if (assembled) warnings.push("Montado é só para ver: para imprimir, escolha Espalhado.");
    if (p.stand && !p.frame) warnings.push("O suporte segura a moldura: ligue a moldura para usar o suporte.");
    return { models: [...pieces, ...extra], warnings };
  });
}
