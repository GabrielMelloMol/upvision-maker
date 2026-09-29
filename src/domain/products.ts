import { z } from "zod";
import { calculate, failureFor, machineHourCost, type CalcResult } from "./calc";
import type { Filament, Material, Printer } from "./entities";
import type { Settings } from "./settings";

const id = z.number().int().positive();
const nonNeg = z.number().min(0, "Não pode ser negativo");

/** Composição da MESA inteira (igual à calculadora): o custo é dividido por `piecesPerPlate`. */
export const Composition = z.object({
  filaments: z.array(z.object({ filamentId: id, grams: nonNeg })),
  materials: z.array(z.object({ materialId: id, qty: nonNeg })),
  items: z.array(z.object({ productId: id, qty: z.number().positive() })), // kits: produtos por unidade do kit
});
export type Composition = z.infer<typeof Composition>;

export const ProductInput = z.object({
  name: z.string().trim().min(1, "Obrigatório").max(120),
  kind: z.enum(["simple", "kit"]),
  composition: Composition,
  printerId: id.nullable(),
  printMinutes: nonNeg,
  laborMinutes: nonNeg,
  piecesPerPlate: z.number().int().min(1),
  freight: nonNeg,
  manualPrice: nonNeg.nullable(),
  consignmentPrice: nonNeg.nullable(), // valor de repasse sugerido (consignação)
  stock: z.number(), // produto pronto
  minStock: nonNeg,
  sku: z.string().trim().max(60),
  notes: z.string().trim().max(1000),
  /** Taxa de falha só deste produto (peças altas, finas); null = a do material ou a geral (#35). Padrão para backups antigos. */
  failurePct: z.number().min(0).max(90, "Use até 90%").nullable().default(null),
});
export type ProductInput = z.infer<typeof ProductInput>;
export type Product = ProductInput & { id: number };

export const EMPTY_PRODUCT: ProductInput = {
  name: "",
  kind: "simple",
  composition: { filaments: [], materials: [], items: [] },
  printerId: null,
  printMinutes: 0,
  laborMinutes: 0,
  piecesPerPlate: 1,
  freight: 0,
  manualPrice: null,
  consignmentPrice: null,
  stock: 0,
  minStock: 0,
  sku: "",
  notes: "",
  failurePct: null,
};

/** `fixedPerHour`: custos operacionais rateados (ver `fixedCostPerHour`); ausente = 0. */
export type ProductCtx = { filaments: Filament[]; materials: Material[]; printers: Printer[]; products: Product[]; settings: Settings; fixedPerHour?: number };

function guard(p: Product, seen: Set<number>) {
  if (seen.has(p.id)) throw new Error(`O kit "${p.name}" está dentro de si mesmo.`);
  return new Set([...seen, p.id]);
}

/** Preço por canal do produto com os preços ATUAIS dos insumos. Insumo excluído vira aviso. */
export function productPricing(p: Product, ctx: ProductCtx, seen = new Set<number>()): { result: CalcResult; warnings: string[] } {
  const inside = guard(p, seen);
  const warnings: string[] = [];
  const materials: string[] = [];
  const filaments = p.composition.filaments.flatMap((l) => {
    const f = ctx.filaments.find((x) => x.id === l.filamentId);
    if (!f) warnings.push("Um filamento da composição foi excluído do cadastro.");
    if (f) materials.push(f.material);
    return f ? [{ pricePerKg: f.pricePerKg, grams: l.grams }] : [];
  });
  const extras = p.composition.materials.flatMap((l) => {
    const m = ctx.materials.find((x) => x.id === l.materialId);
    if (!m) warnings.push("Um material extra da composição foi excluído do cadastro.");
    return m ? [{ unitPrice: m.unitPrice, qty: l.qty }] : [];
  });
  for (const item of p.composition.items) {
    const child = ctx.products.find((x) => x.id === item.productId);
    if (!child) {
      warnings.push("Um produto do kit foi excluído.");
      continue;
    }
    const c = productPricing(child, ctx, inside);
    warnings.push(...c.warnings);
    extras.push({ unitPrice: c.result.unitCost, qty: item.qty * p.piecesPerPlate });
  }
  const printer = ctx.printers.find((x) => x.id === p.printerId);
  const result = calculate(
    {
      filaments,
      extras,
      printerWatts: printer?.watts ?? 0,
      printHours: p.printMinutes / 60,
      laborHours: p.laborMinutes / 60,
      quantity: p.piecesPerPlate,
      freight: p.freight,
      marketplaceMarginPct: ctx.settings.marketplaceMarginPct,
      machinePerHour: printer ? machineHourCost(printer) : 0,
      fixedPerHour: ctx.fixedPerHour,
      failurePct: failureFor(materials, ctx.settings, p.failurePct).pct,
    },
    ctx.settings,
  );
  return { result, warnings: [...new Set(warnings)] };
}

/** Preço de venda ao consumidor: o manual, se definido, senão o calculado. */
export const salePrice = (p: Product, r: CalcResult) => p.manualPrice ?? r.consumer;

/** Quantidades a baixar: gramas por filamento, unidades por material e unidades de produto pronto. */
export type ConsumptionPlan = { filaments: Record<number, number>; materials: Record<number, number>; products: Record<number, number> };

const add = (rec: Record<number, number>, key: number, v: number) => {
  if (v) rec[key] = Math.round(((rec[key] ?? 0) + v) * 1000) / 1000;
};

/**
 * O que sai do estoque para entregar (`useOwnStock: true`) ou produzir (`false`) `units` do produto.
 * Produto pronto em estoque é usado primeiro; o que faltar é fabricado com os insumos. Kits descem aos componentes.
 */
export function planConsumption(productId: number, units: number, ctx: ProductCtx, opts: { useOwnStock: boolean }, seen = new Set<number>(), plan: ConsumptionPlan = { filaments: {}, materials: {}, products: {} }): ConsumptionPlan {
  const p = ctx.products.find((x) => x.id === productId);
  if (!p) throw new Error("Produto não encontrado.");
  const inside = guard(p, seen);
  const fromStock = opts.useOwnStock ? Math.min(Math.max(p.stock - (plan.products[p.id] ?? 0), 0), units) : 0;
  add(plan.products, p.id, fromStock);
  const make = units - fromStock;
  if (make <= 0) return plan;
  const perUnit = make / p.piecesPerPlate;
  for (const l of p.composition.filaments) add(plan.filaments, l.filamentId, l.grams * perUnit);
  for (const l of p.composition.materials) add(plan.materials, l.materialId, l.qty * perUnit);
  for (const item of p.composition.items) planConsumption(item.productId, item.qty * make, ctx, { useOwnStock: true }, inside, plan);
  return plan;
}
