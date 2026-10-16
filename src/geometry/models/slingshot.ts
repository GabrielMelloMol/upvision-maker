import { bedMm } from "../bed";
import type { CS } from "../manifold";
import { fitInto, outerOnly, scoped } from "../shape2d";
import { bevelPrism } from "./bevel";
import { slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type SlingshotParams = {
  handleLen: number;
  handleW: number;
  forkLen: number;
  /** Distância entre as pontas da forquilha (de centro a centro). */
  spread: number;
  armW: number;
  /** Cintura do cabo: largura no meio em relação à das pontas (1 = reto). */
  waist: number;
  /** Marcas de dedo (concavidades) nos lados do cabo. */
  fingers: boolean;
  thickness: number;
  name: string;
  nameMode: "engraved" | "raised" | "none";
  depth: number;
  color: string;
  nameColor: string;
};

export const DEFAULT_SLINGSHOT: SlingshotParams = { handleLen: 95, handleW: 30, forkLen: 60, spread: 70, armW: 17, waist: 0.8, fingers: true, thickness: 14, name: "Léo", nameMode: "raised", depth: 1, color: "#1f2937", nameColor: "#f59e0b" };

const SEG = 64;
const TIE_R = 3.2; // furo para amarrar o elástico nas pontas
const LANYARD_R = 4;
const FINGER_R = 5.5;
const FINGER_DEPTH = 3; // quanto a concavidade entra no cabo
const EDGE = 3; // arredondado das arestas (mm)
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
    // cabo: corrente de círculos de raio variável (as pontas largas e a cintura no meio), unidos por cascos
    const hw = p.handleW / 2;
    const widthAt = (t: number) => hw * (1 - (1 - p.waist) * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 1.5); // t: 0 = fundo, 1 = onde vira forquilha
    const rings = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8, r = widthAt(t);
      return k(k(M.CrossSection.circle(r, SEG)).translate([0, hw + t * (p.handleLen - hw)]));
    });
    const handle = k(M.CrossSection.union(rings.slice(1).map((c, i) => k(M.CrossSection.hull([rings[i], c])))));
    // braços em curva suave (quadrática): saem do cabo, abrem e chegam às pontas
    const arm = (sx: number) => {
      const b0: [number, number] = [sx * hw * 0.55, yFork], t0: [number, number] = [sx * p.spread / 2, tipY], c0: [number, number] = [sx * (hw * 0.6 + (p.spread / 2 - hw * 0.6) * 0.12), yFork + p.forkLen * 0.7];
      const pts = Array.from({ length: 13 }, (_, i) => {
        const t = i / 12, u = 1 - t;
        return [u * u * b0[0] + 2 * u * t * c0[0] + t * t * t0[0], u * u * b0[1] + 2 * u * t * c0[1] + t * t * t0[1]] as [number, number];
      });
      const circles = pts.map((q) => k(k(M.CrossSection.circle(R, SEG)).translate(q)));
      return k(M.CrossSection.union(circles.slice(1).map((c, i) => k(M.CrossSection.hull([circles[i], c])))));
    };
    const raw = k(M.CrossSection.union([handle, arm(-1), arm(1)]));
    // concordância suave entre o cabo e os braços (fecha as quinas de dentro)
    const smooth = k(k(raw.offset(SMOOTH, "Round")).offset(-SMOOTH, "Round"));
    // marcas de dedo: concavidades redondas nos dois lados do cabo
    let body: CS = smooth;
    const fingers = p.fingers && widthAt(0.5) > FINGER_DEPTH + 4.5; // cabo estreito demais: sem concavidades (cortariam o cabo)
    if (p.fingers && !fingers) warnings.push("O cabo ficou estreito para as marcas de dedo: aumente a largura ou a cintura.");
    if (fingers) {
      const cuts = [0.28, 0.42, 0.56].flatMap((t) => [-1, 1].map((sx) => k(k(M.CrossSection.circle(FINGER_R, 32)).translate([sx * (widthAt(t) + FINGER_R - FINGER_DEPTH), hw + t * (p.handleLen - hw)]))));
      body = k(smooth.subtract(k(M.CrossSection.union(cuts))));
    }
    const lanyard = k(k(M.CrossSection.circle(LANYARD_R, 32)).translate([0, LANYARD_R + 6]));
    const ties = [-1, 1].map((sx) => k(k(M.CrossSection.circle(TIE_R, 32)).translate([sx * p.spread / 2, tipY])));
    const profile: CS = k(outerOnly(M, body).subtract(k(M.CrossSection.union([lanyard, ...ties]))));
    let solid = k(bevelPrism(M, profile, p.thickness, "round", Math.min(EDGE, p.thickness / 3), { bottom: true, top: true }));
    const parts = [] as { name: string; color: string; mesh: ReturnType<typeof solidMesh> }[];

    if (p.nameMode !== "none" && p.name.trim()) {
      const raw2 = ctx.text(p.name, 12);
      if (raw2) {
        const rotated = k(k(raw2).rotate(90)); // o nome lê de baixo para cima, ao longo da empunhadura
        const free = 2 * Math.max(2, widthAt(0.55) - (fingers ? FINGER_DEPTH : 0) - 1.5); // largura que sobra entre as concavidades
        const t = k(fitInto(rotated, Math.min(free, p.handleW * 0.62), p.handleLen * 0.5, 0));
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
