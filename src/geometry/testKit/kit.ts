import { bedMm } from "../bed";
import { modelsBounds } from "../bounds";
import { layoutOnPlate } from "../keychain";
import type { ManifoldToplevel } from "../manifold";
import type { ModelCtx } from "../models/common";
import type { Model } from "../types";
import { ALL_COUPONS, COUPONS, DEFAULT_INPUTS, GROUP_LABEL, type CouponId, type KitInputs, type KitSelection } from "./catalog";
import { clipEars } from "./clipEars";
import { gearPairs } from "./gearPair";
import { hinges, latches } from "./hingeLatch";
import { phoneCorners } from "./phoneCorner";
import { boardFrames, candyPlungers, cupRings } from "./rings";
import { threadPairs } from "./threadPairs";

export type KitParams = { inputs: KitInputs; selected: KitSelection };
export const DEFAULT_KIT: KitParams = { inputs: DEFAULT_INPUTS, selected: ALL_COUPONS };

const GAP = 8;

/** As peças de um cupom (uma por variante, na ordem do número). */
export function couponModels(M: ManifoldToplevel, ctx: ModelCtx, id: CouponId, i: KitInputs): Model[] {
  switch (id) {
    case "cup": return cupRings(M, i.cupDiameter);
    case "board": return boardFrames(M, i.boardL, i.boardW);
    case "phone": return phoneCorners(M, i.phoneW, i.phoneT, i.phoneR);
    case "thread": return threadPairs(M, ctx);
    case "candy": return candyPlungers(M, i.candyD);
    case "gear": return gearPairs(M);
    case "hinge": return hinges(M);
    case "latch": return latches(M);
    case "clip": return clipEars(M);
  }
}

/** Uma mesa do kit: peças de um mesmo filamento, arrumadas para caber na mesa da impressora. */
export type KitPlate = { title: string; material: string; models: Model[] };
export type KitResult = { plates: KitPlate[]; models: Model[]; warnings: string[] };

const fits = (models: Model[], bed: number) => {
  const b = modelsBounds(models);
  return !!b && b.max[0] - b.min[0] <= bed && b.max[1] - b.min[1] <= bed;
};

const area = (models: Model[]) => {
  const b = modelsBounds(models);
  return b ? (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) : 0;
};

/**
 * Divide os blocos (um por cupom) em mesas que cabem na impressora: o maior bloco primeiro, cada um na primeira mesa onde ainda
 * cabe inteiro, para as peças do mesmo teste ficarem juntas. Um bloco maior que uma mesa vazia é repartido peça a peça.
 */
export function planPlates(blocks: Model[][], bed: number): Model[][] {
  const plates: Model[][] = [];
  const place = (models: Model[]): boolean => {
    for (const p of plates) {
      if (fits(layoutOnPlate([...p, ...models], bed, GAP), bed)) {
        p.push(...models);
        return true;
      }
    }
    return false;
  };
  for (const block of [...blocks].sort((a, b) => area(b) - area(a))) {
    if (place(block)) continue;
    if (fits(layoutOnPlate(block, bed, GAP), bed)) plates.push([...block]);
    else for (const m of block) if (!place([m])) plates.push([m]);
  }
  return plates.map((p) => layoutOnPlate(p, bed, GAP));
}

/**
 * O kit (ou só os cupons marcados), em mesas separadas por filamento: PLA ou PETG, PETG (trava) e TPU (capa). Cada mesa cabe na
 * mesa da impressora; imprima uma de cada vez.
 */
export function buildTestKit(M: ManifoldToplevel, ctx: ModelCtx, p: KitParams): KitResult {
  const chosen = COUPONS.filter((c) => p.selected[c.id]);
  const plates: KitPlate[] = [];
  for (const group of ["general", "petg", "tpu"] as const) {
    const ids = chosen.filter((c) => c.group === group);
    if (!ids.length) continue;
    const blocks = ids.map((c) => couponModels(M, ctx, c.id, p.inputs));
    for (const laid of planPlates(blocks, bedMm() - GAP)) plates.push({ title: "", material: GROUP_LABEL[group], models: laid });
  }
  const numbered = plates.map((pl, i) => ({ ...pl, title: `Mesa ${i + 1} · ${pl.material}` }));
  const total = numbered.reduce((n, pl) => n + pl.models.length, 0);
  const warnings = numbered.length ? [`O kit tem ${total} peças em ${numbered.length} ${numbered.length === 1 ? "mesa" : "mesas"} de ${bedMm()} mm, separadas por filamento: escolha a mesa acima e imprima uma de cada vez.`] : [];
  if (numbered.some((pl) => pl.material === "TPU 95A")) warnings.push("O canto da capa só vale em TPU 95A (em PLA o teste não dobra).");
  if (numbered.some((pl) => pl.material === "PETG")) warnings.push("A trava só vale em PETG: em PLA a lâmina pode trincar no teste.");
  return { plates: numbered, models: numbered.flatMap((pl) => pl.models), warnings };
}
