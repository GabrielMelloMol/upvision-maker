/*
 * Divisão interna da caixa organizadora (#204): o vão de dentro vira faixas (da frente para o fundo) e cada faixa, nichos
 * lado a lado. Funções puras (sem geometria): a malha 3D e o mapa 2D da tela leem a mesma conta.
 */
export type LayoutMode = "equal" | "mixed" | "channel" | "custom";
/** Uma faixa: `n` nichos de largura igual e `ratio` = peso da profundidade dela perto das outras. */
export type Strip = { n: number; ratio: number };
export type Cell = { x0: number; y0: number; x1: number; y1: number };

/** Menor nicho (mm) em que ainda se pega a peça com os dedos. */
export const MIN_CELL = 9;
export const MAX_STRIPS = 8;
export const MAX_PER_STRIP = 10;
export const CHANNEL_RATIO = 1.5;

export type LayoutParams = { layoutMode: LayoutMode; cols: number; rows: number; strips: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 100) / 100;

/** "6:1, 3:1.5" → faixas (da frente para o fundo); entradas ruins são ajustadas aos limites, vazias somem. */
export function parseStrips(text: string): Strip[] {
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_STRIPS)
    .map((s) => {
      const [n, r] = s.split(":");
      return { n: clamp(Math.round(Number(n.replace(",", "."))) || 1, 1, MAX_PER_STRIP), ratio: clamp(Number((r ?? "1").replace(",", ".")) || 1, 0.5, 4) };
    });
}

export const formatStrips = (strips: Strip[]): string => strips.map((s) => `${s.n}:${round(s.ratio)}`).join(", ");

/** As faixas de cada jeito de dividir. Da frente (primeira) para o fundo. */
export function stripsOf(p: LayoutParams): Strip[] {
  const cols = clamp(Math.round(p.cols), 1, MAX_PER_STRIP), rows = clamp(Math.round(p.rows), 1, MAX_STRIPS);
  const rest = (n: number): Strip[] => Array.from({ length: n }, () => ({ n: cols, ratio: 1 }));
  switch (p.layoutMode) {
    case "mixed": // 1ª faixa com metade dos nichos, largos; as outras normais
      return [{ n: Math.max(1, Math.round(cols / 2)), ratio: 1 }, ...rest(rows - 1)];
    case "channel": // uma faixa inteira na frente para peças longas, grade atrás
      return [{ n: 1, ratio: CHANNEL_RATIO }, ...rest(Math.max(1, rows - 1))];
    case "custom": {
      const s = parseStrips(p.strips);
      return s.length ? s : rest(1);
    }
    default:
      return rest(rows);
  }
}

/**
 * Nichos de cada faixa dentro do vão `innerW × innerD`, com parede de `divider` entre eles. Origem no centro do vão;
 * y cresce para o fundo (a primeira faixa é a da frente, y negativo).
 */
export function cellsOf(strips: Strip[], innerW: number, innerD: number, divider: number): Cell[][] {
  const total = strips.reduce((a, s) => a + s.ratio, 0);
  const depth = innerD - (strips.length - 1) * divider;
  let y = -innerD / 2;
  return strips.map((s) => {
    const h = (depth * s.ratio) / total;
    const w = (innerW - (s.n - 1) * divider) / s.n;
    const row = Array.from({ length: s.n }, (_, i) => {
      const x0 = -innerW / 2 + i * (w + divider);
      return { x0, x1: x0 + w, y0: y, y1: y + h };
    });
    y += h + divider;
    return row;
  });
}

/** O menor lado (mm) de qualquer nicho. */
export const smallestSide = (rows: Cell[][]): number => Math.min(...rows.flat().map((c) => Math.min(c.x1 - c.x0, c.y1 - c.y0)));

/** Nichos pequenos demais para pegar a peça: mensagem para a pessoa, ou null se está tudo bem. */
export function layoutProblem(p: LayoutParams, innerW: number, innerD: number, divider: number): string | null {
  const small = smallestSide(cellsOf(stripsOf(p), innerW, innerD, divider));
  return small < MIN_CELL ? `Os nichos ficam com ${String(round(small)).replace(".", ",")} mm: pequeno demais para pegar a peça. Use menos divisões ou aumente a caixa (mínimo ${MIN_CELL} mm).` : null;
}
