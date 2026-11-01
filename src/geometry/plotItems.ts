/**
 * Camadas da caneta (#320): cada item (texto, desenho, forma, peça 3D ou mão livre) tem o próprio conteúdo,
 * preenchimento e lugar na mesa. As linhas saem Y para cima; `placeLines` põe no lugar.
 */
import { loadFont, type FontId } from "./fonts";
import { handLines, myLines, type Alphabet, type Strokes } from "./handwriting";
import { hersheyLines } from "./hershey";
import { getManifold } from "./manifold";
import { FILL_DEFAULTS, type Fill, type Place, type Pt } from "./plotter";
import { shapeLines, SHAPE_DEFAULT, SHAPES, type Shape } from "./plotShapes";
import { svgLines } from "./svgImport";
import { textToCrossSection } from "./text";

export type Line = { pts: Pt[]; closed: boolean };
export type ItemKind = "text" | "design" | "shape" | "model" | "hand";
export type Lettering = "single" | "mine" | "font";

/** Um item da mesa. Os campos de conteúdo valem conforme o `kind` (os outros ficam de fora). */
export type PlotItem = Place & {
  id: string;
  kind: ItemKind;
  hidden?: boolean;
  fill: Fill;
  svg?: { text: string; name: string } | null;
  text?: string;
  lettering?: Lettering;
  font?: FontId;
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
  if (kind === "text") return { ...base, text: "Obrigada!", lettering: "single", font: "sacramento", gap: 0, lineK: 1, variation: 0.5 };
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

/** Chave do conteúdo (sem lugar nem preenchimento): mover a camada não recalcula as linhas. */
export const contentKey = (it: PlotItem, alphabet: Alphabet) =>
  JSON.stringify([it.kind, it.svg?.text.length, it.svg?.name, it.text, it.lettering, it.font, it.gap, it.lineK, it.variation, it.hand, it.shape, it.model?.name, it.model?.lines.length, it.lettering === "mine" ? alphabet : null]);

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
      const sp = { gap: it.gap ?? 0, line: it.lineK ?? 1 };
      if ((it.lettering ?? "single") === "single") return hersheyLines(text, sp);
      if (it.lettering === "mine") return myLines(text, alphabet, it.variation ?? 0.5, 1, sp);
      const M = await getManifold();
      const cs = textToCrossSection(M, await loadFont(it.font ?? "sacramento"), text, 10);
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
