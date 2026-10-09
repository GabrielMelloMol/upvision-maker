import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type HoseAdapterParams = {
  innerA: number;
  outerA: number;
  lengthA: number;
  innerB: number;
  outerB: number;
  lengthB: number;
  /** Comprimento da parte cônica entre os dois lados. */
  cone: number;
  /** Nervuras de retenção nas duas pontas. */
  ribs: boolean;
  color: string;
};
export const DEFAULT_HOSE_ADAPTER: HoseAdapterParams = { innerA: 32, outerA: 36, lengthA: 30, innerB: 25, outerB: 29, lengthB: 30, cone: 25, ribs: false, color: "#0ea5e9" };

const MIN_WALL = 1.2;
const RIB_H = 0.8;
const RIB_W = 3;
const RIB_PITCH = 6;
const RIB_EDGE = 3;
const MAX_RIBS = 3;
const SEG = 96;

/** Pontos (raio, altura) de uma ponta reta de `from` a `to` com nervuras triangulares, sobre o raio externo `r`. */
function ribbedEdge(r: number, from: number, to: number, ribs: boolean): [number, number][] {
  const pts: [number, number][] = [[r, from]];
  if (!ribs) return [...pts, [r, to]];
  const up = to > from;
  const room = Math.abs(to - from) - 2 * RIB_EDGE;
  const count = Math.max(0, Math.min(MAX_RIBS, Math.floor(room / RIB_PITCH) + 1));
  for (let i = 0; i < count; i++) {
    const z0 = from + (up ? 1 : -1) * (RIB_EDGE + i * RIB_PITCH);
    const z1 = z0 + (up ? RIB_W : -RIB_W);
    pts.push([r, z0], [r + RIB_H, (z0 + z1) / 2], [r, z1]);
  }
  return [...pts, [r, to]];
}

/**
 * Adaptador de mangueira ou aspirador (#121): tubo reto de cada lado (DI e DE próprios) ligado por um cone.
 * Imprime em pé, com a ponta A (a mais larga, em geral) na mesa. Revolução de um perfil.
 */
export function buildHoseAdapter(ctx: ModelCtx, p: HoseAdapterParams): ModelOutput {
  const { M } = ctx;
  const warnings: string[] = [];
  const fix = (side: "A" | "B", inner: number, outer: number) => {
    if (outer >= inner + 2 * MIN_WALL) return outer;
    warnings.push(`A parede do lado ${side} ficou fina demais: o diâmetro externo subiu para ${(inner + 2 * MIN_WALL).toFixed(1)} mm (parede mínima de ${MIN_WALL} mm).`);
    return inner + 2 * MIN_WALL;
  };
  const outerA = fix("A", p.innerA, p.outerA), outerB = fix("B", p.innerB, p.outerB);
  const rOA = outerA / 2, rOB = outerB / 2, rIA = p.innerA / 2, rIB = p.innerB / 2;
  const zA = p.lengthA, zB = p.lengthA + p.cone, total = zB + p.lengthB;
  const steep = Math.max(Math.abs(rOA - rOB), Math.abs(rIA - rIB)) > p.cone;
  if (steep) warnings.push("O cone passa de 45°: a parte de dentro fica em balanço e pode precisar de suporte. Alongue o cone.");
  return scoped((k) => {
    const outer: [number, number][] = [...ribbedEdge(rOA, 0, zA, p.ribs), [rOB, zB], ...ribbedEdge(rOB, zB, total, p.ribs).slice(0)];
    const inner: [number, number][] = [[rIB, total], [rIB, zB], [rIA, zA], [rIA, 0]];
    const profile = k(new M.CrossSection([[...outer, ...inner]], "NonZero"));
    const solid = k(profile.revolve(SEG));
    return { models: [{ name: "Adaptador", parts: [{ name: "Adaptador", color: p.color, mesh: solidMesh(solid) }] }], warnings };
  });
}
