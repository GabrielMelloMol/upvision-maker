import { pixelate } from "../pixelArt";
import type { PieceItem, MosaicColor } from "./pieces";
import { ROTATES, type MosaicShape } from "./shapes";

/*
 * Desenho do mosaico (#206): uma grade onde cada casa tem uma cor (da paleta do kit), um formato e um giro, ou está vazia.
 * `cells[r * cols + c]`, linha 0 em cima.
 */
export type Cell = { color: string; shape: MosaicShape; rot: number };
export type MosaicGrid = { cols: number; rows: number; cells: (Cell | null)[] };

/** As cores do kit (todas de filamento comum). O olho usa o branco e a pupila o preto. */
export const KIT_COLORS: MosaicColor[] = [
  { key: "red", label: "Vermelho", hex: "#d62828" },
  { key: "orange", label: "Laranja", hex: "#f97316" },
  { key: "yellow", label: "Amarelo", hex: "#f7c52b" },
  { key: "green", label: "Verde", hex: "#16a34a" },
  { key: "blue", label: "Azul", hex: "#2563eb" },
  { key: "purple", label: "Roxo", hex: "#c026d3" },
  { key: "brown", label: "Marrom", hex: "#7c3f1d" },
  { key: "white", label: "Branco", hex: "#f8f8f6" },
  { key: "black", label: "Preto", hex: "#1c1c1e" },
];
/** As seis do pote do vídeo-referência, mais o branco (olhos) e o preto (pupilas). */
export const DEFAULT_KEYS = ["red", "orange", "yellow", "green", "blue", "purple", "white", "black"];

export const blankGrid = (cols: number, rows: number): MosaicGrid => ({ cols, rows, cells: Array<Cell | null>(cols * rows).fill(null) });

export const cellAt = (g: MosaicGrid, c: number, r: number): Cell | null => (c < 0 || r < 0 || c >= g.cols || r >= g.rows ? null : g.cells[r * g.cols + c]);

/** Pinta (ou apaga, com null) uma casa; devolve uma grade nova, ou a mesma se nada mudou. */
export function paintCell(g: MosaicGrid, c: number, r: number, cell: Cell | null): MosaicGrid {
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return g;
  const old = g.cells[r * g.cols + c];
  if (old === cell || (old && cell && old.color === cell.color && old.shape === cell.shape && old.rot === cell.rot)) return g;
  return { ...g, cells: g.cells.map((x, i) => (i === r * g.cols + c ? cell : x)) };
}

/** Giro que importa: formatos que são iguais girados ficam em 0. */
export const normCell = (cell: Cell): Cell => ({ ...cell, rot: ROTATES(cell.shape) ? ((Math.round(cell.rot) % 4) + 4) % 4 : 0 });

/** Peças que o desenho pede: uma entrada por cor e formato, com a contagem. O olho sempre é branco. */
export function partsOf(g: MosaicGrid, colors: MosaicColor[]): PieceItem[] {
  const byKey = new Map(colors.map((c) => [c.key, c]));
  const n = new Map<string, PieceItem>();
  for (const cell of g.cells) {
    if (!cell) continue;
    const color = byKey.get(cell.shape === "eye" ? "white" : cell.color);
    if (!color) continue;
    const id = `${color.key}:${cell.shape}`;
    const cur = n.get(id);
    if (cur) cur.n++;
    else n.set(id, { shape: cell.shape, color, n: 1 });
  }
  return [...n.values()].sort((a, b) => colors.findIndex((c) => c.key === a.color.key) - colors.findIndex((c) => c.key === b.color.key) || a.shape.localeCompare(b.shape));
}

/** Total de peças. */
export const countCells = (g: MosaicGrid) => g.cells.filter(Boolean).length;

/** Cores que o desenho usa, na ordem do kit. */
export const colorsUsed = (g: MosaicGrid, colors: MosaicColor[]): MosaicColor[] => {
  const used = new Set(g.cells.flatMap((c) => (c ? [c.shape === "eye" ? "white" : c.color] : [])));
  return colors.filter((c) => used.has(c.key));
};

export type CornerStyle = "none" | "quarter" | "triangle";

/**
 * Arredonda (ou chanfra) os cantos de fora do desenho: onde duas bordas vizinhas de uma casa de quadrado dão para o
 * vazio, ela vira quarto de círculo (ou triângulo) com a curva virada para o canto.
 */
export function roundCorners(g: MosaicGrid, style: CornerStyle): MosaicGrid {
  if (style === "none") return g;
  const empty = (c: number, r: number) => cellAt(g, c, r) === null;
  const cells = g.cells.map((cell, i) => {
    if (!cell || cell.shape !== "square") return cell;
    const c = i % g.cols, r = Math.floor(i / g.cols);
    const [n, e, s, w] = [empty(c, r - 1), empty(c + 1, r), empty(c, r + 1), empty(c - 1, r)];
    if ([n, e, s, w].filter(Boolean).length !== 2) return cell;
    const rot = n && e ? 0 : n && w ? 1 : s && w ? 2 : s && e ? 3 : -1;
    return rot < 0 ? cell : { ...cell, shape: style, rot };
  });
  return { ...g, cells };
}

/** Cor do kit mais perto de um hex que a conversão devolveu (a paleta enviada à conversão tem só cores do kit). */
const keyOfHex = (hex: string, colors: MosaicColor[]) => colors.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.key;

/**
 * Imagem → mosaico: reduz para `size` casas no lado maior usando só as cores do kit e põe quadrados; `corners` troca
 * os cantos de fora por quartos de círculo ou triângulos.
 */
export function gridFromImage(rgba: Uint8ClampedArray, w: number, h: number, size: number, colors: MosaicColor[], corners: CornerStyle): MosaicGrid {
  const g = pixelate(rgba, w, h, size, Math.min(8, Math.max(2, colors.length)), colors.map((c) => c.hex));
  const cells = g.cells.map((v): Cell | null => {
    if (v < 0) return null;
    const key = keyOfHex(g.palette[v], colors);
    return key ? { color: key, shape: "square", rot: 0 } : null;
  });
  return roundCorners({ cols: g.cols, rows: g.rows, cells }, corners);
}

const SHAPE_CODES: Record<string, { shape: MosaicShape; rot: number }> = {
  "#": { shape: "square", rot: 0 },
  o: { shape: "circle", rot: 0 },
  e: { shape: "eye", rot: 0 },
  "1": { shape: "quarter", rot: 0 }, "2": { shape: "quarter", rot: 1 }, "3": { shape: "quarter", rot: 2 }, "4": { shape: "quarter", rot: 3 },
  A: { shape: "triangle", rot: 0 }, B: { shape: "triangle", rot: 1 }, C: { shape: "triangle", rot: 2 }, D: { shape: "triangle", rot: 3 },
  u: { shape: "half", rot: 0 }, l: { shape: "half", rot: 1 }, d: { shape: "half", rot: 2 }, r: { shape: "half", rot: 3 },
};
const COLOR_CODES: Record<string, string> = { r: "red", o: "orange", y: "yellow", g: "green", b: "blue", p: "purple", n: "brown", w: "white", k: "black" };

/**
 * Lê um desenho escrito em texto: cada casa são dois caracteres, cor + formato (".." = vazia).
 * Cores: r o y g b p(roxo) n(marrom) w k. Formatos: # quadrado, o círculo, e olho, 1-4 quarto de círculo (curva no
 * quadrante 1 = alto à direita, 2 = alto à esquerda, 3 = baixo à esquerda, 4 = baixo à direita), A-D triângulo (o
 * mesmo para a diagonal), u l d r meio-círculo com a curva para cima, esquerda, baixo e direita.
 */
export function parseDesign(rows: string[]): MosaicGrid {
  const cells: (Cell | null)[] = [];
  const cols = rows[0].replace(/\s/g, "").length / 2;
  for (const row of rows) {
    const t = row.replace(/\s/g, "");
    if (t.length !== cols * 2) throw new Error(`Desenho com linha de tamanho diferente: "${row}"`);
    for (let c = 0; c < cols; c++) {
      const [col, sh] = [t[c * 2], t[c * 2 + 1]];
      if (col === ".") {
        cells.push(null);
        continue;
      }
      const color = COLOR_CODES[col], s = SHAPE_CODES[sh];
      if (!color || !s) throw new Error(`Casa desconhecida "${col}${sh}" em "${row}"`);
      cells.push({ color, ...s });
    }
  }
  return { cols, rows: rows.length, cells };
}
