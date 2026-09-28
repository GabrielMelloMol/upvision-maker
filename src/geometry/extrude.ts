import type { CS, ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { outerOnly, scoped } from "./shape2d";
import type { Model, Part } from "./types";

export type ColorLayer2D = { color: string; cs: CS };
export type ExtrudeParams = { height: number; base: { margin: number; thickness: number } | null };
export const BASE_COLOR = "#2563eb";
export const TOP_COLOR = "#f97316";

/** Uma parte por cor, com altura `h` a partir de `z`. */
export function layerParts(layers: ColorLayer2D[], h: number, z: number, name: string): Part[] {
  return scoped((k) =>
    layers.filter((l) => !l.cs.isEmpty()).map((l, i) => ({ name: `${name} ${i + 1}`, color: l.color, mesh: toMesh(k(k(l.cs.extrude(h)).translate([0, 0, z]))) })),
  );
}

/**
 * Desenho extrudado; com base, a placa (silhueta sem furos + margem) fica embaixo em outra cor.
 * `layers` (SVG colorido): o desenho sai com uma parte por cor.
 */
export function extrudeDesign(M: ManifoldToplevel, design: CS, p: ExtrudeParams, name = "Extrusão", layers: ColorLayer2D[] | null = null): Model {
  return scoped((k) => {
    const z = p.base ? p.base.thickness : 0;
    const top = layers
      ? layerParts(layers, p.height, z, "Cor")
      : [{ name: "Desenho", color: p.base ? TOP_COLOR : BASE_COLOR, mesh: toMesh(k(k(design.extrude(p.height)).translate([0, 0, z]))) }];
    if (!p.base) return { name, parts: top };
    const plate = k(k(outerOnly(M, design)).offset(p.base.margin, "Round"));
    return { name, parts: [{ name: "Base", color: BASE_COLOR, mesh: toMesh(k(plate.extrude(p.base.thickness))) }, ...top] };
  });
}
