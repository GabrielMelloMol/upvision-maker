import { bedMm } from "../../geometry/bed";
import { estimateModels, type Estimate } from "../../domain/estimate";
import { packPlates } from "../../geometry/pack";
import type { PrintProfile } from "../../geometry/printProfile";
import type { Model } from "../../geometry/types";

export const PLATE_GAP = 5;

export type PieceRow = { name: string; count: number; grams: number; seconds: number; colors: string[] };
export type PlatePlan = { models: Model[]; grams: number; seconds: number; colors: string[] };
export type DrawerPrint = { rows: PieceRow[]; plates: PlatePlan[]; grams: number; seconds: number; byColor: Estimate["byColor"] };

type Group = { count: number; models: Model[] };
type Density = (color: string) => number;

const colorsOf = (models: Model[]) => [...new Set(models.flatMap((m) => m.parts.map((p) => p.color.toLowerCase())))];

/** Cada peça quantas vezes aparece: pedaços da base (um de cada) e os módulos com a quantidade (numerados). */
export function instances(basePieces: Model[], groups: Group[]): Model[] {
  return [
    ...basePieces,
    ...groups.flatMap((g) => Array.from({ length: g.count }, (_, i) => g.models.map((m) => ({ ...m, name: g.count > 1 ? `${m.name} (${i + 1})` : m.name }))).flat()),
  ];
}

/**
 * Lista de impressão da gaveta (#140): uma linha por peça diferente (quantidade, gramas e tempo do total dela) e as
 * mesas da impressora escolhida (#119) com as peças empacotadas, cada uma com a sua estimativa. Estimativa pela forma, sem fatiar.
 */
export function drawerPrint(basePieces: Model[], groups: Group[], profile?: PrintProfile, densityOf?: Density): DrawerPrint {
  const est = (models: Model[]) => estimateModels(models, profile, densityOf) ?? { byColor: [], grams: 0, seconds: 0 };
  const rows: PieceRow[] = [
    ...basePieces.map((m) => ({ name: m.name, count: 1, ...pick(est([m])), colors: colorsOf([m]) })),
    ...groups.flatMap((g) =>
      g.models.map((m) => {
        const e = est([m]);
        return { name: m.name, count: g.count, grams: e.grams * g.count, seconds: e.seconds * g.count, colors: colorsOf([m]) };
      }),
    ),
  ];
  const plates = packPlates(instances(basePieces, groups), bedMm(), PLATE_GAP).map((models) => ({ models, ...pick(est(models)), colors: colorsOf(models) }));
  const all = est(instances(basePieces, groups));
  return { rows, plates, grams: all.grams, seconds: all.seconds, byColor: all.byColor };
}

const pick = (e: Estimate) => ({ grams: e.grams, seconds: e.seconds });
