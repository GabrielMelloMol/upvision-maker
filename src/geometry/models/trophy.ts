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
  baseText2?: string; // 2ª linha na base (troféu elegante)
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
export function buildTrophy(ctx: ModelCtx, p: TrophyParams): ModelOutput {
  const { M, text, art } = ctx;
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
  const base = trophyBase(ctx, { width: W, tabW, thickness: p.thickness, relief: p.relief, lines: [p.baseText, p.baseText2 ?? ""], compact: false, baseColor: p.baseColor, textColor: p.accentColor });
  return { models: [plate, moveModel(base, p.size / 2 + W / 2 + 10, 0)] };
}

export type TrophyBaseParams = {
  width: number;
  tabW: number;
  thickness: number; // espessura da placa que encaixa
  relief: number;
  lines: string[]; // até 2 linhas na frente da base
  compact: boolean; // base baixa 120×55 com cantos arredondados
  baseColor: string;
  textColor: string;
};

const COMPACT_W = 120;
const COMPACT_D = 55;
const COMPACT_R = 7;
const COMPACT_H = 10;

/**
 * Base do troféu com rasgo para a lingueta da placa (folga FIT). Original: 2 degraus; compacta: bloco baixo arredondado.
 * O texto (1 ou 2 linhas) fica em relevo na frente (-Y), a peça imprime deitada sem suporte.
 */
export function trophyBase({ M, text }: ModelCtx, p: TrophyBaseParams): Model {
  return scoped((k) => {
    const W = p.compact ? COMPACT_W : p.width;
    const D = p.compact ? COMPACT_D : BASE_D;
    const H = p.compact ? COMPACT_H : H1 + H2;
    const body = p.compact
      ? k(k(k(M.CrossSection.square([W - 2 * COMPACT_R, D - 2 * COMPACT_R], true)).offset(COMPACT_R, "Round", 2, 48)).extrude(H))
      : k(k(k(M.Manifold.cube([W, D, H1], true)).translate([0, 0, H1 / 2])).add(k(k(M.Manifold.cube([W - 2 * STEP, D - 2 * STEP, H2], true)).translate([0, 0, H1 + H2 / 2]))));
    const slot = k(k(M.Manifold.cube([p.tabW + FIT, p.thickness + FIT, TAB_H + FIT], true)).translate([0, 0, H - (TAB_H + FIT) / 2 + 0.01]));
    const solid = k(body.subtract(slot));
    const faceH = p.compact ? H : H1;
    const lines = p.lines.map((l) => l.trim()).filter(Boolean).slice(0, 2);
    const lineH = (faceH * (lines.length > 1 ? 0.8 : 0.55)) / lines.length;
    const parts = [{ name: "Base", color: p.baseColor, mesh: solidMesh(solid) }];
    const cs = lines
      .map((l, i) => {
        const raw = text(l, lineH);
        const cy = lines.length > 1 ? faceH / 2 + (i === 0 ? 1 : -1) * (lineH / 2 + 0.4) : faceH / 2;
        return raw ? k(fitInto(k(raw), W - 2 * STEP - 4, lineH, cy)) : null;
      })
      .filter((c): c is CS => c !== null);
    if (cs.length) {
      const relief = k(k(k(k(M.CrossSection.union(cs)).extrude(p.relief)).rotate([90, 0, 0])).translate([0, -D / 2, 0]));
      parts.push({ name: "Texto da base", color: p.textColor, mesh: solidMesh(relief) });
    }
    return { name: "Base", parts };
  });
}
