import type { CS, ManifoldToplevel } from "../manifold";
import { followTransform, fitInto, scoped } from "../shape2d";
import { slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { cone, EMBED } from "./spinner";
import { star } from "./shapes";

export type OrnamentTrim = "star" | "dot" | "bell" | "none";

export type OrnamentSpinnerParams = {
  diameter: number; // do aro, sem os enfeites
  thickness: number;
  gap: number; // folga entre disco e aro e entre pino e encaixe
  inlay: number; // profundidade da arte/texto, rente na face de baixo
  text: string; // texto curvo na parte de cima do disco (vazio = sem texto)
  trim: OrnamentTrim; // enfeites do aro
  trimCount: number;
  trimSize: number;
  frameColor: string;
  diskColor: string;
  artColor: string;
};

export const DEFAULT_ORNAMENT_SPINNER: OrnamentSpinnerParams = {
  diameter: 60,
  thickness: 5,
  gap: 0.5,
  inlay: 0.8,
  text: "Feliz Natal",
  trim: "star",
  trimCount: 8,
  trimSize: 7,
  frameColor: "#d6262e",
  diskColor: "#f8f8f6",
  artColor: "#22a04b",
};

const FRAME_WALL = 4;
const EYE_R = 4.5; // olhal do gancho
const EYE_HOLE_R = 2; // cabe um fio ou um gancho de enfeite
const NECK_W = 3.5;
const HOOK_CLEAR_DEG = 28; // sem enfeites perto do gancho
const TEXT_TOP_FRACTION = 0.5; // linha de base do texto, em relação ao raio do disco
const TEXT_H_FRACTION = 0.3;
const CUT_OVERSHOOT_MM = 0.001; // o corte começa um pouco abaixo da face, sem faces coincidentes
const ART_FRACTION = 0.8; // quanto do diâmetro do disco a arte ocupa

/** Sino de altura `d`: cúpula redonda e boca mais larga embaixo, centrado. */
function bell(M: ManifoldToplevel, d: number): CS {
  return scoped((k) => {
    const dome = k(k(M.CrossSection.circle(d * 0.36, 40)).translate([0, d * 0.14]));
    const skirt = k(M.CrossSection.square([d * 0.5, d * 0.12], true).translate([0, -d * 0.1]));
    const mouth = k(new M.CrossSection([[[-d * 0.5, -d * 0.4], [d * 0.5, -d * 0.4], [d * 0.3, -d * 0.04], [-d * 0.3, -d * 0.04]]], "NonZero"));
    return M.CrossSection.union([dome, skirt, mouth]);
  });
}

function trimShape(M: ManifoldToplevel, kind: Exclude<OrnamentTrim, "none">, size: number): CS {
  return kind === "star" ? star(M, size) : kind === "bell" ? bell(M, size) : M.CrossSection.circle(size / 2, 32);
}

/**
 * Enfeite giratório (#107): o disco gira dentro do aro em dois pinos cônicos (sem suporte), como o chaveiro giratório, mas
 * com gancho de pendurar em vez de argola, enfeites no aro e o texto curvo ou a arte rente na face de baixo (imprima com
 * essa face na mesa: sai lisa e em até 3 cores).
 */
export function buildOrnamentSpinner(ctx: ModelCtx, p: OrnamentSpinnerParams): ModelOutput {
  const { M, art, text, arc } = ctx;
  return scoped((k) => {
    const T = p.thickness, g = p.gap;
    const Ro = p.diameter / 2, Ri = Ro - FRAME_WALL, rd = Ri - g;
    const pr = T / 2 - 0.5;
    const ring = k(k(M.CrossSection.circle(Ro, 96)).subtract(k(M.CrossSection.circle(Ri, 96))));
    const eyeY = Ro + EYE_R + 1; // o olhal fica um pouco afastado: o pescoço o liga ao aro
    const neck = k(k(M.CrossSection.square([NECK_W, eyeY - Ro + 1.5], false)).translate([-NECK_W / 2, Ro - 1.5]));
    const eye = k(k(M.CrossSection.circle(EYE_R, 48)).translate([0, eyeY]));
    const hole = k(k(M.CrossSection.circle(EYE_HOLE_R, 32)).translate([0, eyeY]));
    const trims: CS[] = [];
    if (p.trim !== "none" && p.trimCount > 0) {
      const n = Math.round(p.trimCount);
      const shape = k(trimShape(M, p.trim, p.trimSize));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 360 + 90 + 180 / n; // a 1ª fica ao lado do gancho, não em cima dele
        if (Math.abs(((a - 90 + 540) % 360) - 180) < HOOK_CLEAR_DEG) continue;
        const rad = (a * Math.PI) / 180;
        trims.push(k(k(shape.rotate(a - 90)).translate([(Ro + p.trimSize * 0.25) * Math.cos(rad), (Ro + p.trimSize * 0.25) * Math.sin(rad)])));
      }
    }
    const frame2d = k(k(M.CrossSection.union([ring, neck, eye, ...trims])).subtract(hole));
    const pins = [k(cone(M, pr, pr + EMBED, -Ri - EMBED, 1, T / 2)), k(cone(M, pr, pr + EMBED, Ri + EMBED, -1, T / 2))];
    const frame = k(k(frame2d.extrude(T)).add(k(pins[0].add(pins[1]))));
    const sockets = [k(cone(M, pr + g, pr + EMBED + g, -Ri - EMBED, 1, T / 2)), k(cone(M, pr + g, pr + EMBED + g, Ri + EMBED, -1, T / 2))];

    // desenho do disco: a arte enviada (colorida vira várias cores) ou o texto curvo em cima
    let design: CS | null = null;
    let designParts: { name: string; color: string; cs: CS }[] = [];
    if (art && !art.isEmpty()) {
      const fitted = k(fitInto(art, 2 * rd * ART_FRACTION, 2 * rd * ART_FRACTION, 0));
      const placed = k(fitted.intersect(k(M.CrossSection.circle(rd * 0.92, 96)))); // os cantos da caixa não passam do disco
      design = placed;
      designParts = ctx.artLayers && ctx.artLayers.length > 1
        ? ctx.artLayers.map((l, i) => ({ name: `Arte ${i + 1}`, color: l.color, cs: k(k(followTransform(art, placed, l.cs)).intersect(placed)) })).filter((l) => !l.cs.isEmpty())
        : [{ name: "Arte", color: p.artColor, cs: placed }];
    } else if (p.text.trim()) {
      const h = rd * TEXT_H_FRACTION;
      const raw = arc ? arc(p.text, h, rd * TEXT_TOP_FRACTION, "top") : text(p.text, 100);
      if (raw) {
        design = arc ? k(raw) : k(fitInto(k(raw), rd * 1.4, h, rd * 0.4));
        designParts = [{ name: "Texto", color: p.artColor, cs: design }];
      }
    }
    const inlay = Math.min(p.inlay, T - 1);
    const body = k(k(M.CrossSection.circle(rd, 96)).extrude(T));
    const carved = design ? k(body.subtract(k(k(design.extrude(inlay + CUT_OVERSHOOT_MM)).translate([0, 0, -CUT_OVERSHOOT_MM])))) : body;
    const disk = k(carved.subtract(k(sockets[0].add(sockets[1]))));

    const parts = [
      { name: "Aro", color: p.frameColor, mesh: solidMesh(frame) },
      { name: "Disco", color: p.diskColor, mesh: solidMesh(disk) },
      ...designParts.map((d) => ({ name: d.name, color: d.color, mesh: slab(d.cs, inlay, 0) })),
    ];
    const warnings = ["Imprima com a face da arte para baixo: sai lisa e a arte já fica rente, sem pausa."];
    if (p.trim !== "none" && p.trimSize > FRAME_WALL * 2) warnings.push("Enfeites grandes demais para o aro podem quebrar: use até o dobro da largura do aro.");
    return { models: [{ name: "Enfeite giratório", parts }], warnings };
  });
}
