import { describe, expect, test } from "vitest";
import type { Filament, Material, Printer } from "./entities";
import { planConsumption, productPricing, type Product, type ProductCtx } from "./products";
import { DEFAULT_SETTINGS } from "./settings";

const filament = (id: number, pricePerKg: number): Filament => ({ id, material: "PLA", color: "", brand: "", pricePerKg, spoolG: 1000, stockG: 1000, minG: 0 });
const material = (id: number, unitPrice: number): Material => ({ id, name: "Embalagem", unit: "un", unitPrice, stock: 100, min: 0 });
const printer: Printer = { id: 1, name: "A1", watts: 0, price: 0, lifeHours: 5000, upkeepPerHour: 0, nozzle: 0.4 };

function product(id: number, p: Partial<Product>): Product {
  return {
    id,
    modelId: null,
    name: `P${id}`,
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
    ...p,
  };
}

function ctx(products: Product[], fil = [filament(1, 85)]): ProductCtx {
  return { filaments: fil, materials: [material(1, 5)], printers: [printer], products, settings: { ...DEFAULT_SETTINGS, maintenancePct: 5, failurePct: 0 } };
}

const luminaria = product(1, { composition: { filaments: [{ filamentId: 1, grams: 120 }], materials: [{ materialId: 1, qty: 1 }], items: [] } });

describe("preço do produto", () => {
  test("mesmo resultado da calculadora (exemplo da home: R$ 15,96 / 47,88 / 79,80)", () => {
    const { result } = productPricing(luminaria, ctx([luminaria]));
    expect(result.unitCost).toBe(15.96);
    expect(result.resale).toBe(47.88);
    expect(result.consumer).toBe(79.8);
  });

  test("impressora com preço: máquina por hora e custos fixos rateados entram no custo", () => {
    const a1: Printer = { ...printer, price: 3000 };
    const p = product(2, { printerId: 1, printMinutes: 150 });
    const { result } = productPricing(p, { ...ctx([p]), printers: [a1], fixedPerHour: 2 });
    expect(result.machine).toBe(1.5); // R$ 0,60/h × 2,5 h
    expect(result.fixed).toBe(5);
    expect(result.unitCost).toBe(6.5);
  });

  test("falha do produto ou do material do filamento (#35)", () => {
    const p = product(3, { composition: { filaments: [{ filamentId: 1, grams: 88 }], materials: [], items: [] } }); // 88 g × R$ 100 = 8,80
    const base = { ...ctx([p], [{ ...filament(1, 100), material: "TPU" }]), settings: { ...DEFAULT_SETTINGS, maintenancePct: 0, failurePct: 0, failureByMaterial: { TPU: 12 } } };
    expect(productPricing(p, base).result.failure).toBe(1.2); // 8,80 ÷ 0,88 − 8,80
    expect(productPricing({ ...p, failurePct: 0 }, base).result.failure).toBe(0); // o produto manda
    // ficha de impressão (#163): a taxa medida vale mais que a do material, menos que a digitada no produto
    const measured = { ...base, measuredFailure: { 3: { pct: 20, prints: 5 } } };
    expect(productPricing(p, measured).result.failure).toBe(2.2); // 8,80 ÷ 0,80 − 8,80
    expect(productPricing({ ...p, failurePct: 0 }, measured).result.failure).toBe(0);
  });

  test("recalcula quando o preço do filamento muda", () => {
    const { result } = productPricing(luminaria, ctx([luminaria], [filament(1, 100)]));
    // (0,1 × 120 + 5) × 1,05 = 17,85
    expect(result.unitCost).toBe(17.85);
  });

  test("insumo excluído vira aviso e sai do custo", () => {
    const { result, warnings } = productPricing(luminaria, ctx([luminaria], []));
    expect(result.unitCost).toBe(5.25);
    expect(warnings.join()).toMatch(/filamento/i);
  });

  test("kit = soma dos produtos (pelo custo) + extras do próprio kit", () => {
    const a = product(2, { composition: { filaments: [{ filamentId: 1, grams: 100 }], materials: [], items: [] } }); // 8,93
    const kit = product(3, { kind: "kit", composition: { filaments: [], materials: [{ materialId: 1, qty: 1 }], items: [{ productId: 2, qty: 2 }] } });
    const { result } = productPricing(kit, ctx([a, kit]));
    // componentes entram pelo custo exibido (8,93): (2 × 8,93 + 5) × 1,05 = 24,00 (manutenção incide também sobre o kit)
    expect(result.unitCost).toBe(24);
  });

  test("kit que contém a si mesmo (direta ou indiretamente) dá erro", () => {
    const a = product(1, { kind: "kit", composition: { filaments: [], materials: [], items: [{ productId: 2, qty: 1 }] } });
    const b = product(2, { kind: "kit", composition: { filaments: [], materials: [], items: [{ productId: 1, qty: 1 }] } });
    expect(() => productPricing(a, ctx([a, b]))).toThrow(/dentro de si/i);
  });

  test("peças na mesa dividem o custo da mesa", () => {
    const p = product(1, { piecesPerPlate: 4, composition: { filaments: [{ filamentId: 1, grams: 400 }], materials: [], items: [] } });
    expect(productPricing(p, ctx([p])).result.unitCost).toBeCloseTo((0.085 * 400 * 1.05) / 4, 2);
  });
});

describe("consumo de estoque", () => {
  test("pedido usa primeiro o estoque pronto e o resto sai dos insumos (proporcional às peças na mesa)", () => {
    const p = product(1, { stock: 2, piecesPerPlate: 2, composition: { filaments: [{ filamentId: 1, grams: 100 }], materials: [{ materialId: 1, qty: 2 }], items: [] } });
    const plan = planConsumption(1, 5, ctx([p]), { useOwnStock: true });
    expect(plan.products).toEqual({ 1: 2 });
    expect(plan.filaments).toEqual({ 1: 150 }); // 3 peças × 50 g
    expect(plan.materials).toEqual({ 1: 3 });
  });

  test("produzir não tira do próprio estoque, só dos insumos", () => {
    const p = product(1, { stock: 10, composition: { filaments: [{ filamentId: 1, grams: 30 }], materials: [], items: [] } });
    const plan = planConsumption(1, 4, ctx([p]), { useOwnStock: false });
    expect(plan.products).toEqual({});
    expect(plan.filaments).toEqual({ 1: 120 });
  });

  test("kit consome o estoque dos componentes e fabrica o que faltar", () => {
    const a = product(1, { stock: 1, composition: { filaments: [{ filamentId: 1, grams: 10 }], materials: [], items: [] } });
    const b = product(2, { stock: 0, composition: { filaments: [{ filamentId: 1, grams: 20 }], materials: [], items: [] } });
    const kit = product(3, { kind: "kit", composition: { filaments: [], materials: [{ materialId: 1, qty: 1 }], items: [{ productId: 1, qty: 2 }, { productId: 2, qty: 1 }] } });
    const plan = planConsumption(3, 1, ctx([a, b, kit]), { useOwnStock: true });
    expect(plan.products).toEqual({ 1: 1 });
    expect(plan.filaments).toEqual({ 1: 10 + 20 });
    expect(plan.materials).toEqual({ 1: 1 });
  });
});
