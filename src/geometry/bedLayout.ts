import { meshBounds, modelsBounds } from "./bounds";
import { layoutOnPlate } from "./keychain";
import type { Model } from "./types";

/**
 * Peças de um modelo arrumadas além da mesa (#125): se cada uma cabe sozinha, rearruma em grade dentro de 256 mm.
 * A 1ª peça fica onde estava (os elementos arrastáveis do #79 são medidos nela); o resto se ajeita em volta.
 */
const BED_MM = 256;
const GAP_MM = 8;

const size = (ms: Model[]) => {
  const b = modelsBounds(ms);
  return b ? Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) : 0;
};

export function fitSetOnBed(models: Model[]): Model[] {
  if (models.length < 2 || size(models) <= BED_MM || models.some((m) => size([m]) > BED_MM)) return models;
  const laid = layoutOnPlate(models, BED_MM - GAP_MM, GAP_MM);
  if (size(laid) > BED_MM) return models;
  const before = meshBounds(models[0].parts.map((p) => p.mesh))!.min;
  const after = meshBounds(laid[0].parts.map((p) => p.mesh))!.min;
  const [dx, dy] = [before[0] - after[0], before[1] - after[1]];
  return laid.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, mesh: { ...p.mesh, positions: p.mesh.positions.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) } })) }));
}

/** Aviso quando as peças (cada uma cabendo) não cabem juntas na mesa: o fatiador usa mais de uma mesa. */
export function setOnBedWarning(models: Model[]): string | null {
  if (models.length < 2 || size(models) <= BED_MM || models.some((m) => size([m]) > BED_MM)) return null;
  return `As ${models.length} peças não cabem juntas na mesa de ${BED_MM} mm: o fatiador vai usar mais de uma mesa (ou imprima uma de cada vez).`;
}
