import type { CS } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type PenHolderParams = {
  shape: "round" | "hex" | "square";
  diameter: number;
  height: number;
  wall: number;
  floor: number;
  relief: number;
  text: string;
  bodyColor: string;
  textColor: string;
};

export const DEFAULT_PEN_HOLDER: PenHolderParams = {
  shape: "hex",
  diameter: 75,
  height: 100,
  wall: 2.4,
  floor: 2,
  relief: 1,
  text: "Ana",
  bodyColor: "#2563eb",
  textColor: "#ffffff",
};

/** Largura útil para o texto na face da frente (-Y) de cada formato. */
const FACE_WIDTH = { round: 0.6, hex: 0.4, square: 0.8 } as const;

/**
 * Porta-caneta: copo redondo, sextavado ou quadrado; texto em relevo na frente (-Y), como parte separada.
 * O texto é projetado na parede: casca de `relief` mm em volta do copo ∩ texto extrudado na direção Y.
 */
export function buildPenHolder({ M, text }: ModelCtx, p: PenHolderParams): ModelOutput {
  return scoped((k) => {
    const d = p.diameter, H = p.height;
    const outline: CS =
      p.shape === "square" ? k(roundedRect(M, d, d, 4)) : p.shape === "hex" ? k(M.CrossSection.circle(d / 2, 6)) : k(M.CrossSection.circle(d / 2, 128));
    const cavity = k(k(k(outline.offset(-p.wall, "Round")).extrude(H)).translate([0, 0, p.floor]));
    const body = k(k(outline.extrude(H)).subtract(cavity));
    const parts = [{ name: "Copo", color: p.bodyColor, mesh: solidMesh(body) }];
    const raw = text(p.text, 100);
    if (raw) {
      const t = k(fitInto(k(raw), d * FACE_WIDTH[p.shape], H * 0.3, H / 2));
      // extrude em Z e gira para o plano XZ: após rotate X +90°, Z vira -Y (frente)
      const prism = k(k(t.extrude(d)).rotate([90, 0, 0]));
      const shell = k(k(k(outline.offset(p.relief, "Round")).subtract(outline)).extrude(H));
      const relief = k(prism.intersect(shell));
      if (!relief.isEmpty()) parts.push({ name: "Texto", color: p.textColor, mesh: solidMesh(relief) });
    }
    return { models: [{ name: "Porta-caneta", parts }] };
  });
}
