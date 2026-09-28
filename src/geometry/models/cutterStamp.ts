import { stampRelief } from "../cutter";
import { fitInto, outerOnly, scoped } from "../shape2d";
import { requireArt, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type CutterStampParams = {
  size: number;
  height: number; // altura da lâmina (a partir da placa)
  stampDepth: number; // quanto a lâmina passa do relevo (profundidade da marca)
  blade: number;
  plate: number;
  edgeMargin: number;
  color: string;
};

export const DEFAULT_CUTTER_STAMP: CutterStampParams = { size: 50, height: 12, stampDepth: 3, blade: 0.8, plate: 2, edgeMargin: 1.5, color: "#2563eb" };

/**
 * Cortador e carimbo numa peça só: placa no formato do desenho, lâmina em volta e o relevo por dentro,
 * mais baixo que a lâmina — corta e marca na mesma apertada. Imprime com a placa na mesa (arte espelhada).
 */
export function buildCutterStamp({ M, art }: ModelCtx, p: CutterStampParams): ModelOutput {
  const src = requireArt(art);
  if (p.stampDepth >= p.height) throw new Error("A marca precisa ser menor que a altura da lâmina.");
  return scoped((k) => {
    const design = k(k(fitInto(src, p.size, p.size, 0)).scale([-1, 1]));
    const filled = k(outerOnly(M, design));
    const blade = k(k(filled.offset(p.blade, "Round")).subtract(filled));
    const inner = k(filled.offset(-p.edgeMargin, "Round"));
    const relief = stampRelief(M, design, inner, "auto", k);
    let solid = k(M.Manifold.union(k(k(filled.offset(p.blade, "Round")).extrude(p.plate)), k(blade.extrude(p.plate + p.height))));
    const warnings: string[] = [];
    if (relief.isEmpty()) warnings.push("Sem desenho interno para marcar: sai só o cortador.");
    else solid = k(solid.add(k(relief.extrude(p.plate + p.height - p.stampDepth))));
    return { models: [{ name: "Cortador e carimbo", parts: [{ name: "Cortador", color: p.color, mesh: solidMesh(solid) }] }], warnings };
  });
}
