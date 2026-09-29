import { useEffect, useState } from "react";
import { useHistory } from "../../ui/useHistory";
import type { FaceInfo, LayerShape } from "./applyLayers";
import { duplicateLayer, moveLayer, newArtLayer, newTextLayer, removeLayer, updateLayer, type Layer } from "./layers";

// referência fixa: "sem camadas" não pode virar uma lista nova a cada render (é dependência da geração)
const NONE: Layer[] = [];

type View = { face: FaceInfo | null; shapes: Record<string, LayerShape>; byLayer: Record<string, string[]> };

/** Camadas livres de cada modelo (#26), com desfazer/refazer (⌘Z / ⇧⌘Z fora de campos de texto) e a camada escolhida. */
export function useModelLayers(modelId: string) {
  const hist = useHistory<Record<string, Layer[]>>({});
  const layers = hist.value[modelId] ?? NONE;
  const [sel, setSel] = useState<{ model: string; id: string | null }>({ model: modelId, id: null });
  const selected = sel.model === modelId && layers.some((l) => l.id === sel.id) ? sel.id : null;
  const [view, setView] = useState<View>({ face: null, shapes: {}, byLayer: {} });
  const select = (id: string | null) => setSel({ model: modelId, id });
  const edit = (fn: (l: Layer[]) => Layer[]) => hist.set((cur) => ({ ...cur, [modelId]: fn(cur[modelId] ?? []) }));
  const { undo, redo } = hist;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return; // desfazer do próprio campo
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const faceBounds = view.face?.bounds ?? null;
  return {
    layers,
    selected,
    select,
    view,
    setView,
    history: { undo, redo, canUndo: hist.canUndo, canRedo: hist.canRedo },
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
