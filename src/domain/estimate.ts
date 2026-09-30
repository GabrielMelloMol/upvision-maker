import type { Mesh, Model } from "../geometry/types";
import { DEFAULT_PROFILE, type PrintProfile } from "../geometry/printProfile";
import { DENSITY } from "./slicer/gcodeText";

/**
 * Estimativa ao vivo nas ferramentas 3D (#99): gramas, tempo e R$ a partir da malha, sem fatiar.
 * Volume impresso ≈ casca (área × paredes × largura da linha) + miolo × preenchimento. Erro esperado de ±20%:
 * o valor do fatiador prevalece.
 */
export const ESTIMATE_ERROR_PCT = 20;
/** Largura da linha do bico 0,4 (Bambu Studio/Orca usam 0,42). */
const LINE_MM = 0.42;
/** Vazão média real (mm³/s) contando deslocamentos, acelerações e paredes lentas, numa A1/P1 com PLA. */
const FLOW_MM3_S = 6;
/** Troca de camada, retração e limpeza (s por camada). */
const LAYER_S = 2;

/** Volume (mm³) e área (mm²) da malha fechada: soma de tetraedros com a origem (sinal ignorado). */
export function meshMeasures(m: Mesh): { volume: number; area: number } {
  const p = m.positions;
  const ix = m.indices;
  let vol = 0;
  let area = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3;
    const b = ix[t + 1] * 3;
    const c = ix[t + 2] * 3;
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]];
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return { volume: Math.abs(vol) / 6, area };
}

/** mm³ de plástico depositado para uma peça com esse volume e área. */
export function printedVolume(volume: number, area: number, profile: PrintProfile = DEFAULT_PROFILE): number {
  const walls = profile.walls ?? DEFAULT_PROFILE.walls!;
  const infill = (profile.infill ?? DEFAULT_PROFILE.infill!) / 100;
  const shell = Math.min(volume, area * walls * LINE_MM);
  return shell + (volume - shell) * infill;
}

export type ColorUse = { color: string; grams: number };
export type Estimate = { byColor: ColorUse[]; grams: number; seconds: number };

/**
 * Gramas por cor (cada cor = um filamento) e tempo para os modelos na mesa.
 * `densityOf(cor)` devolve a densidade do filamento escolhido para a cor (PLA se não souber).
 */
export function estimateModels(models: Model[], profile: PrintProfile = DEFAULT_PROFILE, densityOf: (color: string) => number = () => DENSITY.PLA): Estimate | null {
  const byColor = new Map<string, number>();
  let printed = 0;
  let top = 0;
  for (const part of models.flatMap((m) => m.parts)) {
    const { volume, area } = meshMeasures(part.mesh);
    if (volume <= 0) continue;
    const mm3 = printedVolume(volume, area, profile);
    printed += mm3;
    byColor.set(part.color, (byColor.get(part.color) ?? 0) + (mm3 / 1000) * densityOf(part.color));
    const z = part.mesh.positions;
    for (let i = 2; i < z.length; i += 3) top = Math.max(top, z[i]);
  }
  if (!printed) return null;
  const layers = Math.ceil(top / (profile.layerHeight ?? DEFAULT_PROFILE.layerHeight!));
  const colors = [...byColor].map(([color, grams]) => ({ color, grams: Math.round(grams * 10) / 10 }));
  return { byColor: colors, grams: Math.round(colors.reduce((s, c) => s + c.grams, 0) * 10) / 10, seconds: Math.round(printed / FLOW_MM3_S + layers * LAYER_S) };
}

/** Densidade (g/cm³) do material de um filamento cadastrado (PLA se não reconhecer). */
export const densityOfMaterial = (material: string | undefined) => DENSITY[(material ?? "").trim().toUpperCase()] ?? DENSITY.PLA;
