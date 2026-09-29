import type { Model } from "./types";

/** Como a peça vai ser impressa: 1 cor, troca manual de filamento (pausas) ou multicor automático (AMS e afins). */
export type PrintMode = "single" | "manual" | "ams";
export type ColorSwap = { z: number; color: string };
export type PrintPlan = { models: Model[]; pauses: number[]; swaps: ColorSwap[]; error: string | null };

const EPS = 1e-3;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function zRange(positions: Float32Array): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]);
    hi = Math.max(hi, positions[i]);
  }
  return [lo, hi];
}

const recolor = (models: Model[], color: string): Model[] => models.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, color })) }));

/**
 * Ajusta a saída ao jeito de imprimir. Troca manual: as cores precisam estar empilhadas por altura (cada cor começa
 * onde a anterior termina); vira um arquivo de 1 filamento com uma pausa antes da 1ª camada de cada cor nova.
 * `basePauses` (ex.: colocar a tag NFC) são mantidas.
 */
export function printPlan(models: Model[], mode: PrintMode, layerHeight: number, basePauses: number[] = []): PrintPlan {
  const first = models[0]?.parts[0]?.color;
  if (mode === "ams" || !first) return { models, pauses: basePauses, swaps: [], error: null };
  if (mode === "single") return { models: recolor(models, first), pauses: basePauses, swaps: [], error: null };
  const ranges = new Map<string, [number, number]>();
  for (const m of models)
    for (const p of m.parts) {
      const c = p.color.toLowerCase();
      const [lo, hi] = zRange(p.mesh.positions);
      const cur = ranges.get(c);
      ranges.set(c, cur ? [Math.min(cur[0], lo), Math.max(cur[1], hi)] : [lo, hi]);
    }
  const order = [...ranges].sort((a, b) => a[1][0] - b[1][0]);
  for (let i = 1; i < order.length; i++)
    if (order[i][1][0] < order[i - 1][1][1] - EPS)
      return { models, pauses: basePauses, swaps: [], error: "Troca manual não dá para este modelo: tem cores lado a lado na mesma altura. Use AMS ou imprima em 1 cor." };
  const swaps = order.slice(1).map(([color, [lo]]) => ({ color, z: r3((Math.floor(lo / layerHeight + EPS) + 1) * layerHeight) }));
  const pauses = [...new Set([...basePauses, ...swaps.map((s) => s.z)])].sort((a, b) => a - b);
  return { models: recolor(models, order[0][0]), pauses, swaps, error: null };
}
