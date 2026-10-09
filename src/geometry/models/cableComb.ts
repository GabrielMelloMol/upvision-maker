import { bedMm } from "../bed";
import type { CS } from "../manifold";
import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type CableCombParams = {
  cables: number;
  cableD: number;
  topThickness: number;
  length: number;
  wall: number;
  clearance: number;
  color: string;
};
export const DEFAULT_CABLE_COMB: CableCombParams = { cables: 3, cableD: 5, topThickness: 2, length: 12, wall: 2, clearance: 0.3, color: "#1c1c1e" };

const NECK = 0.85; // a boca é mais estreita que o cabo: o cabo entra por pressão e fica preso
const LIP = 0.8; // acima do topo do cabo
const SEG = 48;

/**
 * Clipe e pente de cabos (#121): barra com `cables` vãos redondos abertos para cima. O corpo é a seção extrudada por
 * `length`; imprime deitado, com o fundo (tampo) na mesa. Cola ou parafusa pelo fundo.
 */
export function buildCableComb(ctx: ModelCtx, p: CableCombParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const slot = p.cableD + p.clearance;
    const width = p.cables * slot + (p.cables + 1) * p.wall;
    const top = p.topThickness + slot + LIP;
    const body = k(M.CrossSection.square([width, top]));
    const cuts: CS[] = [];
    for (let i = 0; i < p.cables; i++) {
      const cx = p.wall + slot / 2 + i * (slot + p.wall);
      const cy = p.topThickness + slot / 2;
      cuts.push(k(k(M.CrossSection.circle(slot / 2, SEG)).translate([cx, cy])));
      cuts.push(k(k(M.CrossSection.square([p.cableD * NECK, top - cy + 1])).translate([cx - (p.cableD * NECK) / 2, cy])));
    }
    const section = k(body.subtract(k(M.CrossSection.union(cuts))));
    // seção em XY → extrusão em Z → em pé sobre a mesa (y vira altura, o comprimento vai para +Y)
    const solid = k(k(k(section.extrude(p.length)).rotate([90, 0, 0])).translate([-width / 2, p.length, 0]));
    const warnings = Math.max(width, p.length) > bedMm() ? [`O pente tem ${Math.round(width)} mm de largura: passa da mesa de ${bedMm()} mm. Use menos cabos.`] : [];
    return { models: [{ name: "Pente de cabos", parts: [{ name: "Pente", color: p.color, mesh: solidMesh(solid) }] }], warnings };
  });
}
