import { bedMm } from "../bed";
import type { CS } from "../manifold";
import { fitInto, outerOnly, scoped } from "../shape2d";
import { roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type SlingshotParams = {
  handleLen: number;
  handleW: number;
  forkLen: number;
  /** Distância entre as pontas da forquilha (de centro a centro). */
  spread: number;
  armW: number;
  thickness: number;
  name: string;
  nameMode: "engraved" | "raised" | "none";
  depth: number;
  color: string;
  nameColor: string;
};

export const DEFAULT_SLINGSHOT: SlingshotParams = { handleLen: 95, handleW: 30, forkLen: 60, spread: 70, armW: 17, thickness: 14, name: "Léo", nameMode: "raised", depth: 1, color: "#1f2937", nameColor: "#f59e0b" };

const SEG = 64;
const TIE_R = 3.2; // furo para amarrar o elástico nas pontas
const LANYARD_R = 4;
const MIN_ARM = 14;
const MIN_SPREAD = 25;
const SMOOTH = 5; // raio de concordância entre o cabo e a forquilha

/**
 * Estilingue personalizado (#238): peça plana em Y, com a empunhadura arredondada, furos de amarração nas pontas e o nome
 * gravado ou em relevo na empunhadura. Brinquedo e hobby: o app avisa dos cuidados e do material.
 */
export function buildSlingshot(ctx: ModelCtx, p: SlingshotParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const R = p.armW / 2;
    const yFork = p.handleLen; // onde o cabo vira forquilha
    const tipY = yFork + p.forkLen;
    const handle = k(k(roundedRect(M, p.handleW, p.handleLen + 2 * R, Math.min(R, p.handleW / 2 - 1))).translate([0, (p.handleLen + 2 * R) / 2 - R]));
    const arm = (sx: number) => {
      const base = k(k(M.CrossSection.circle(R, SEG)).translate([sx * Math.max(0, p.handleW / 2 - R), yFork]));
      const tip = k(k(M.CrossSection.circle(R, SEG)).translate([sx * p.spread / 2, tipY]));
      return k(M.CrossSection.hull([base, tip]));
    };
    const raw = k(M.CrossSection.union([handle, arm(-1), arm(1)]));
    // concordância suave entre o cabo e os braços (fecha as quinas de dentro)
    const body = k(k(raw.offset(SMOOTH, "Round")).offset(-SMOOTH, "Round"));
    const lanyard = k(k(M.CrossSection.circle(LANYARD_R, 32)).translate([0, LANYARD_R + 6]));
    const ties = [-1, 1].map((sx) => k(k(M.CrossSection.circle(TIE_R, 32)).translate([sx * p.spread / 2, tipY])));
    const profile: CS = k(outerOnly(M, body).subtract(k(M.CrossSection.union([lanyard, ...ties]))));
    let solid = k(profile.extrude(p.thickness));
    const parts = [] as { name: string; color: string; mesh: ReturnType<typeof solidMesh> }[];

    if (p.nameMode !== "none" && p.name.trim()) {
      const raw2 = ctx.text(p.name, 12);
      if (raw2) {
        const rotated = k(k(raw2).rotate(90)); // o nome lê de baixo para cima, ao longo da empunhadura
        const t = k(fitInto(rotated, p.handleW * 0.62, p.handleLen * 0.55, 0));
        const placed = k(t.translate([0, p.handleLen * 0.55]));
        if (p.nameMode === "engraved") solid = k(solid.subtract(k(k(placed.extrude(p.depth + 0.01)).translate([0, 0, p.thickness - p.depth]))));
        else parts.push({ name: "Nome", color: p.nameColor, mesh: slab(placed, p.depth, p.thickness) });
      }
    }
    parts.unshift({ name: "Estilingue", color: p.color, mesh: solidMesh(solid) });

    if (p.armW < MIN_ARM) warnings.push(`Braço fino (${p.armW} mm): a forquilha pode quebrar na primeira esticada. Use ${MIN_ARM} mm ou mais.`);
    if (p.spread < MIN_SPREAD) warnings.push("As pontas estão muito juntas para o elástico.");
    if (Math.max(tipY + R, p.spread + p.armW) > bedMm()) warnings.push(`O estilingue tem ${Math.round(tipY + R)} mm de altura: passa da mesa de ${bedMm()} mm.`);
    warnings.push("Brinquedo e hobby, sem garantia de resistência: imprima deitado, como no arquivo (as camadas ficam no plano da forquilha, que é como ela é puxada), em PETG ou ABS, com 5 paredes e 100% de preenchimento. Use óculos, não aponte para pessoas ou animais e não deixe com criança sem um adulto.");
    return { models: [{ name: "Estilingue", parts }], warnings };
  });
}
