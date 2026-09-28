import type { CS } from "../manifold";
import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { roundedRect, slab, solidMesh, moveMesh, type ModelCtx, type ModelOutput } from "./common";

export type StampParams = {
  shape: "circle" | "square";
  size: number;
  thickness: number;
  relief: number;
  text: string; // usado quando não há desenho
  handle: boolean;
  handleHeight: number;
  plateColor: string;
  artColor: string;
};

export const DEFAULT_STAMP: StampParams = {
  shape: "circle",
  size: 40,
  thickness: 4,
  relief: 2,
  text: "A",
  handle: true,
  handleHeight: 25,
  plateColor: "#2563eb",
  artColor: "#ffffff",
};

export const PEG_D = 8;
const PEG_H = 3;
export const PEG_CLEARANCE = 0.4;
const MARGIN = 3;

/**
 * Carimbo de brigadeiro/biscoito: placa com a arte ESPELHADA em relevo (a marca sai no sentido certo)
 * e cabo separado que encaixa num furo atrás da placa. Os dois imprimem sem suporte.
 */
export function buildStamp({ M, text, art }: ModelCtx, p: StampParams): ModelOutput {
  return scoped((k) => {
    const outline = k(p.shape === "circle" ? M.CrossSection.circle(p.size / 2, 96) : roundedRect(M, p.size, p.size, 3));
    const inner = k(outline.offset(-MARGIN, "Round"));
    const src: CS | null = art ? art : (() => { const t = text(p.text, 100); return t && k(t); })();
    if (!src) throw new Error("Envie um desenho ou digite um texto.");
    const inside = p.size - 2 * MARGIN;
    const mirrored = k(src.scale([-1, 1]));
    const placed = k(shrinkToFit(k(fitInto(mirrored, inside * 0.85, inside * 0.85, 0)), inner));
    const plate = p.handle
      ? k(k(outline.extrude(p.thickness)).subtract(k(M.Manifold.cylinder(PEG_H + PEG_CLEARANCE, (PEG_D + PEG_CLEARANCE) / 2, (PEG_D + PEG_CLEARANCE) / 2, 48))))
      : k(outline.extrude(p.thickness));
    const models = [
      {
        name: "Carimbo",
        parts: [
          { name: "Placa", color: p.plateColor, mesh: solidMesh(plate) },
          { name: "Arte", color: p.artColor, mesh: slab(placed, p.relief, p.thickness) },
        ],
      },
    ];
    if (p.handle) {
      const r = Math.min(p.size * 0.22, 10);
      const body = k(M.Manifold.cylinder(p.handleHeight, r * 1.3, r, 64));
      const knob = k(k(M.Manifold.sphere(r * 1.15, 48)).translate([0, 0, p.handleHeight]));
      const peg = k(k(M.Manifold.cylinder(PEG_H, PEG_D / 2, PEG_D / 2, 48)).translate([0, 0, -PEG_H]));
      // topo do pomo achatado: o cabo imprime de cabeça para baixo, apoiado nele, com o pino para cima
      const top = p.handleHeight + r * 0.6;
      const handle = k(k(k(k(body.add(knob)).trimByPlane([0, 0, -1], -top)).add(peg)).rotate([180, 0, 0]));
      const lift = -handle.boundingBox().min[2];
      models.push({ name: "Cabo", parts: [{ name: "Cabo", color: p.plateColor, mesh: moveMesh(solidMesh(handle), p.size / 2 + r * 1.3 + 8, 0, lift) }] });
    }
    return { models };
  });
}
