import { PrintLogInput } from "../domain/printLogs";
import { z } from "zod";
import { FilamentInput, MaterialInput, PrinterInput } from "../domain/entities";
import { ConsignmentInput } from "../domain/consignments";
import { CustomerInput } from "../domain/customers";
import { OperationalCostInput } from "../domain/finance";
import { OrderInput, OrderItem, STATUSES } from "../domain/orders";
import { ProductInput } from "../domain/products";
import { CalcHistoryInput } from "./calcHistoryRepo";
import { ModelVariantInput } from "./modelVariantsRepo";
import { ToolProjectInput, ToolStateRow } from "./toolStateRepo";
import { PhotoOwner } from "./photosRepo";

const id = z.number().int().positive();

/** Tabelas incluídas no backup, com o schema de cada linha. Colunas = chaves do schema. */
export const TABLES = {
  settings: z.object({ id: z.literal(1), data: z.string() }),
  printers: PrinterInput.extend({ id }),
  filaments: FilamentInput.extend({ id }),
  materials: MaterialInput.extend({ id }),
  // composição guardada como JSON (texto) na linha
  products: ProductInput.extend({ id, composition: z.string(), variants: z.string().default("[]") }), // JSON na linha; backups antigos não têm
  // fotos de produto, projeto e impressão (#162); backups antigos trazem product_photos (convertido no restore)
  photos: z.object({ id, owner: PhotoOwner, position: z.number().int().min(0), dataUrl: z.string().startsWith("data:image/"), createdAt: z.string() }),
  customers: CustomerInput.extend({ id, active: z.number().int() }), // booleano guardado como 0/1
  print_logs: PrintLogInput.extend({ id, brim: z.number().int() }), // ficha de impressão (#163); brim 0/1
  company: z.object({ id: z.literal(1), data: z.string() }),
  orders: OrderInput.omit({ items: true }).extend({
    id,
    status: z.enum(STATUSES),
    stockApplied: z.number().int(),
    appliedPlan: z.string().nullable(),
    createdAt: z.string(),
    deliveredAt: z.string().nullable(),
    quoteId: z.number().int().nullable(),
    paidAmount: z.number().min(0).default(0), // #177; backups antigos não têm
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
  consignments: ConsignmentInput.omit({ items: true }).extend({ id, items: z.string(), active: z.number().int(), lastRestockAt: z.string().nullable(), createdAt: z.string() }), // #184; items = JSON na linha, active 0/1
  tool_state: ToolStateRow,
  // favorito e tags são NOT NULL no banco; backup de antes da biblioteca (#161) não traz: ganham o padrão (A2)
  tool_projects: ToolProjectInput.extend({ id, favorite: z.union([z.boolean(), z.number()]).default(0), tags: z.string().default("[]") }),
};

export type TableName = keyof typeof TABLES;

/** Fotos de produto de backups de antes da #162 (tabela product_photos). */
export const LegacyProductPhoto = z.object({ id, productId: id, position: z.number().int().min(0), dataUrl: z.string().startsWith("data:image/") });
