import { filaments, loadSettings, materials, printers } from "../../db/repo";
import { photosRepo, productsRepo } from "../../db/productsRepo";
import type { Db } from "../../db/types";
import type { ProductCtx } from "../../domain/products";
import { DEFAULT_SETTINGS } from "../../domain/settings";
import { costsRepo } from "../../db/costsRepo";
import { fixedCostPerHour } from "../../domain/finance";
import { todayIso } from "../../domain/orders";
import { printLogsRepo } from "../../db/printLogsRepo";
import { measuredFailurePct, type PrintLog } from "../../domain/printLogs";

export type ProductsData = ProductCtx & { covers: Record<number, string> };

export async function loadProductsData(db: Db): Promise<ProductsData> {
  const settings = await loadSettings(db);
  return {
    settings,
    fixedPerHour: fixedCostPerHour(await costsRepo.list(db), settings, todayIso()),
    filaments: await filaments.list(db),
    materials: await materials.list(db),
    printers: await printers.list(db),
    products: await productsRepo.list(db),
    covers: await photosRepo.covers(db),
    measuredFailure: measuredByProduct(await printLogsRepo.list(db)),
  };
}

/** Taxa de falha medida por produto (#163): só os que já têm impressões suficientes. */
export function measuredByProduct(logs: PrintLog[]): Record<number, { pct: number; prints: number }> {
  const by = new Map<number, PrintLog[]>();
  for (const l of logs) if (l.productId) by.set(l.productId, [...(by.get(l.productId) ?? []), l]);
  return Object.fromEntries(
    [...by].flatMap(([id, ls]) => {
      const pct = measuredFailurePct(ls);
      return pct === null ? [] : [[id, { pct, prints: ls.length }]];
    }),
  );
}

export const EMPTY_DATA: ProductsData = { settings: DEFAULT_SETTINGS, filaments: [], materials: [], printers: [], products: [], covers: {} };
