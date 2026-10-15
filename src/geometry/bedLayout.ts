import { bedMm } from "./bed";
import { meshBounds, modelsBounds } from "./bounds";
import { layoutOnPlate } from "./keychain";
import type { Model } from "./types";

/**
 * Peças de um modelo arrumadas além da mesa (#125): se cada uma cabe sozinha, rearruma em grade dentro da mesa da impressora escolhida (#119).
 * A 1ª peça fica onde estava (os elementos arrastáveis do #79 são medidos nela); o resto se ajeita em volta.
 */
const GAP_MM = 8;

const size = (ms: Model[]) => {
  const b = modelsBounds(ms);
  return b ? Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) : 0;
};

export function fitSetOnBed(models: Model[]): Model[] {
  if (models.length < 2 || size(models) <= bedMm() || models.some((m) => size([m]) > bedMm())) return models;
  const laid = layoutOnPlate(models, bedMm() - GAP_MM, GAP_MM);
  if (size(laid) > bedMm()) return models;
  const before = meshBounds(models[0].parts.map((p) => p.mesh))!.min;
  const after = meshBounds(laid[0].parts.map((p) => p.mesh))!.min;
  const [dx, dy] = [before[0] - after[0], before[1] - after[1]];
  return laid.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, mesh: { ...p.mesh, positions: p.mesh.positions.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) } })) }));
}

/** Aviso quando as peças (cada uma cabendo) não cabem juntas na mesa: o fatiador usa mais de uma mesa. */
export function setOnBedWarning(models: Model[]): string | null {
  if (models.length < 2 || size(models) <= bedMm() || models.some((m) => size([m]) > bedMm())) return null;
  return `As ${models.length} peças não cabem juntas na mesa de ${bedMm()} mm: o fatiador vai usar mais de uma mesa (ou imprima uma de cada vez).`;
}

/** Mesas que um projeto pode ter no Bambu Studio e no OrcaSlicer: passando disso o fatiador deixa peças de fora da mesa. */
export const MAX_PLATES = 36;
const PACK_EFFICIENCY = 0.7; // aproveitamento da mesa ao arrumar caixas (peça que sobra de lado não encaixa)

/** Mesas (estimativa) para imprimir todas as peças: soma das caixas de cada uma sobre a área útil da mesa. */
export function platesNeeded(models: Model[]): number {
  const bed = bedMm();
  let area = 0;
  for (const m of models) {
    const b = meshBounds(m.parts.map((p) => p.mesh));
    if (b) area += (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]);
  }
  return Math.ceil(area / (bed * bed * PACK_EFFICIENCY));
}

/** Aviso quando as peças pedem mais mesas que o fatiador aceita num projeto: imprimir por lotes. */
export function platesLimitWarning(models: Model[]): string | null {
  const n = platesNeeded(models);
  return n > MAX_PLATES ? `São ${models.length} peças, umas ${n} mesas de ${bedMm()} mm: mais que as ${MAX_PLATES} que o Bambu Studio e o OrcaSlicer aceitam num projeto. Salve e imprima em lotes (por exemplo, uma ou duas letras de cada vez) ou diminua a altura ou o texto.` : null;
}
