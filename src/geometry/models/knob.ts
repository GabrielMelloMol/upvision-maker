import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";
import type { CS, Solid } from "../manifold";

export type KnobParams = {
  diameter: number;
  height: number;
  shaft: "round" | "d";
  shaftD: number;
  /** Quanto o chato do eixo em D tira do círculo. */
  flatDepth: number;
  shaftDepth: number;
  serrations: number;
  serrationDepth: number;
  mark: "none" | "line" | "dot";
  /** Folga somada ao diâmetro do furo do eixo. */
  clearance: number;
  color: string;
};
export const DEFAULT_KNOB: KnobParams = { diameter: 30, height: 18, shaft: "d", shaftD: 6, flatDepth: 0.5, shaftDepth: 12, serrations: 16, serrationDepth: 1.5, mark: "line", clearance: 0.15, color: "#1c1c1e" };

const SEG = 96;
const ROOF = 2; // plástico fechado em cima do furo
const WALL = 3; // entre o furo e a borda
const MARK_DEPTH = 0.8;
const MARK_WIDTH = 1.6;

/** Botão ou manopla (#121): cilindro com serrilha, marca de indicação e furo de eixo redondo ou em D pelo fundo. */
export function buildKnob(ctx: ModelCtx, p: KnobParams): ModelOutput {
  const { M } = ctx;
  const warnings: string[] = [];
  const R = p.diameter / 2;
  let shaftD = p.shaftD;
  if (shaftD > p.diameter - 2 * WALL) {
    shaftD = p.diameter - 2 * WALL;
    warnings.push(`O eixo era largo demais para o botão: o furo ficou com ${shaftD.toFixed(1)} mm.`);
  }
  let depth = p.shaftDepth;
  if (depth > p.height - ROOF) {
    depth = p.height - ROOF;
    warnings.push(`O furo do eixo era fundo demais: ficou com ${depth.toFixed(1)} mm, deixando ${ROOF} mm fechados no topo.`);
  }
  return scoped((k) => {
    let body: Solid = k(k(M.CrossSection.circle(R, SEG)).extrude(p.height));
    if (p.serrations > 0) {
      const grooves: CS[] = [];
      for (let i = 0; i < p.serrations; i++) {
        const a = (2 * Math.PI * i) / p.serrations;
        grooves.push(k(k(M.CrossSection.circle(p.serrationDepth, 24)).translate([R * Math.cos(a), R * Math.sin(a)])));
      }
      body = k(body.subtract(k(k(M.CrossSection.union(grooves)).extrude(p.height))));
    }
    const sr = (shaftD + p.clearance) / 2;
    let hole: CS = k(M.CrossSection.circle(sr, 64));
    // eixo em D: o furo perde uma faixa de `flatDepth` do lado +X
    if (p.shaft === "d") hole = k(hole.intersect(k(M.CrossSection.square([2 * sr - p.flatDepth, 2 * sr]).translate([-sr, -sr]))));
    body = k(body.subtract(k(k(hole.extrude(depth + 0.01)).translate([0, 0, -0.01]))));
    if (p.mark !== "none") {
      const cut = p.mark === "line" ? k(M.CrossSection.square([MARK_WIDTH, R * 0.8]).translate([-MARK_WIDTH / 2, R * 0.1])) : k(k(M.CrossSection.circle(1.5, 24)).translate([0, R * 0.65]));
      body = k(body.subtract(k(k(cut.extrude(MARK_DEPTH + 0.01)).translate([0, 0, p.height - MARK_DEPTH]))));
    }
    return { models: [{ name: "Botão", parts: [{ name: "Botão", color: p.color, mesh: solidMesh(body) }] }], warnings };
  });
}
