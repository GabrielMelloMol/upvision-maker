import { bedMm } from "../bed";
import type { CS, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

const SEG = 64;
const num = (s: string) => Number(s.trim().replace(",", "."));
const br = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

// ---------------------------------------------------------------- furação

export type DrillJigParams = { holes: number; drillD: number; pitch: number; edgeDist: number; thickness: number; clearance: number; lip: boolean; color: string };
export const DEFAULT_DRILL_JIG: DrillJigParams = { holes: 4, drillD: 5, pitch: 32, edgeDist: 20, thickness: 12, clearance: 0.3, lip: true, color: "#2563eb" };

const MARGIN = 10;
const LIP_H = 6, LIP_W = 4;

/**
 * Gabarito de furação (#235): bloco com os furos-guia em linha (diâmetro da broca + folga, bem longos para a broca não sair
 * do prumo), com um batente na borda para encostar na peça. Os furos ficam à distância `edgeDist` da borda do batente.
 * Sai de ponta-cabeça (o batente para cima).
 */
export function buildDrillJig(ctx: ModelCtx, p: DrillJigParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const n = Math.max(1, Math.round(p.holes));
    const hole = p.drillD + p.clearance;
    const L = (n - 1) * p.pitch + 2 * MARGIN + hole;
    const W = p.edgeDist + MARGIN + hole / 2;
    if (p.pitch < hole + 4 && n > 1) warnings.push("Os furos ficam muito perto uns dos outros: aumente a distância entre eles.");
    if (p.edgeDist < hole / 2 + 3) warnings.push("O furo fica perto demais da borda do gabarito: aumente a distância da borda.");
    if (p.thickness < p.drillD) warnings.push("Gabarito mais fino que a broca: a broca perde a guia. Use pelo menos uma vez o diâmetro dela.");
    if (L > bedMm()) warnings.push(`O gabarito tem ${Math.round(L)} mm: passa da mesa de ${bedMm()} mm.`);
    let body: Solid = k(k(M.Manifold.cube([L, W, p.thickness], false)).translate([-L / 2, 0, 0]));
    if (p.lip) body = k(M.Manifold.union([body, k(k(M.Manifold.cube([L, LIP_W, LIP_H + 0.01], false)).translate([-L / 2, 0, p.thickness - 0.01]))]));
    const holes = Array.from({ length: n }, (_, i) => k(k(M.Manifold.cylinder(p.thickness + LIP_H + 2, hole / 2, hole / 2, SEG)).translate([(i - (n - 1) / 2) * p.pitch, p.edgeDist, -1])));
    body = k(body.subtract(k(M.Manifold.union(holes))));
    // entalhes de centro nas pontas, para marcar a linha com um riscador
    const notch = (x: number) => k(k(M.Manifold.cube([0.8, W + 2, 1], false)).translate([x - 0.4, -1, -0.01]));
    body = k(body.subtract(k(M.Manifold.union([notch(-L / 2 + MARGIN / 2), notch(L / 2 - MARGIN / 2)]))));
    return { models: [{ name: "Gabarito de furação", parts: [{ name: "Gabarito", color: p.color, mesh: solidMesh(body) }] }], warnings };
  });
}

// ---------------------------------------------------------------- raios

export type RadiusGaugeParams = { radii: string; thickness: number; font: number; color: string };
export const DEFAULT_RADIUS_GAUGE: RadiusGaugeParams = { radii: "1, 1.5, 2, 3, 4, 5, 6, 8, 10", thickness: 2, font: 5, color: "#f59e0b" };

const TAB_W = 26, TAB_GAP = 1.5, SPINE = 7;

/** "1, 1.5, 2" → raios em mm (ponto nos decimais); o que não é número volta em `bad`. */
export function parseRadii(s: string): { radii: number[]; bad: string[] } {
  const radii: number[] = [], bad: string[] = [];
  for (const t of s.split(/[;,\s]+/).filter(Boolean)) {
    const v = num(t);
    if (Number.isFinite(v) && v > 0 && v <= 40) radii.push(v);
    else bad.push(t);
  }
  return { radii: [...new Set(radii)].sort((a, b) => a - b), bad };
}

/**
 * Gabarito de raios (#235): uma lâmina por raio, presas numa espinha: cada uma tem um entalhe redondo de raio R (confere a
 * quina arredondada de fora da peça) e uma ponta redonda de raio R (confere a concordância de dentro), com o valor gravado.
 */
export function buildRadiusGauge(ctx: ModelCtx, p: RadiusGaugeParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const { radii, bad } = parseRadii(p.radii);
    if (bad.length) warnings.push(`Raio ignorado (use mm, com ponto nos decimais, até 40): ${bad.join(", ")}`);
    if (!radii.length) throw new Error("Escreva pelo menos um raio, em mm (ex.: 2, 3, 5).");
    // cada lâmina: retângulo com o entalhe de raio R na ponta de cima e a ponta redonda de raio R embaixo
    const blades: CS[] = [];
    let y = 0;
    for (const r of radii) {
      const h = r + 8;
      const rect = k(k(roundedRect(M, TAB_W, h, 1)).translate([TAB_W / 2, h / 2]));
      const notch = k(k(M.CrossSection.circle(r, SEG)).translate([TAB_W / 2, h]));
      const bump = k(k(M.CrossSection.circle(r, SEG)).translate([TAB_W / 2, 0])); // meio círculo para baixo
      let blade = k(k(rect.subtract(notch)).add(bump));
      const txt = ctx.text(`${br(r, r % 1 ? 1 : 0)}`, p.font);
      if (txt) {
        const t = k(fitInto(k(txt), TAB_W - 8, Math.min(p.font, h - 4), 0));
        blade = k(blade.subtract(k(t.translate([TAB_W / 2, h / 2 - 1]))));
      }
      blades.push(k(blade.translate([SPINE, y + r])));
      y += h + r + TAB_GAP;
    }
    const spine = k(k(roundedRect(M, SPINE + 2, y - TAB_GAP, 1)).translate([(SPINE + 2) / 2, (y - TAB_GAP) / 2]));
    const plate = k(M.CrossSection.union([spine, ...blades]));
    if (y > bedMm()) warnings.push(`O gabarito tem ${Math.round(y)} mm de comprimento: passa da mesa de ${bedMm()} mm. Use menos raios.`);
    return { models: [{ name: "Gabarito de raios", parts: [{ name: "Gabarito", color: p.color, mesh: solidMesh(k(plate.extrude(p.thickness))) }] }], warnings };
  });
}

// ---------------------------------------------------------------- etiqueta

export type LabelJigParams = { labelW: number; labelH: number; rim: number; thickness: number; round: number; color: string };
export const DEFAULT_LABEL_JIG: LabelJigParams = { labelW: 50, labelH: 30, rim: 12, thickness: 2.4, round: 2, color: "#10b981" };

/** Gabarito de etiqueta (#235): moldura com a janela do tamanho da etiqueta (+0,4 mm de folga), para colar sempre no mesmo lugar. */
export function buildLabelJig(ctx: ModelCtx, p: LabelJigParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const W = p.labelW + 0.4, H = p.labelH + 0.4;
    const outer = k(roundedRect(M, W + 2 * p.rim, H + 2 * p.rim, Math.min(p.round + 2, p.rim)));
    const win = k(roundedRect(M, W, H, p.round));
    // dois dentes para o polegar, no meio dos lados compridos: tiram a etiqueta da janela sem unha
    const thumb = (dy: number) => k(k(M.CrossSection.circle(6, SEG)).translate([0, dy]));
    const frame = k(k(k(outer.subtract(win)).subtract(thumb((H + p.rim) / 2 + 2))).subtract(thumb(-(H + p.rim) / 2 - 2)));
    if (Math.max(W, H) + 2 * p.rim > bedMm()) warnings.push("O gabarito passa da mesa.");
    return { models: [{ name: "Gabarito de etiqueta", parts: [{ name: "Gabarito", color: p.color, mesh: solidMesh(k(frame.extrude(p.thickness))) }] }], warnings };
  });
}
