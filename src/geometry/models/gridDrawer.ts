import { bedMm } from "../bed";
/*
 * Conta da gaveta para o organizador (#140): quantas casas de 42 mm cabem, a sobra vira margem (por lado),
 * a base se divide pela mesa contando a margem nas pontas e a altura limita a caixinha (uMax).
 * Base: docs/estudos/organizador-gaveta.md, seção 4.
 */
export const GRID = 42;
export const HEIGHT_UNIT = 7;
export const LIP_H = 4.4;
export const DRAWER_GAP = 1; // folga para a base entrar na gaveta
export const TOP_GAP = 3; // folga entre o topo da caixinha e o tampo/gaveta de cima
export const MIN_MARGIN = 2; // margem mais fina que isso não imprime bem: vira folga
export const HALF = GRID / 2;
export const BED_MARGIN = 4; // 256 − 4 = 252 = 6 casas por pedaço na A1

export type DrawerAlign = "center" | "corner";
export type DrawerInput = {
  width: number; // mm, de lado a lado (X)
  depth: number; // mm, da frente ao fundo (Y)
  height: number; // mm, livre na altura
  gap?: number;
  align?: DrawerAlign; // centralizar ou encostar no canto da frente à esquerda
  lip?: boolean; // caixinhas com borda empilhável
  baseFloor?: number; // 0 = base aberta; 3,2 = base com fundo para ímã
  bed?: number;
  bedMargin?: number;
};

export type DrawerPlan = {
  nx: number;
  ny: number;
  /** [esquerda, direita] e [frente, fundo], em mm. */
  marginX: [number, number];
  marginY: [number, number];
  /** A sobra comporta meia casa (21 mm) nesse eixo. */
  halfX: boolean;
  halfY: boolean;
  /** Casas por pedaço em cada eixo (a base sai em piecesX.length × piecesY.length pedaços). */
  piecesX: number[];
  piecesY: number[];
  pieces: number;
  uMax: number;
  notes: string[];
};

/** Altura total da caixinha de `u` unidades (fundo da base + parede + borda). */
export const binHeight = (u: number, lip: boolean, baseFloor: number) => baseFloor + u * HEIGHT_UNIT + (lip ? LIP_H : 0);

/** Maior altura (em unidades de 7 mm) que cabe na gaveta. */
export const uMax = (height: number, lip: boolean, baseFloor: number, topGap = TOP_GAP) => Math.max(0, Math.floor((height - baseFloor - (lip ? LIP_H : 0) - topGap) / HEIGHT_UNIT + 1e-9));

const counts = (n: number, s: number) => Array.from({ length: s }, (_, i) => Math.floor((n * (i + 1)) / s) - Math.floor((n * i) / s));

/**
 * Casas por pedaço num eixo: o menor número de pedaços em que cada um (casas × 42 + a margem, nas pontas) cabe na
 * mesa menos a margem da mesa. As casas se distribuem por igual; o corte cai sempre na divisa das casas.
 */
export function splitAxis(n: number, margin: [number, number], bed = bedMm(), bedMargin = BED_MARGIN): number[] {
  const usable = bed - bedMargin;
  for (let s = 1; s <= n; s++) {
    const c = counts(n, s);
    const fits = c.every((k, i) => k * GRID + (i === 0 ? margin[0] : 0) + (i === s - 1 ? margin[1] : 0) <= usable + 1e-9);
    if (fits) return c;
  }
  return Array(n).fill(1); // margem maior que a mesa: um pedaço por casa (a margem ainda passa; quem chama avisa)
}

function axis(size: number, gap: number, align: DrawerAlign, label: string, notes: string[]): { n: number; margin: [number, number]; half: boolean } {
  const n = Math.max(0, Math.floor((size - gap) / GRID + 1e-9));
  const spare = Math.max(0, size - gap - n * GRID);
  const half = spare >= HALF;
  const each = align === "center" ? spare / 2 : spare;
  if (each < MIN_MARGIN) {
    if (spare > 0.05) notes.push(`${label}: sobra ${fmt(spare)} mm; fica de folga (margem abaixo de ${MIN_MARGIN} mm não imprime bem).`);
    return { n, margin: [0, 0], half };
  }
  return { n, margin: align === "center" ? [each, each] : [0, spare], half };
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

export function drawerPlan(input: DrawerInput): DrawerPlan {
  const { width, depth, height, gap = DRAWER_GAP, align = "center", lip = true, baseFloor = 0, bed = bedMm(), bedMargin = BED_MARGIN } = input;
  const notes: string[] = [];
  const x = axis(width, gap, align, "Largura", notes);
  const y = axis(depth, gap, align, "Profundidade", notes);
  const piecesX = x.n ? splitAxis(x.n, x.margin, bed, bedMargin) : [];
  const piecesY = y.n ? splitAxis(y.n, y.margin, bed, bedMargin) : [];
  const u = uMax(height, lip, baseFloor);
  if (!x.n || !y.n) notes.push("A gaveta é menor que uma casa de 42 mm.");
  if (u < 2) notes.push(`Gaveta baixa: a caixinha mais alta que cabe tem ${u} unidade${u === 1 ? "" : "s"} (o mínimo útil é 2).`);
  return { nx: x.n, ny: y.n, marginX: x.margin, marginY: y.margin, halfX: x.half, halfY: y.half, piecesX, piecesY, pieces: piecesX.length * piecesY.length, uMax: u, notes };
}

/** Resumo em uma frase para a tela. */
export function planSummary(p: DrawerPlan, lip: boolean, baseFloor: number): string {
  const m = (a: [number, number]) => (a[0] === a[1] ? `${fmt(a[0])} mm de cada lado` : `${fmt(a[0])} | ${fmt(a[1])} mm`);
  const margins = p.marginX[0] + p.marginX[1] + p.marginY[0] + p.marginY[1] > 0 ? `; margem ${m(p.marginX)} na largura e ${m(p.marginY)} na profundidade` : "";
  const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `Cabem ${p.nx} × ${p.ny} casas${margins}. Caixinhas de até ${pl(p.uMax, "unidade", "unidades")} (${fmt(binHeight(p.uMax, lip, baseFloor))} mm). A base sai em ${pl(p.pieces, "pedaço", "pedaços")}.`;
}
