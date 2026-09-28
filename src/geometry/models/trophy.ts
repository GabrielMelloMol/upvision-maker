import type { CS } from "../manifold";
import { buildMedal, medalOutline, type MedalShape } from "../medal";
import { fitInto, scoped } from "../shape2d";
import type { Model } from "../types";
import { moveModel, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type TrophyParams = {
  shape: MedalShape;
  size: number;
  thickness: number;
  relief: number;
  text: string;
  baseText: string;
  plateColor: string;
  accentColor: string;
  artColor: string;
  baseColor: string;
};

export const DEFAULT_TROPHY: TrophyParams = {
  shape: "star",
  size: 80,
  thickness: 4,
  relief: 1,
  text: "1º LUGAR",
  baseText: "",
  plateColor: "#f5c542",
  accentColor: "#ffffff",
  artColor: "#1c1c1e",
  baseColor: "#1c1c1e",
};

const TAB_H = 8;
const FIT = 0.4; // folga do rasgo
const OVERLAP = 1.5;
const BASE_D = 34;
const STEP = 4;
const H1 = 8, H2 = 7;

/**
 * Troféu de 2 peças: placa (formato + texto + imagem, com lingueta embaixo) e base em degrau com rasgo.
 * As duas imprimem deitadas, sem suporte; a placa encaixa em pé no rasgo.
 */
export function buildTrophy({ M, text, art }: ModelCtx, p: TrophyParams): ModelOutput {
  const tabW = p.size * 0.35;
  const plate = scoped((k) => {
    const txt = text(p.text, p.size * 0.12);
    if (txt) k(txt);
    const medal = buildMedal(M, { shape: p.shape, diameter: p.size, thickness: p.thickness, rim: 2.5, relief: p.relief, ribbon: 0, baseColor: p.plateColor, accentColor: p.accentColor, artColor: p.artColor }, art, txt);
    const outline = k(medalOutline(M, p.shape, p.size));
    const minY = outline.bounds().min[1];
    // onde o contorno de fato cobre o meio (na estrela, o "vale" entre as 2 pontas de baixo)
    const band = k(outline.intersect(k(M.CrossSection.square([tabW, p.size * 2], true))));
    const bandMinY = band.bounds().min[1];
    const tab = k(k(M.CrossSection.square([tabW, bandMinY + OVERLAP - (minY - TAB_H)], false)).translate([-tabW / 2, minY - TAB_H]));
    return { name: "Placa", parts: [...medal.parts, { name: "Encaixe", color: p.plateColor, mesh: slab(tab, p.thickness) }] } satisfies Model;
  });
  const W = Math.max(p.size * 0.9, tabW + 20);
  const base = scoped((k) => {
    const lower = k(k(M.Manifold.cube([W, BASE_D, H1], true)).translate([0, 0, H1 / 2]));
    const upper = k(k(M.Manifold.cube([W - 2 * STEP, BASE_D - 2 * STEP, H2], true)).translate([0, 0, H1 + H2 / 2]));
    const slot = k(k(M.Manifold.cube([tabW + FIT, p.thickness + FIT, TAB_H + FIT], true)).translate([0, 0, H1 + H2 - (TAB_H + FIT) / 2 + 0.01]));
    const solid = k(k(lower.add(upper)).subtract(slot));
    const parts = [];
    const raw = text(p.baseText, H1 * 0.55);
    if (raw) {
      // texto em relevo na frente do degrau de baixo (-Y)
      const cs: CS = k(fitInto(k(raw), W - 2 * STEP - 4, H1 * 0.55, H1 / 2));
      const relief = k(k(k(cs.extrude(p.relief)).rotate([90, 0, 0])).translate([0, -BASE_D / 2, 0]));
      parts.push({ name: "Texto da base", color: p.accentColor, mesh: solidMesh(relief) });
    }
    return { name: "Base", parts: [{ name: "Base", color: p.baseColor, mesh: solidMesh(solid) }, ...parts] } satisfies Model;
  });
  return { models: [plate, moveModel(base, p.size / 2 + W / 2 + 10, 0)] };
}
