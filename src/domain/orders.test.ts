import { describe, expect, test } from "vitest";
import type { Filament } from "./entities";
import { lineTotal, orderTotals, planForOrder, priceForChannel, transition, type OrderItem } from "./orders";
import { productPricing, type Product, type ProductCtx } from "./products";
import { DEFAULT_SETTINGS } from "./settings";

const item = (p: Partial<OrderItem>): OrderItem => ({ productId: null, description: "Peça", qty: 1, unitPrice: 10, discountPct: 0, unitCost: 0, printMinutes: 0, ...p });

describe("totais", () => {
  test("desconto por item e frete", () => {
    expect(lineTotal(item({ qty: 3, unitPrice: 20, discountPct: 10 }))).toBe(54);
    const t = orderTotals([item({ qty: 3, unitPrice: 20, discountPct: 10 }), item({ qty: 1, unitPrice: 15.5 })], 12);
    expect(t).toEqual({ subtotal: 75.5, discount: 6, freight: 12, total: 81.5 });
  });
});

describe("status", () => {
  test("confirmar (pendente → produção) dá baixa; cancelar depois estorna", () => {
    expect(transition("pending", "production", false)).toEqual({ stock: "apply" });
    expect(transition("production", "canceled", true)).toEqual({ stock: "revert" });
    expect(transition("delivered", "canceled", true)).toEqual({ stock: "revert" });
  });
  test("etapas seguintes não mexem no estoque; cancelar pedido sem baixa não estorna", () => {
    expect(transition("production", "done", true)).toEqual({ stock: null });
    expect(transition("done", "delivered", true)).toEqual({ stock: null });
    expect(transition("pending", "canceled", false)).toEqual({ stock: null });
    expect(transition("canceled", "pending", false)).toEqual({ stock: null });
  });
  test("pular de pendente direto para concluído/entregue também dá baixa", () => {
    expect(transition("pending", "delivered", false)).toEqual({ stock: "apply" });
  });
  test("voltar de produção para pendente estorna", () => {
    expect(transition("production", "pending", true)).toEqual({ stock: "revert" });
  });
  test("cancelado só pode ser reaberto", () => {
    expect(() => transition("canceled", "delivered", false)).toThrow(/reabra/i);
  });
});

const fil: Filament = { id: 1, material: "PLA", color: "", brand: "", pricePerKg: 100, spoolG: 1000, stockG: 1000, minG: 0 };
const product = (id: number, p: Partial<Product>): Product => ({
  id,
  name: `P${id}`,
  kind: "simple",
  composition: { filaments: [{ filamentId: 1, grams: 50 }], materials: [], items: [] },
  printerId: null,
  printMinutes: 60,
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
  ...p,
});
const ctx = (products: Product[]): ProductCtx => ({ filaments: [fil], materials: [], printers: [], products, settings: { ...DEFAULT_SETTINGS, maintenancePct: 0 } });

test("plano do pedido: dois itens do mesmo produto não usam o mesmo estoque pronto duas vezes; itens avulsos não baixam nada", () => {
  const p = product(1, { stock: 3 });
  const plan = planForOrder([item({ productId: 1, qty: 2 }), item({ productId: 1, qty: 2 }), item({ productId: null, qty: 5 })], ctx([p]));
  expect(plan.products).toEqual({ 1: 3 });
  expect(plan.filaments).toEqual({ 1: 50 });
});

test("preço sugerido por canal", () => {
  const p = product(1, {});
  const c = ctx([p]);
  c.settings = { ...c.settings, channels: [{ name: "Shopee", feePct: 20, feeFixed: 4 }] };
  const r = productPricing(p, c).result;
  expect(priceForChannel(p, r, "Consumidor final")).toBe(r.consumer);
  expect(priceForChannel(p, r, "Revenda")).toBe(r.resale);
  expect(priceForChannel(p, r, "Shopee")).toBe(r.channels[0].price);
  expect(priceForChannel({ ...p, manualPrice: 30 }, r, "Consumidor final")).toBe(30);
});
