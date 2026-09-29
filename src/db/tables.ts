import { z } from "zod";
import { FilamentInput, MaterialInput, PrinterInput } from "../domain/entities";
import { CustomerInput } from "../domain/customers";
import { OperationalCostInput } from "../domain/finance";
import { OrderInput, OrderItem, STATUSES } from "../domain/orders";
import { ProductInput } from "../domain/products";
import { CalcHistoryInput } from "./calcHistoryRepo";
import { ModelVariantInput } from "./modelVariantsRepo";

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
  customers: CustomerInput.extend({ id, active: z.number().int() }), // booleano guardado como 0/1
  company: z.object({ id: z.literal(1), data: z.string() }),
  orders: OrderInput.omit({ items: true }).extend({
    id,
    status: z.enum(STATUSES),
    stockApplied: z.number().int(),
    appliedPlan: z.string().nullable(),
    createdAt: z.string(),
    deliveredAt: z.string().nullable(),
    quoteId: z.number().int().nullable(),
  }),
  order_items: OrderItem.extend({ id, orderId: id, position: z.number().int() }),
  order_history: z.object({ id, orderId: id, status: z.string(), note: z.string(), at: z.string() }),
  quotes: z.object({
    id,
    data: z.string(),
    createdAt: z.string(),
    convertedOrderId: z.number().int().nullable(),
    // backups antes do #36 não têm número: a restauração numera
    year: z.number().int().nullable().default(null),
    seq: z.number().int().nullable().default(null),
  }),
  quote_numbers: z.object({ id: z.number().int(), seq: z.number().int().min(0) }), // id = ano
  operational_costs: OperationalCostInput.extend({ id }),
  calc_history: CalcHistoryInput.extend({ id }),
  model_variants: ModelVariantInput.extend({ id }),
};

export type TableName = keyof typeof TABLES;
