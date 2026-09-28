import type { ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type SpinnerParams = {
  diameter: number;
  thickness: number;
  gap: number;
  relief: number;
  text: string;
  frameColor: string;
  diskColor: string;
  textColor: string;
};

export const DEFAULT_SPINNER: SpinnerParams = {
  diameter: 40,
  thickness: 5,
  gap: 0.5,
  relief: 0.6,
  text: "Ana",
  frameColor: "#1c1c1e",
  diskColor: "#2563eb",
  textColor: "#ffffff",
};

const FRAME_WALL = 3.5;
const TAB_R = 4.5;
const TAB_HOLE_R = 2.2;
const EMBED = 0.8; // quanto o pino entra na moldura

/** Cone deitado no eixo X, base em `x0`, apontando para `dir` (+1 ou -1), no meio da espessura. */
function cone(M: ManifoldToplevel, r: number, h: number, x0: number, dir: 1 | -1, z: number): Solid {
  return scoped((k) => k(k(M.Manifold.cylinder(h, r, 0, 48)).rotate([0, 90 * dir, 0])).translate([x0, 0, z]));
}

/**
 * Chaveiro giratório impresso já montado: disco dentro da moldura, girando em 2 pinos cônicos (45°, sem suporte).
 * Folga `gap` entre disco e moldura e entre pino e encaixe; o disco tem o texto em relevo.
 */
export function buildSpinner({ M, text }: ModelCtx, p: SpinnerParams): ModelOutput {
  return scoped((k) => {
    const T = p.thickness, g = p.gap;
    const Ro = p.diameter / 2, Ri = Ro - FRAME_WALL, rd = Ri - g;
    const pr = T / 2 - 0.5; // raio da base do pino
    const ring2d = k(k(M.CrossSection.circle(Ro, 96)).subtract(k(M.CrossSection.circle(Ri, 96))));
    const tab = k(k(M.CrossSection.circle(TAB_R, 48)).translate([0, Ro + TAB_R - 1.5]));
    const tabHole = k(k(M.CrossSection.circle(TAB_HOLE_R, 32)).translate([0, Ro + TAB_R - 1.5]));
    const frame2d = k(k(ring2d.add(tab)).subtract(tabHole));
    const pins = [k(cone(M, pr, pr + EMBED, -Ri - EMBED, 1, T / 2)), k(cone(M, pr, pr + EMBED, Ri + EMBED, -1, T / 2))];
    const frame = k(k(frame2d.extrude(T)).add(k(pins[0].add(pins[1]))));
    const sockets = [k(cone(M, pr + g, pr + EMBED + g, -Ri - EMBED, 1, T / 2)), k(cone(M, pr + g, pr + EMBED + g, Ri + EMBED, -1, T / 2))];
    const disk = k(k(k(M.CrossSection.circle(rd, 96)).extrude(T)).subtract(k(sockets[0].add(sockets[1]))));
    const parts = [
      { name: "Moldura", color: p.frameColor, mesh: solidMesh(frame) },
      { name: "Disco", color: p.diskColor, mesh: solidMesh(disk) },
    ];
    const raw = text(p.text, 100);
    if (raw) {
      const inner = rd - 1.5 - pr; // longe dos encaixes
      parts.push({ name: "Texto", color: p.textColor, mesh: slab(k(fitInto(k(raw), inner * 2 * 0.9, rd * 0.8, 0)), p.relief, T) });
    }
    return { models: [{ name: "Chaveiro giratório", parts }] };
  });
}
