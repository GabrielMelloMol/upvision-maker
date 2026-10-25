import { bedMm } from "../bed";
import type { CS, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { MissingInput, moveMesh, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type StampMoldParams = {
  /** "plate": placa para prensar a folha de EVA aquecida; "clay": forma com cavidade para encher de massinha de EVA (#252). */
  kind?: "plate" | "clay";
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
  /** Só na forma para massinha: borda da base do carimbo em volta do desenho, profundidade da cavidade, quanto o desenho fica mais fundo, parede e ângulo de saída (°). */
  border?: number;
  cavity?: number;
  clayRelief?: number;
  wall?: number;
  draft?: number;
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
  kind: "plate",
  border: 4,
  cavity: 4,
  clayRelief: 1.5,
  wall: 2,
  draft: 2,
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
    if (p.kind === "clay") return clayMold(M, design, p);
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

const CLAY_FLOOR = 1.6; // fundo da forma, embaixo da cavidade
const BACK_H = 3;
const SLICE = 0.2; // a saída é feita em degraus de uma camada
const CLAY_NOTE = "Passe spray antiaderente na forma, encha com massinha de EVA apertando bem nos cantos, alise rente à borda e deixe secar de 1 a 2 dias antes de desenformar. Depois cole as costas no carimbo com cola de EVA ou cola quente.";

/**
 * Forma para massinha de EVA (#252): cavidade com a base do carimbo (o desenho mais a borda, que liga as partes soltas)
 * e o desenho mais fundo, paredes com ângulo de saída para desenformar, e as costas com apoio de polegar, que se colam
 * no carimbo seco. O desenho sai legível na forma: o carimbo virado carimba do jeito certo. Imprime sem suporte.
 */
function clayMold(M: ModelCtx["M"], design: CS, p: StampMoldParams): ModelOutput {
  return scoped((k) => {
    const cavity = p.cavity ?? 4, wall = p.wall ?? 2;
    const relief = Math.min(p.clayRelief ?? 1.5, cavity - 1);
    const tan = Math.tan(((p.draft ?? 0) * Math.PI) / 180);
    const grow = cavity * tan;
    const slab = k(k(design.offset((p.border ?? 4) + p.bridge, "Round")).offset(-p.bridge, "Round"));
    const deep = p.invert ? k(slab.subtract(design)) : design;
    const top = CLAY_FLOOR + cavity;
    // cada degrau: a base a partir de onde começa e a região funda desde o fundo, as duas abrindo com a saída
    const n = tan > 0 ? Math.ceil(cavity / SLICE) : 1;
    const dz = cavity / n;
    const steps: Solid[] = [];
    for (let i = 0; i < n; i++) {
      const z = CLAY_FLOOR + i * dz;
      const level = (cs: CS, from: number) => (tan > 0 && z > from ? k(cs.offset((z - from) * tan, "Round")) : cs);
      const ring = z + 1e-6 >= CLAY_FLOOR + relief ? k(M.CrossSection.union([level(deep, CLAY_FLOOR), level(slab, CLAY_FLOOR + relief)])) : level(deep, CLAY_FLOOR);
      steps.push(k(k(ring.extrude(dz + (i === n - 1 ? 1 : 0.001))).translate([0, 0, z])));
    }
    if (tan === 0) steps.push(k(k(slab.extrude(cavity - relief + 1)).translate([0, 0, CLAY_FLOOR + relief])));
    const outer = k(k(slab.offset(wall + grow, "Round")).extrude(top));
    const mold = k(outer.subtract(k(M.Manifold.union(steps))));
    // costas: o contorno de cima do carimbo, com o apoio de polegar (haste, aba a 45° e disco) em pé, sem suporte
    const back = k(slab.offset(grow, "Round"));
    const bb = back.bounds();
    const parts: Solid[] = [k(back.extrude(BACK_H))];
    if (p.thumb) {
      const R = p.thumbSize / 2, r = R * 0.45;
      const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
      const x = Math.max(bb.min[0] + r, Math.min(bb.max[0] - r, cx + p.thumbX));
      const y = Math.max(bb.min[1] + r, Math.min(bb.max[1] - r, cy + p.thumbY));
      const stemH = BACK_H + 10;
      parts.push(
        k(
          k(
            M.Manifold.union([
              k(M.Manifold.cylinder(stemH, r, r, 48)),
              k(k(M.Manifold.cylinder(R - r, r, R, 64)).translate([0, 0, stemH])),
              k(k(M.Manifold.cylinder(PAD_H, R, R, 64)).translate([0, 0, stemH + R - r])),
            ]),
          ).translate([x, y, 0]),
        ),
      );
    }
    const backSolid = k(M.Manifold.union(parts));
    const mb = mold.boundingBox();
    const shift = mb.max[0] - bb.min[0] + GAP + (p.thumb ? p.thumbSize / 2 : 0);
    const w = mb.max[0] - mb.min[0], h = mb.max[1] - mb.min[1];
    const warnings = [CLAY_NOTE];
    if (Math.max(w, h) > bedMm()) warnings.push(`A forma tem ${Math.round(Math.max(w, h))} mm: passa da mesa de ${bedMm()} mm.`);
    return {
      models: [
        { name: "Forma", parts: [{ name: "Forma", color: p.color, mesh: solidMesh(mold) }] },
        { name: "Costas", parts: [{ name: "Costas", color: p.color, mesh: moveMesh(solidMesh(backSolid), shift, 0) }] },
      ],
      warnings,
    };
  });
}
