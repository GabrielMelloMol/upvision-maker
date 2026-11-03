/**
 * Camadas da caneta (#320): cada item (texto, desenho, forma, peça 3D ou mão livre) tem o próprio conteúdo,
 * preenchimento e lugar na mesa. As linhas saem Y para cima; `placeLines` põe no lugar.
 */
import { loadFont, type FontId } from "./fonts";
import { handLines, myLines, type Alphabet, type Strokes } from "./handwriting";
import { hersheyLines, type StrokeFontId } from "./hershey";
import { getManifold } from "./manifold";
import { FILL_DEFAULTS, type Fill, type Place, type Pt } from "./plotter";
import { shapeLines, SHAPE_DEFAULT, SHAPES, type Shape } from "./plotShapes";
import { svgLines } from "./svgImport";
import { textContours } from "./text";

export type Line = { pts: Pt[]; closed: boolean };
export type ItemKind = "text" | "design" | "shape" | "model" | "hand";
export type Lettering = "single" | "mine" | "font";
export type Align = "left" | "center" | "right";

/** Um item da mesa. Os campos de conteúdo valem conforme o `kind` (os outros ficam de fora). */
export type PlotItem = Place & {
  id: string;
  kind: ItemKind;
  hidden?: boolean;
  /** Caneta 1, 2, 3… (#333): o G-code desenha uma caneta por vez, em ordem, com pausa para trocar. */
  pen?: number;
  fill: Fill;
  svg?: { text: string; name: string } | null;
  text?: string;
  lettering?: Lettering;
  font?: FontId;
  /** Letra de traço, quando `lettering` = "single" (#324). */
  stroke?: StrokeFontId;
  /** Texto (#324): altura da maiúscula em mm e alinhamento; `w` é a largura da caixa, que quebra as linhas. */
  size?: number;
  align?: Align;
  /** Espaço a mais entre letras (unidades da letra; a maiúscula tem 21) e vezes a distância entre linhas. */
  gap?: number;
  lineK?: number;
  variation?: number;
  hand?: Strokes;
  shape?: Shape;
  model?: { name: string; lines: Line[] };
};

export const KIND_LABEL: Record<ItemKind, string> = { text: "Texto", design: "Desenho ou imagem", shape: "Forma", model: "Peça 3D", hand: "À mão livre" };

/** Conteúdo novo de cada tipo (o lugar vem de quem cria). */
export function newItem(kind: ItemKind, place: Place, id: string = crypto.randomUUID()): PlotItem {
  const base = { id, kind, fill: FILL_DEFAULTS, ...place };
  if (kind === "text") return { ...base, text: "Obrigada!", lettering: "single", stroke: "scripts", font: "sacramento", size: 10, align: "center", gap: 0, lineK: 1, variation: 0.5 };
  if (kind === "shape") return { ...base, shape: SHAPE_DEFAULT };
  if (kind === "hand") return { ...base, hand: [] };
  if (kind === "design") return { ...base, svg: null };
  return { ...base, model: { name: "", lines: [] } };
}

/** Nome na lista de camadas. */
export function itemName(it: PlotItem): string {
  if (it.kind === "text") return (it.text ?? "").split("\n")[0].slice(0, 24) || "Texto vazio";
  if (it.kind === "design") return it.svg?.name ?? "Sem desenho";
  if (it.kind === "model") return it.model?.name || "Sem peça";
  if (it.kind === "shape") return SHAPES.find(([k]) => k === it.shape?.kind)?.[1] ?? "Forma";
  return KIND_LABEL[it.kind];
}

/** Chave do conteúdo (sem lugar nem preenchimento): mover a camada não recalcula as linhas; no texto, a caixa (largura) conta. */
export const contentKey = (it: PlotItem, alphabet: Alphabet) =>
  JSON.stringify([it.kind, it.svg?.text.length, it.svg?.name, it.text, it.lettering, it.stroke, it.font, it.gap, it.lineK, it.variation, it.hand, it.shape, it.model?.name, it.model?.lines.length, it.lettering === "mine" ? alphabet : null, it.kind === "text" ? [it.w, it.size, it.align] : null]);

const CAP = 21; // maiúscula das letras de traço, em unidades Hershey
const ROW = 32 / 21; // distância entre linhas ÷ maiúscula

type Box = { size: number; w: number; align: Align; lineK: number };

/**
 * Texto em caixa (#324), como no Canva: a maiúscula com `size` mm, as palavras quebram na largura `w` e cada linha
 * alinha na caixa. `layout` desenha uma linha nas unidades da letra (maiúscula = `cap`). Sai em mm, caixa de x = 0 a w.
 */
export function textBlock(text: string, layout: (line: string, row: number) => Line[], cap: number, { size, w, align, lineK }: Box): Line[] {
  const k = size / cap;
  const max = w / k;
  const span = (ls: Line[]) => {
    const xs = ls.flatMap((l) => l.pts.map((p) => p[0]));
    return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
  };
  const rows: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const word of para.split(/ +/)) {
      const next = cur ? `${cur} ${word}` : word;
      const b = span(layout(next, rows.length));
      if (cur && b && b[1] - b[0] > max) {
        rows.push(cur);
        cur = word;
      } else cur = next;
    }
    rows.push(cur);
  }
  return rows.flatMap((row, i) => {
    const ls = layout(row, i);
    const b = span(ls);
    if (!b) return [];
    const free = max - (b[1] - b[0]);
    const dx = (align === "center" ? free / 2 : align === "right" ? free : 0) - b[0];
    const dy = -i * cap * ROW * lineK;
    return ls.map((l) => ({ ...l, pts: l.pts.map(([x, y]): Pt => [(x + dx) * k, (y + dy) * k]) }));
  });
}

/** Linhas do item, Y para cima; null = ainda sem conteúdo. */
export async function itemLines(it: PlotItem, alphabet: Alphabet): Promise<Line[] | null> {
  switch (it.kind) {
    case "hand":
      return it.hand?.length ? handLines(it.hand) : null;
    case "design":
      // o SVG vem com Y para baixo
      return it.svg ? svgLines(it.svg.text).map((l) => ({ ...l, pts: l.pts.map(([x, y]): Pt => [x, -y]) })) : null;
    case "shape":
      return shapeLines(it.shape ?? SHAPE_DEFAULT);
    case "model":
      return it.model?.lines.length ? it.model.lines : null;
    case "text": {
      const text = it.text ?? "";
      if (!text.trim()) return null;
      const box = { size: it.size ?? 10, w: it.w, align: it.align ?? "left", lineK: it.lineK ?? 1 };
      const sp = { gap: it.gap ?? 0 };
      if ((it.lettering ?? "single") === "single") return textBlock(text, (l) => hersheyLines(l, sp, it.stroke ?? "scripts"), CAP, box);
      if (it.lettering === "mine") return textBlock(text, (l, row) => myLines(l, alphabet, it.variation ?? 0.5, row + 1, sp), CAP, box);
      const font = await loadFont(it.font ?? "sacramento");
      const rings = textBlock(text, (l) => textContours(font, l).contours.map((pts) => ({ pts, closed: true })), textContours(font, "H").cap, box);
      if (!rings.length) throw new Error("Esta fonte não tem as letras digitadas.");
      // letras cursivas que se encostam viram um contorno só
      const M = await getManifold();
      const cs = new M.CrossSection(rings.map((r) => r.pts), "NonZero");
      try {
        return cs.toPolygons().map((p) => ({ pts: p.map(([x, y]): Pt => [x, y]), closed: true }));
      } finally {
        cs.delete();
      }
    }
  }
}

/** Rascunho de antes das camadas (#303–#317): uma coisa só, no meio da área. */
export function legacyItems(old: Record<string, unknown>, center: [number, number]): PlotItem[] {
  const source = old.source as "design" | "text" | "hand" | undefined;
  if (!source) return [];
  const it = newItem(source, { x: center[0], y: center[1], w: Number(old.width) || 100, rot: 0 }, "legado");
  const fill = (old.fill as Fill | undefined) ?? FILL_DEFAULTS;
  if (source === "design") return old.svg ? [{ ...it, fill, svg: old.svg as PlotItem["svg"] }] : [];
  if (source === "hand") return [{ ...it, fill, hand: (old.hand as Strokes | undefined) ?? [] }];
  return [{ ...it, fill, text: String(old.text ?? ""), lettering: (old.lettering as Lettering | undefined) ?? "single", font: (old.font as FontId | undefined) ?? "sacramento", variation: Number(old.variation ?? 0.5) }];
}
