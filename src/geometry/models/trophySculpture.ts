import type { CS, ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import { sportSilhouette, type SportId } from "../sports";
import type { Model } from "../types";
import { moveModel, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { trophyBase } from "./trophy";

export type SculptureLayout = "print" | "assembled";
export type SculptureForm = "atleta" | "fluxo" | "iris" | "nexo";
export const SCULPTURE_FORMS: SculptureForm[] = ["atleta", "fluxo", "iris", "nexo"];

export type SculptureParams = {
  form: SculptureForm;
  layout: SculptureLayout; // peças na mesa (o que imprime) ou o troféu montado em pé na base (só para ver)
  sport: SportId;
  height: number; // altura do atleta (maior dimensão) ou da coluna torcida
  girth: number; // largura da coluna torcida
  twist: number; // graus de torção da coluna
  thickness: number; // espessura do atleta
  baseText: string;
  baseText2: string;
  bodyColor: string;
  baseColor: string;
  textColor: string;
};

export const DEFAULT_SCULPTURE: SculptureParams = {
  form: "atleta",
  layout: "print",
  sport: "futebol",
  height: 120,
  girth: 44,
  twist: 270,
  thickness: 6,
  baseText: "CAMPEÃO",
  baseText2: "",
  bodyColor: "#d9a521",
  baseColor: "#1c1c1e",
  textColor: "#f5f5f0",
};

const TAB_H = 8; // o rasgo da base (trophyBase) tem 8 mm de fundo
const TAB_T = 5; // espessura da lingueta das colunas
const OVERLAP = 2;
const MAX_TAB_W = 24;
const TWIST_STEP = 4; // graus por camada de malha na torção
const STAR_POINTS = 5;
const STAR_INNER = 0.55;
const SOFTEN = 1.6; // cantos da estrela arredondados
const GAP_TO_BASE = 14;
const BASE_H = 10; // altura da base compacta
const BASE_D = 55; // base compacta da trophyBase: 120 × 55
const BASE_W = 120;

/** Seção reta da coluna: fita, estrela de 5 pontas ou cruz. Quem chama dá delete(). */
function columnSection(M: ManifoldToplevel, form: Exclude<SculptureForm, "atleta">, girth: number): CS {
  return scoped((k) => {
    const t = Math.max(7, girth * 0.2);
    if (form === "fluxo") return roundedRect(M, girth, t, t / 2 - 0.05);
    if (form === "nexo") return k(roundedRect(M, girth, t, t / 2 - 0.05)).add(k(k(roundedRect(M, girth, t, t / 2 - 0.05)).rotate(90)));
    const R = girth / 2 - SOFTEN;
    const pts: [number, number][] = Array.from({ length: STAR_POINTS * 2 }, (_, i) => {
      const a = Math.PI / 2 + (i * Math.PI) / STAR_POINTS;
      const r = i % 2 === 0 ? R : R * STAR_INNER;
      return [r * Math.cos(a), r * Math.sin(a)];
    });
    return k(new M.CrossSection([pts], "NonZero")).offset(SOFTEN, "Round", 2, 24);
  });
}

/** Atleta de pé numa lingueta: peça plana como o troféu adaptável (deitada na mesa, a lingueta encaixa na base). */
function athlete(ctx: ModelCtx, p: SculptureParams): { model: Model; tabW: number; width: number } {
  const { M } = ctx;
  return scoped((k) => {
    const sil = k(sportSilhouette(M, p.sport, p.height));
    const b = sil.bounds();
    const width = b.max[0] - b.min[0];
    const bottom = b.min[1];
    const floor = k(sil.intersect(k(M.CrossSection.square([1e4, 1], false).translate([-5e3, bottom]))));
    const floorW = floor.bounds().max[0] - floor.bounds().min[0];
    const tabW = Math.min(MAX_TAB_W, floorW * 0.7);
    const tab = k(k(M.CrossSection.square([tabW, TAB_H + OVERLAP], true)).translate([0, bottom - (TAB_H - OVERLAP) / 2]));
    const flat = k(sil.add(tab));
    // montado: em pé (a espessura vira profundidade), com a lingueta dentro do rasgo no topo da base
    const mesh = p.layout === "assembled" ? solidMesh(k(k(k(flat.extrude(p.thickness)).rotate([90, 0, 0])).translate([0, p.thickness / 2, BASE_H - bottom]))) : slab(flat, p.thickness);
    return { tabW, width, model: { name: "Atleta", parts: [{ name: "Atleta", color: p.bodyColor, mesh }] } };
  });
}

/** Coluna torcida em pé, impressa de cabeça para baixo (as duas pontas são iguais) com a lingueta para cima. */
function column(ctx: ModelCtx, p: SculptureParams): { model: Model; tabW: number; width: number } {
  const { M } = ctx;
  const form = p.form as Exclude<SculptureForm, "atleta">;
  return scoped((k) => {
    const section = k(columnSection(M, form, p.girth));
    const body = k(section.extrude(p.height, Math.max(1, Math.ceil(Math.abs(p.twist) / TWIST_STEP)), p.twist));
    const tabW = Math.min(MAX_TAB_W, p.girth * 0.45);
    // a lingueta segue a ponta torcida da coluna: o rasgo da base é reto e a peça gira para encaixar
    const tab = k(k(k(M.Manifold.cube([tabW, TAB_T, TAB_H + OVERLAP], true)).translate([0, 0, p.height + (TAB_H - OVERLAP) / 2])).rotate([0, 0, p.twist]));
    const whole = k(body.add(tab));
    // montada: de pé com a lingueta para baixo; o giro desfaz a torção da ponta para a lingueta bater com o rasgo reto
    const mesh = solidMesh(p.layout === "assembled" ? k(k(k(whole.rotate([180, 0, 0])).translate([0, 0, p.height + BASE_H])).rotate([0, 0, p.twist])) : whole);
    return { tabW, width: p.girth, model: { name: "Coluna", parts: [{ name: "Coluna", color: p.bodyColor, mesh }] } };
  });
}

/** Troféu escultura (#223): atleta de um dos 15 esportes ou coluna torcida (fita, estrela, cruz), sobre base com texto. */
export function buildSculpture(ctx: ModelCtx, p: SculptureParams): ModelOutput {
  const warnings: string[] = [];
  const piece = p.form === "atleta" ? athlete(ctx, p) : column(ctx, p);
  const thickness = p.form === "atleta" ? p.thickness : TAB_T;
  const baseW = Math.max(piece.width * 0.9, piece.tabW + 20);
  const base = trophyBase(ctx, { width: baseW, tabW: piece.tabW, thickness, relief: 1, lines: [p.baseText, p.baseText2], compact: true, baseColor: p.baseColor, textColor: p.textColor }, (m) => void warnings.push(m));
  if (p.layout === "assembled") {
    warnings.push("Montado: é só para ver. Para imprimir, volte para \"Mesa\".");
    return { models: [piece.model, base], warnings };
  }
  // o atleta (peça plana) leva a base embaixo, como o troféu adaptável; a coluna leva a base ao lado
  const placed = p.form === "atleta" ? moveModel(base, 0, -(TAB_H + GAP_TO_BASE + BASE_D / 2)) : moveModel(base, piece.width / 2 + BASE_W / 2 + GAP_TO_BASE, 0);
  return { models: [piece.model, placed], warnings };
}
