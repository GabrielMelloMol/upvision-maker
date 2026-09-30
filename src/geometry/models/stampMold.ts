import { bedMm } from "../bed";
import type { CS } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { MissingInput, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type StampMoldParams = {
  text: string;
  /** Lado maior do desenho. */
  size: number;
  margin: number;
  thickness: number;
  depth: number;
  /** false: desenho rebaixado (o EVA prensado fica com o desenho em relevo); true: desenho em relevo. */
  invert: boolean;
  /** Liga partes soltas: fecha vãos de até 2× este valor. */
  bridge: number;
  thumb: boolean;
  thumbSize: number;
  thumbX: number;
  thumbY: number;
  color: string;
};

export const DEFAULT_STAMP_MOLD: StampMoldParams = {
  text: "Ana",
  size: 80,
  margin: 6,
  thickness: 5,
  depth: 2,
  invert: false,
  bridge: 0,
  thumb: true,
  thumbSize: 26,
  thumbX: 0,
  thumbY: 0,
  color: "#0ea5e9",
};

const CORNER = 4;
const PEG_R = 4;
const PEG_CLEARANCE = 0.2;
const PAD_H = 4;
const STEM_H = 10;
const SOCKET_ROOF = 1; // plástico que sobra entre o encaixe e o desenho
const GAP = 10;

/** Desenho no tamanho pedido (lado maior), centrado; `bridge` > 0 fecha os vãos entre partes soltas. */
export function moldDesign(src: CS, size: number, bridge: number): CS {
  return scoped((k) => {
    const fitted = k(fitInto(src, size, size, 0));
    return bridge > 0 ? k(fitted.offset(bridge, "Round")).offset(-bridge, "Round") : fitted.translate([0, 0]);
  });
}

/**
 * Molde para carimbo de EVA ou massinha (#73): placa com o desenho rebaixado (ou em relevo, invertido). Aquecido e
 * prensado no molde, o EVA pega o desenho ao contrário e carimba do jeito certo. O apoio de polegar é uma peça
 * separada que encaixa num furo cego no verso, para a placa imprimir de face para cima, sem suporte.
 */
export function buildStampMold(ctx: ModelCtx, p: StampMoldParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const src = ctx.art && !ctx.art.isEmpty() ? ctx.art : ctx.text(p.text, p.size);
    if (!src || src.isEmpty()) throw new MissingInput("Envie um desenho ou digite um texto para ver o molde.");
    if (src !== ctx.art) k(src);
    const design = k(moldDesign(src, p.size, p.bridge));
    const b = design.bounds();
    const w = b.max[0] - b.min[0] + 2 * p.margin, h = b.max[1] - b.min[1] + 2 * p.margin;
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    const depth = Math.min(p.depth, p.thickness - SOCKET_ROOF - (p.thumb ? 1 : 0));
    let plate = k(k(k(roundedRect(M, w, h, CORNER)).translate([cx, cy])).extrude(p.thickness));
    const relief = k(design.extrude(depth));
    plate = p.invert ? k(plate.add(k(relief.translate([0, 0, p.thickness])))) : k(plate.subtract(k(relief.translate([0, 0, p.thickness - depth + 0.001]))));
    const models = [];
    if (p.thumb) {
      const x = Math.max(-w / 2 + PEG_R + 2, Math.min(w / 2 - PEG_R - 2, p.thumbX)) + cx;
      const y = Math.max(-h / 2 + PEG_R + 2, Math.min(h / 2 - PEG_R - 2, p.thumbY)) + cy;
      const socketH = p.invert ? p.thickness - SOCKET_ROOF : p.thickness - depth - SOCKET_ROOF;
      plate = k(plate.subtract(k(k(M.Manifold.cylinder(socketH, PEG_R + PEG_CLEARANCE, PEG_R + PEG_CLEARANCE, 48)).translate([x, y, 0]))));
      // apoio: disco (vai na mesa), haste e pino no topo; encaixa de cabeça para baixo no verso do molde
      const R = p.thumbSize / 2;
      const knob = k(
        M.Manifold.union([
          k(M.Manifold.cylinder(PAD_H, R, R, 64)),
          k(k(M.Manifold.cylinder(STEM_H, R * 0.5, R * 0.45, 48)).translate([0, 0, PAD_H])),
          k(k(M.Manifold.cylinder(socketH - 0.2, PEG_R, PEG_R, 48)).translate([0, 0, PAD_H + STEM_H])),
        ]),
      );
      models.push({ name: "Apoio de polegar", parts: [{ name: "Apoio", color: p.color, mesh: solidMesh(k(knob.translate([b.max[0] + p.margin + GAP + R, cy, 0]))) }] });
    }
    models.unshift({ name: "Molde", parts: [{ name: "Molde", color: p.color, mesh: solidMesh(plate) }] });
    const warnings = Math.max(w, h) > bedMm() ? [`O molde tem ${Math.round(Math.max(w, h))} mm: passa da mesa de ${bedMm()} mm.`] : [];
    return { models, warnings };
  });
}
