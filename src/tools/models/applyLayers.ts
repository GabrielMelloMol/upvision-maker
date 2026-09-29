import { applyDecals, decalFace, decalShape, type DecalRegions } from "../../geometry/decals";
import { loadEmojiFont, loadFont } from "../../geometry/fonts";
import type { CS, ManifoldToplevel } from "../../geometry/manifold";
import { hasEmoji, textToCrossSection } from "../../geometry/text";
import type { Model } from "../../geometry/types";
import { designFromSvg } from "../designInput";
import { layerName, type Bounds, type Layer } from "./layers";

const ART_NORM_MM = 100; // escala de trabalho; o decal reescala para a largura pedida
const TEXT_NORM_MM = 10;

/** Contorno local de cada camada (centrado, na largura dela) para o gizmo desenhar a forma real. */
export type LayerShape = { polys: [number, number][][]; width: number; height: number };
/** `others`: silhueta vista de cima das outras peças do modelo (textos, arte), só para referência no gizmo. */
export type FaceInfo = { outline: [number, number][][]; bounds: Bounds; part: string; others: [number, number][][] };
export type LayersResult = { models: Model[]; warnings: string[]; byLayer: Record<string, string[]>; face: FaceInfo | null; shapes: Record<string, LayerShape> };

function otherParts(M: ManifoldToplevel, model: Model, main: string): [number, number][][] {
  return model.parts
    .filter((p) => p.name !== main)
    .flatMap((p) => {
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices }));
      const cs = s.project();
      const polys = cs.toPolygons() as [number, number][][];
      cs.delete();
      s.delete();
      return polys;
    });
}

async function regionsOf(M: ManifoldToplevel, l: Layer): Promise<DecalRegions> {
  if (l.kind === "art" && l.svg) {
    const d = await designFromSvg(l.svg, ART_NORM_MM, false, true);
    if (!d.layers?.length) return [{ color: null, cs: d.cs }];
    d.cs.delete();
    return d.layers.map((x) => ({ color: x.color, cs: x.cs }));
  }
  const text = l.text?.trim();
  if (l.kind === "text" && text) {
    const font = await loadFont(l.font ?? "hanken");
    return [{ color: null, cs: textToCrossSection(M, font, text, TEXT_NORM_MM, hasEmoji(text) ? await loadEmojiFont() : undefined) }];
  }
  return [];
}

/**
 * Aplica as camadas livres na peça principal (motor em geometry/decals.ts) e devolve também a face de cima e o
 * contorno de cada camada para o gizmo. Os avisos saem com o nome da camada.
 */
export async function applyLayers(M: ManifoldToplevel, models: Model[], layers: Layer[]): Promise<LayersResult> {
  if (!models.length) return { models, warnings: [], byLayer: {}, face: null, shapes: {} };
  const f = decalFace(M, models);
  const face: FaceInfo = { outline: f.outline, bounds: f.bounds as Bounds, part: f.part, others: otherParts(M, models[0], f.part) };
  if (!layers.length) return { models, warnings: [], byLayer: {}, face, shapes: {} };
  const built: { layer: Layer; regions: DecalRegions }[] = [];
  const owned: CS[] = [];
  try {
    for (const layer of layers) {
      const regions = await regionsOf(M, layer);
      regions.forEach((r) => owned.push(r.cs));
      built.push({ layer, regions });
    }
    const shapes: Record<string, LayerShape> = {};
    for (const { layer, regions } of built) {
      if (!regions.length) continue;
      const all = M.CrossSection.union(regions.map((r) => r.cs));
      const local = decalShape(all, layer.width);
      const b = local.bounds();
      shapes[layer.id] = { polys: local.toPolygons() as [number, number][][], width: layer.width, height: b.max[1] - b.min[1] };
      local.delete();
      all.delete();
    }
    const out = applyDecals(M, models, built.map(({ layer, regions }) => ({ decal: layer, regions })));
    const byLayer: Record<string, string[]> = {};
    const warnings = out.warnings.map((w) => {
      const l = w.decalId ? layers.find((x) => x.id === w.decalId) : undefined;
      if (l) (byLayer[l.id] ??= []).push(w.text);
      return l ? `${layerName(l)}: ${w.text}` : w.text;
    });
    return { models: out.models, warnings, byLayer, face, shapes };
  } finally {
    owned.forEach((c) => c.delete());
  }
}
