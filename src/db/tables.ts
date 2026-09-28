import { z } from "zod";
import { FilamentInput, MaterialInput, PrinterInput } from "../domain/entities";
import { ProductInput } from "../domain/products";

const id = z.number().int().positive();

/** Tabelas incluídas no backup, com o schema de cada linha. Colunas = chaves do schema. */
export const TABLES = {
  settings: z.object({ id: z.literal(1), data: z.string() }),
  printers: PrinterInput.extend({ id }),
  filaments: FilamentInput.extend({ id }),
  materials: MaterialInput.extend({ id }),
  // composição guardada como JSON (texto) na linha
  products: ProductInput.extend({ id, composition: z.string() }),
  product_photos: z.object({ id, productId: id, position: z.number().int().min(0), dataUrl: z.string().startsWith("data:image/") }),
};

export type TableName = keyof typeof TABLES;
