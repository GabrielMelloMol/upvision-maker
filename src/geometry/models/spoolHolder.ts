import { bedMm } from "../bed";
import type { Solid } from "../manifold";
import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type SpoolHolderParams = {
  /** Diâmetro de fora do carretel e largura entre as abas, mm. */
  spoolD: number;
  spoolW: number;
  /** Furo central do carretel. */
  hole: number;
  /** Folga do eixo no furo do carretel e no encaixe dos postes. */
  clearance: number;
  socketGap: number;
  thickness: number;
  color: string;
  axleColor: string;
};

export const DEFAULT_SPOOL_HOLDER: SpoolHolderParams = { spoolD: 200, spoolW: 70, hole: 53, clearance: 1, socketGap: 0.25, thickness: 8, color: "#1f2937", axleColor: "#f59e0b" };

const SIDE_GAP = 3; // folga entre o carretel e cada poste
const ABOVE = 4; // o carretel fica a esta altura da base
const BASE_T = 5;
const HEAD_EXTRA = 8; // cabeça do eixo: raio a mais
const HEAD_T = 4;
const SEG = 96;
const GAP = 12;

/**
 * Suporte de carretel (#234): base com dois postes e um eixo solto. O eixo (diâmetro do furo menos a folga) atravessa um poste,
 * o carretel e o outro poste; a cabeça do eixo trava de um lado. O carretel gira apoiado só no eixo, sem encostar na base.
 */
export function buildSpoolHolder(ctx: ModelCtx, p: SpoolHolderParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const axleD = p.hole - 2 * p.clearance;
    const socketD = axleD + 2 * p.socketGap;
    const axleZ = BASE_T + ABOVE + p.spoolD / 2; // altura do centro do eixo
    const span = p.spoolW + 2 * SIDE_GAP; // vão entre os postes
    const L = span + 2 * p.thickness + 24, W = Math.max(70, p.spoolD * 0.55);
    // base
    const base = k(k(M.Manifold.cube([L, W, BASE_T], false)).translate([-L / 2, -W / 2, 0]));
    // postes: placa em pé com o topo arredondado, furo do eixo
    const post = (x: number): Solid => {
      const r = socketD / 2 + 7;
      const body = k(M.Manifold.union([k(k(M.Manifold.cube([p.thickness, 2 * r + 20, axleZ], false)).translate([0, -(r + 10), 0])), k(k(M.Manifold.cylinder(p.thickness, r, r, SEG)).rotate([0, 90, 0])).translate([0, 0, axleZ])]));
      const hole = k(k(k(M.Manifold.cylinder(p.thickness + 2, socketD / 2, socketD / 2, SEG)).rotate([0, 90, 0])).translate([-1, 0, axleZ]));
      return k(k(body.subtract(hole)).translate([x, 0, 0]));
    };
    const x1 = -span / 2 - p.thickness, x2 = span / 2;
    const stand = k(M.Manifold.union([base, post(x1), post(x2)]));
    // eixo, em pé na mesa: haste com a ponta chanfrada e a cabeça numa ponta
    const axleLen = span + 2 * p.thickness + 10;
    const shaft = k(M.Manifold.cylinder(axleLen - 2, axleD / 2, axleD / 2, SEG));
    const tip = k(k(M.Manifold.cylinder(2, axleD / 2, axleD / 2 - 1.2, SEG)).translate([0, 0, axleLen - 2]));
    const head = k(k(M.Manifold.cylinder(HEAD_T, axleD / 2 + HEAD_EXTRA, axleD / 2 + HEAD_EXTRA, SEG)).translate([0, 0, -HEAD_T]));
    const axle = k(k(M.Manifold.union([shaft, tip, head])).translate([L / 2 + GAP + axleD / 2 + HEAD_EXTRA, 0, HEAD_T]));
    if (p.spoolW + 2 * p.thickness + 24 > bedMm() || W > bedMm()) warnings.push(`A base tem ${Math.round(L)} × ${Math.round(W)} mm: passa da mesa de ${bedMm()} mm.`);
    if (axleZ > bedMm()) warnings.push("Os postes ficam mais altos que a impressora: use um carretel menor.");
    if (p.clearance < 0.5) warnings.push("Folga pequena: o carretel pode agarrar no eixo.");
    return {
      models: [
        { name: "Base", parts: [{ name: "Base", color: p.color, mesh: solidMesh(stand) }] },
        { name: "Eixo", parts: [{ name: "Eixo", color: p.axleColor, mesh: solidMesh(axle) }] },
      ],
      warnings,
    };
  });
}
