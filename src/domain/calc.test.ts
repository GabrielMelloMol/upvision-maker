import { describe, expect, test } from "vitest";
import { calculate, type CalcInput } from "./calc";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

const settings: Settings = { ...DEFAULT_SETTINGS, kwhPrice: 0.9, laborHourCost: 20, maintenancePct: 5 };

const empty: CalcInput = {
  filaments: [],
  extras: [],
  printerWatts: 0,
  printHours: 0,
  laborHours: 0,
  quantity: 1,
  freight: 0,
  marketplaceMarginPct: 30,
};

describe("calculate", () => {
  test("exemplo da home: luminária PLA 120 g a R$ 85/kg + embalagem R$ 5, manutenção 5%", () => {
    const r = calculate(
      { ...empty, filaments: [{ pricePerKg: 85, grams: 120 }], extras: [{ unitPrice: 5, qty: 1 }] },
      settings,
    );
    expect(r.filament).toBe(10.2);
    expect(r.extras).toBe(5);
    expect(r.unitCost).toBe(15.96);
    expect(r.resale).toBe(47.88);
    expect(r.consumer).toBe(79.8);
    expect(r.consumerProfit).toBe(63.84);
  });

  test("soma vários filamentos, energia e mão de obra antes da manutenção", () => {
    const r = calculate(
      {
        ...empty,
        filaments: [
          { pricePerKg: 100, grams: 50 }, // 5,00
          { pricePerKg: 120, grams: 25 }, // 3,00
        ],
        printerWatts: 200, // 0,2 kW × 5 h × 0,90 = 0,90
        printHours: 5,
        laborHours: 0.5, // 10,00
      },
      settings,
    );
    expect(r.filament).toBe(8);
    expect(r.energy).toBe(0.9);
    expect(r.labor).toBe(10);
    expect(r.maintenance).toBe(0.95); // 18,90 × 5%
    expect(r.unitCost).toBe(19.85);
  });

  test("divide o custo da mesa pela quantidade de objetos", () => {
    const r = calculate({ ...empty, filaments: [{ pricePerKg: 100, grams: 400 }], quantity: 4 }, settings);
    expect(r.batchCost).toBe(42);
    expect(r.unitCost).toBe(10.5);
  });

  test("frete é somado depois do multiplicador, sem ser multiplicado", () => {
    const r = calculate(
      { ...empty, filaments: [{ pricePerKg: 100, grams: 100 }], freight: 7 },
      { ...settings, maintenancePct: 0 },
    );
    expect(r.resale).toBe(37); // 10 × 3 + 7
    expect(r.consumer).toBe(57); // 10 × 5 + 7
  });

  test("preço de marketplace cobre taxa %, taxa fixa, frete e a margem pedida", () => {
    const r = calculate(
      { ...empty, filaments: [{ pricePerKg: 100, grams: 100 }], marketplaceMarginPct: 30 },
      { ...settings, maintenancePct: 0, channels: [{ name: "Loja X", feePct: 20, feeFixed: 4 }] },
    );
    // (10 + 4) / (1 − 0,20 − 0,30) = 28
    const ch = r.channels[0];
    expect(ch.price).toBe(28);
    expect(ch.fees).toBe(9.6); // 5,60 + 4
    expect(ch.profit).toBe(8.4);
    expect(ch.marginPct).toBe(30);
  });

  test("canal impossível (taxa + margem ≥ 100%) retorna preço nulo", () => {
    const r = calculate(
      { ...empty, filaments: [{ pricePerKg: 100, grams: 100 }], marketplaceMarginPct: 90 },
      { ...settings, channels: [{ name: "Caro", feePct: 20, feeFixed: 0 }] },
    );
    expect(r.channels[0].price).toBeNull();
  });

  test("valores negativos ou inválidos contam como zero e quantidade mínima é 1", () => {
    const r = calculate(
      { ...empty, filaments: [{ pricePerKg: -50, grams: 100 }], extras: [{ unitPrice: 5, qty: -2 }], quantity: 0 },
      settings,
    );
    expect(r.unitCost).toBe(0);
  });
});
