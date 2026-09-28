import { heightfieldMesh } from "./heightfield";
import type { ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Mesh, Model } from "./types";

export type LithoShape = "flat" | "curved" | "box";

export type LithoParams = {
  shape: LithoShape;
  minT: number; // espessura no branco (mais luz passa)
  maxT: number; // espessura no preto
  border: number; // moldura cheia em volta (mm)
  arc: number; // curva: ângulo do arco (graus)
  color: string;
};

export const DEFAULT_LITHO: LithoParams = { shape: "flat", minT: 0.8, maxT: 3, border: 3, arc: 120, color: "#f8f8f6" };

const FOOT_D = 12;
const FOOT_H = 3;

/** Espessura por pixel: escuro = grosso; a moldura fica na espessura máxima. */
export function lithoThickness(luma: Float32Array, cols: number, rows: number, cell: number, p: Pick<LithoParams, "minT" | "maxT" | "border">): Float32Array {
  const b = Math.round(p.border / cell);
  const t = new Float32Array(luma.length);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const edge = r < b || c < b || r >= rows - b || c >= cols - b;
      t[i] = edge ? p.maxT : p.maxT - luma[i] * (p.maxT - p.minT);
    }
  return t;
}

const solidOf = (M: ManifoldToplevel, m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

/**
 * Litofania impressa em pé (melhor qualidade): plana (com pé), curva (arco, fica em pé sozinha)
 * ou caixa de luz (4 lados com a mesma foto, relevo para dentro). O desenho aparece contra a luz.
 */
export function buildLithophane(M: ManifoldToplevel, luma: Float32Array, cols: number, rows: number, cell: number, p: LithoParams): Model {
  if (!(p.maxT > p.minT)) throw new Error("A espessura máxima precisa ser maior que a mínima.");
  const t = lithoThickness(luma, cols, rows, cell, p);
  const W = (cols - 1) * cell, H = (rows - 1) * cell;
  const stand = (x: number, y: number, z: number): [number, number, number] => [x, z, y + H / 2];
  if (p.shape === "curved") {
    const R = W / ((p.arc * Math.PI) / 180);
    const mesh = heightfieldMesh(t, cols, rows, cell, (x, y, z) => {
      const a = x / R;
      return [(R + z) * Math.sin(a), R - (R + z) * Math.cos(a), y + H / 2];
    });
    return { name: "Litofania", parts: [{ name: "Litofania", color: p.color, mesh }] };
  }
  return scoped((k) => {
    const panel = k(solidOf(M, heightfieldMesh(t, cols, rows, cell, stand)));
    if (p.shape === "flat") {
      const foot = k(k(M.Manifold.cube([W, FOOT_D, FOOT_H], true)).translate([0, p.maxT / 2, FOOT_H / 2]));
      return { name: "Litofania", parts: [{ name: "Litofania", color: p.color, mesh: toMesh(k(panel.add(foot))) }] };
    }
    // caixa: lado plano para fora, relevo para dentro; os cantos se sobrepõem na moldura
    const walls = [0, 90, 180, 270].map((deg) => k(k(panel.translate([0, -W / 2, 0])).rotate([0, 0, deg])));
    return { name: "Caixa de luz", parts: [{ name: "Caixa de luz", color: p.color, mesh: toMesh(k(M.Manifold.union(walls))) }] };
  });
}

const ATTENUATION = 1.5; // por mm: PLA branco deixa passar ~e^(-1,5·t) da luz (aproximado)
const WARM = [1, 0.92, 0.78];

/**
 * Como a litofania fica contra a luz: RGBA em tons de cinza (fino = claro, grosso = escuro),
 * normalizado entre as espessuras mínima e máxima.
 */
export function backlitPreview(luma: Float32Array, cols: number, rows: number, cell: number, p: Pick<LithoParams, "minT" | "maxT" | "border">): Uint8ClampedArray<ArrayBuffer> {
  const t = lithoThickness(luma, cols, rows, cell, p);
  const lo = Math.exp(-ATTENUATION * p.maxT), hi = Math.exp(-ATTENUATION * p.minT);
  const out = new Uint8ClampedArray(cols * rows * 4);
  for (let i = 0; i < t.length; i++) {
    const v = Math.round(((Math.exp(-ATTENUATION * t[i]) - lo) / (hi - lo)) * 255);
    out.set([v, v * WARM[1], v * WARM[2], 255], i * 4); // luz de LED quente atrás

  }
  return out;
}
