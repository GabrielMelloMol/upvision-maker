import type { CS, ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { outerOnly, scoped } from "./shape2d";
import type { Model } from "./types";

export type ExtrudeParams = { height: number; base: { margin: number; thickness: number } | null };
export const BASE_COLOR = "#2563eb";
export const TOP_COLOR = "#f97316";

/** Desenho extrudado; com base, a placa (silhueta sem furos + margem) fica embaixo em outra cor. */
export function extrudeDesign(M: ManifoldToplevel, design: CS, p: ExtrudeParams, name = "Extrusão"): Model {
  return scoped((k) => {
    if (!p.base) return { name, parts: [{ name: "Desenho", color: BASE_COLOR, mesh: toMesh(k(design.extrude(p.height))) }] };
    const plate = k(k(outerOnly(M, design)).offset(p.base.margin, "Round"));
    const top = k(k(design.extrude(p.height)).translate([0, 0, p.base.thickness]));
    return {
      name,
      parts: [
        { name: "Base", color: BASE_COLOR, mesh: toMesh(k(plate.extrude(p.base.thickness))) },
        { name: "Desenho", color: TOP_COLOR, mesh: toMesh(top) },
      ],
    };
  });
}
