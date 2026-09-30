import { bedMm } from "../bed";
import type { CS } from "../manifold";
import { scoped } from "../shape2d";
import type { Mesh, Model, Part } from "../types";
import { moveModel, plateStand, requireArt, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

export type PuzzleParams = {
  width: number; // largura do quebra-cabeça montado
  columns: number; // peças por linha (as linhas seguem a proporção do desenho)
  thickness: number;
  inlay: number; // profundidade da arte embutida na face
  clearance: number; // folga entre peças (e com a moldura)
  face: "up" | "down"; // face para baixo: arte lisa, na primeira camada
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
  thickness: 4,
  inlay: 0.6,
  clearance: 0.3,
  face: "up",
  frame: false,
  stand: false,
  pieceColor: "#f8f8f6",
  artColor: "#2563eb",
  backColor: "#1c1c1e",
  frameColor: "#c9a227",
};

const SPREAD = 3; // espaço entre as peças na mesa
const BACK_MM = 0.6; // verso em outra cor
const FRAME_WALL = 6;
const FRAME_FLOOR = 1.2;
const SMALL_PIECE_MM = 32; // abaixo disso a peça cabe no cilindro de teste de engasgo

/** Gira 180° em torno de Y (face para baixo): x → −x, z → h − z. Duas reflexões: a orientação dos triângulos se mantém. */
function flip(m: Mesh, h: number): Mesh {
  const p = m.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i] = -p[i];
    p[i + 2] = h - p[i + 2];
  }
  return { positions: p, indices: m.indices };
}

/**
 * Quebra-cabeça de peças quadradas com a arte embutida rente na face (uma cor por camada do desenho), verso em
 * outra cor, moldura e suporte opcionais. As peças saem espalhadas na mesa; face para baixo deixa a arte lisa.
 */
export function buildPuzzle(ctx: ModelCtx, p: PuzzleParams): ModelOutput {
  const { M } = ctx;
  const src = requireArt(ctx.art);
  return scoped((k) => {
    const b0 = src.bounds();
    const aspect = (b0.max[1] - b0.min[1]) / (b0.max[0] - b0.min[0]);
    const cols = Math.round(p.columns);
    const cell = p.width / cols;
    const rows = Math.max(1, Math.round((p.width * aspect) / cell));
    const W = cell * cols, H = cell * rows;
    // arte cobrindo o retângulo inteiro (sem sobra de cor da peça nas bordas)
    const s = Math.max(W / (b0.max[0] - b0.min[0]), H / (b0.max[1] - b0.min[1]));
    const art = k(k(k(src.scale(s)).translate(centerShift(src, s))).intersect(k(M.CrossSection.square([W, H], true))));
    const layers: { color: string; cs: CS }[] =
      ctx.artLayers && ctx.artLayers.length > 1 ? ctx.artLayers.map((l) => ({ color: l.color, cs: k(k(l.cs.scale(s)).translate(centerShift(src, s))) })) : [{ color: p.artColor, cs: art }];

    const top = p.thickness;
    const z0 = top - p.inlay;
    const pieces: Model[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cx = -W / 2 + cell * (c + 0.5), cy = H / 2 - cell * (r + 0.5);
        const tile = k(k(M.CrossSection.square([cell - p.clearance, cell - p.clearance], true)).translate([cx, cy]));
        const artHere = k(art.intersect(tile));
        const parts: Part[] = [
          { name: "Verso", color: p.backColor, mesh: slab(tile, BACK_MM) },
          { name: "Peça", color: p.pieceColor, mesh: slab(tile, z0 - BACK_MM, BACK_MM) },
        ];
        const rest = k(tile.subtract(artHere));
        if (!rest.isEmpty()) parts.push({ name: "Peça", color: p.pieceColor, mesh: slab(rest, p.inlay, z0) });
        for (const l of layers) {
          const cs = k(l.cs.intersect(tile));
          if (!cs.isEmpty()) parts.push({ name: "Arte", color: l.color, mesh: slab(cs, p.inlay, z0) });
        }
        const placed = p.face === "down" ? parts.map((q) => ({ ...q, mesh: flip(q.mesh, top) })) : parts;
        // espalha: cada peça anda SPREAD por coluna/linha a partir do centro (mesma ordem, face para baixo espelha X)
        const dx = (c - (cols - 1) / 2) * SPREAD * (p.face === "down" ? -1 : 1), dy = ((rows - 1) / 2 - r) * SPREAD;
        pieces.push(moveModel({ name: `Peça ${r + 1}-${c + 1}`, parts: placed }, dx, dy));
      }

    const spreadW = W + (cols - 1) * SPREAD, spreadH = H + (rows - 1) * SPREAD;
    const extra: Model[] = [];
    let y = -spreadH / 2 - SPREAD * 3;
    if (p.frame) {
      const inner = k(M.CrossSection.square([W + p.clearance, H + p.clearance], true));
      const outer = k(roundedRect(M, W + p.clearance + 2 * FRAME_WALL, H + p.clearance + 2 * FRAME_WALL, 3));
      const tray: Part[] = [
        { name: "Moldura", color: p.frameColor, mesh: slab(outer, FRAME_FLOOR) },
        { name: "Moldura", color: p.frameColor, mesh: slab(k(outer.subtract(inner)), top, FRAME_FLOOR) },
      ];
      const fh = H + p.clearance + 2 * FRAME_WALL;
      extra.push(moveModel({ name: "Moldura", parts: tray }, 0, y - fh / 2));
      y -= fh + SPREAD * 3;
      if (p.stand) extra.push(moveModel(plateStand(M, W, FRAME_FLOOR + top, p.frameColor, 0), 0, y - 15));
    }

    const warnings: string[] = [];
    if (cell < SMALL_PIECE_MM) warnings.push("Peças pequenas: não é brinquedo para menores de 3 anos (risco de engasgo).");
    if (Math.max(spreadW, spreadH) > bedMm()) warnings.push(`As peças espalhadas ocupam ${Math.round(spreadW)} × ${Math.round(spreadH)} mm: passa da mesa de ${bedMm()} mm. Diminua a largura.`);
    if (p.stand && !p.frame) warnings.push("O suporte segura a moldura: ligue a moldura para usar o suporte.");
    return { models: [...pieces, ...extra], warnings };
  });
}

/** Deslocamento que centraliza o desenho escalado em `s` na origem. */
function centerShift(src: CS, s: number): [number, number] {
  const b = src.bounds();
  return [-((b.min[0] + b.max[0]) / 2) * s, -((b.min[1] + b.max[1]) / 2) * s];
}
