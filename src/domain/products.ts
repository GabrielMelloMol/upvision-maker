import { z } from "zod";
import { calculate, failureFor, machineHourCost, type CalcResult } from "./calc";
import type { Filament, Material, Printer } from "./entities";
import type { Settings } from "./settings";
import { swapComposition, Variant } from "./variants";

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
  // Anúncio e fiscal (#78), para a planilha de upload em massa. Padrões para backups antigos.
  description: z.string().trim().max(3000).default(""),
  ncm: z.string().trim().regex(/^(\d{8})?$/, "O NCM tem 8 números.").default(""),
  origin: z.enum(["0", "1", "2", "3", "4", "5", "6", "7", "8"]).default("0"),
  unit: z.string().trim().min(1).max(6).default("UN"),
  /** Peso da peça embalada (g); null = filamento + embalagem padrão. */
  weightG: nonNeg.nullable().default(null),
  /** Caixa (cm); null = caixa padrão da exportação. */
  boxL: nonNeg.nullable().default(null),
  boxW: nonNeg.nullable().default(null),
  boxH: nonNeg.nullable().default(null),
  // Variações (#82), 1 nível: nome do nível (ex.: Cor) e as opções. Padrões para backups antigos.
  variationLabel: z.string().trim().min(1).max(20).default("Cor"),
  variants: z.array(Variant).max(50, "No máximo 50 variações.").default([]),
  /** Modelo pronto que gera a peça (#164): "Preparar impressão" no pedido abre ele com a personalização. */
  modelId: z.string().trim().max(60).nullable().default(null),
});
export type ProductInput = z.infer<typeof ProductInput>;
/** `readError`: composição ou variações gravadas que não se conseguiu ler (A4); custo e baixa recusam o produto. */
export type Product = ProductInput & { id: number; readError?: string };

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
  description: "",
  ncm: "",
  origin: "0",
  unit: "UN",
  weightG: null,
  boxL: null,
  boxW: null,
  boxH: null,
  variationLabel: "Cor",
  variants: [],
  modelId: null,
};

/** `fixedPerHour`: custos operacionais rateados (ver `fixedCostPerHour`); ausente = 0. */
/** `measuredFailure`: taxa de falha medida na ficha de impressão de cada produto (#163), com 3+ impressões. */
export type ProductCtx = { filaments: Filament[]; materials: Material[]; printers: Printer[]; products: Product[]; settings: Settings; fixedPerHour?: number; measuredFailure?: Record<number, { pct: number; prints: number }> };

function guard(p: Product, seen: Set<number>) {
  if (p.readError) throw new Error(`${p.readError} Abra o produto e confira antes de usar.`);
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
      failurePct: failureFor(materials, ctx.settings, p.failurePct, ctx.measuredFailure?.[p.id]).pct,
    },
    ctx.settings,
  );
  return { result, warnings: [...new Set(warnings)] };
}

/** Preço de venda ao consumidor: o manual, se definido, senão o calculado. */
export const salePrice = (p: Product, r: CalcResult) => p.manualPrice ?? r.consumer;

/** Custo e preço de uma variação (#82): o produto com o filamento da cor trocado; preço próprio ou o do produto. */
export function variantPricing(p: Product, v: Variant, ctx: ProductCtx): { unitCost: number; price: number; warnings: string[] } {
  const swapped = { ...p, composition: swapComposition(p.composition, v.swaps) };
  const { result, warnings } = productPricing(swapped, ctx);
  return { unitCost: result.unitCost, price: v.price ?? salePrice(swapped, result), warnings };
}

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
