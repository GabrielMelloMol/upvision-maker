import { filaments, loadSettings, materials, printers } from "../../db/repo";
import { photosRepo, productsRepo } from "../../db/productsRepo";
import type { Db } from "../../db/types";
import type { ProductCtx } from "../../domain/products";
import { DEFAULT_SETTINGS } from "../../domain/settings";
import { costsRepo } from "../../db/costsRepo";
import { fixedCostPerHour } from "../../domain/finance";
import { todayIso } from "../../domain/orders";

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
  };
}

export const EMPTY_DATA: ProductsData = { settings: DEFAULT_SETTINGS, filaments: [], materials: [], printers: [], products: [], covers: {} };
