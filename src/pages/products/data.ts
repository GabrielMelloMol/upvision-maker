import { filaments, loadSettings, materials, printers } from "../../db/repo";
import { photosRepo, productsRepo } from "../../db/productsRepo";
import type { Db } from "../../db/types";
import type { ProductCtx } from "../../domain/products";
import { DEFAULT_SETTINGS } from "../../domain/settings";

export type ProductsData = ProductCtx & { covers: Record<number, string> };

export const loadProductsData = async (db: Db): Promise<ProductsData> => ({
  settings: await loadSettings(db),
  filaments: await filaments.list(db),
  materials: await materials.list(db),
  printers: await printers.list(db),
  products: await productsRepo.list(db),
  covers: await photosRepo.covers(db),
});

export const EMPTY_DATA: ProductsData = { settings: DEFAULT_SETTINGS, filaments: [], materials: [], printers: [], products: [], covers: {} };
