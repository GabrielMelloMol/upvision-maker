import { useState } from "react";
import type { ElementBox } from "../../geometry/models/common";
import type { FaceInfo, LayerShape } from "./applyLayers";
import { duplicateLayer, moveLayer, newArtLayer, newTextLayer, removeLayer, updateLayer, type Layer } from "./layers";

// referências fixas: "sem camadas"/"sem deslocamento" não podem virar objetos novos a cada render (são dependências da geração)
const NONE: Layer[] = [];
const NO_OFFSETS: Offsets = {};

/** Deslocamento (mm) de cada elemento interno do modelo arrastado no gizmo (#79). */
export type Offsets = Record<string, [number, number]>;
export type ModelEdit = { layers: Layer[]; offsets: Offsets };
export type ModelEdits = Record<string, ModelEdit>;

type View = { face: FaceInfo | null; shapes: Record<string, LayerShape>; byLayer: Record<string, string[]>; elements: ElementBox[] };

/**
 * Camadas livres de cada modelo (#26) e deslocamentos dos elementos internos (#79), e a camada escolhida.
 * O estado (`edits`) mora no useToolState dos Modelos (#85): o mesmo desfazer vale para campos, camadas e posições.
 */
export function useModelLayers(modelId: string, edits: ModelEdits, setEdits: (fn: (cur: ModelEdits) => ModelEdits) => void) {
  const layers = edits[modelId]?.layers ?? NONE;
  const offsets = edits[modelId]?.offsets ?? NO_OFFSETS;
  const [sel, setSel] = useState<{ model: string; id: string | null }>({ model: modelId, id: null });
  const selected = sel.model === modelId && layers.some((l) => l.id === sel.id) ? sel.id : null;
  const [view, setView] = useState<View>({ face: null, shapes: {}, byLayer: {}, elements: [] });
  const select = (id: string | null) => setSel({ model: modelId, id });
  const edit = (fn: (l: Layer[]) => Layer[]) => setEdits((cur) => ({ ...cur, [modelId]: { offsets: cur[modelId]?.offsets ?? {}, layers: fn(cur[modelId]?.layers ?? []) } }));
  const editOffsets = (fn: (o: Offsets) => Offsets) => setEdits((cur) => ({ ...cur, [modelId]: { layers: cur[modelId]?.layers ?? [], offsets: fn(cur[modelId]?.offsets ?? {}) } }));

  const faceBounds = view.face?.bounds ?? null;
  return {
    layers,
    offsets,
    /** Soma (dx, dy) ao deslocamento do elemento interno `id` (um passo no desfazer). */
    moveElement: (id: string, dx: number, dy: number) =>
      editOffsets((o) => {
        const [x, y] = o[id] ?? [0, 0];
        return { ...o, [id]: [Math.round((x + dx) * 10) / 10, Math.round((y + dy) * 10) / 10] };
      }),
    selected,
    select,
    view,
    setView,
    addArt(svg: string, name: string) {
      const l = newArtLayer(svg, name, faceBounds);
      edit((list) => [...list, l]);
      select(l.id);
    },
    addText(font?: string) {
      const l = newTextLayer(faceBounds, font);
      edit((list) => [...list, l]);
      select(l.id);
    },
    change: (id: string, patch: Partial<Layer>) => edit((list) => updateLayer(list, id, patch)),
    move: (id: string, dir: 1 | -1) => edit((list) => moveLayer(list, id, dir)),
    duplicate(id: string) {
      const r = duplicateLayer(layers, id);
      edit(() => r.list);
      if (r.id) select(r.id);
    },
    remove: (id: string) => edit((list) => removeLayer(list, id)),
    /** Variação salva: troca todas as camadas deste modelo (um passo no desfazer). */
    replace: (list: Layer[]) => edit(() => list),
  };
}
