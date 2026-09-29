import { describe, expect, test } from "vitest";
import { calculate, channelFees, failureFor, machineHourCost, type CalcInput } from "./calc";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

// Casos antigos: manutenção 5% e sem taxa de falha, para isolar cada parcela.
const settings: Settings = { ...DEFAULT_SETTINGS, kwhPrice: 0.9, laborHourCost: 20, maintenancePct: 5, failurePct: 0 };

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
  test("exemplo da home com os padrões: falha 5% sobre o filamento, sem manutenção", () => {
    const r = calculate({ ...empty, filaments: [{ pricePerKg: 85, grams: 120 }], extras: [{ unitPrice: 5, qty: 1 }] }, DEFAULT_SETTINGS);
    expect(r.failure).toBe(0.54); // 10,20 ÷ 0,95 − 10,20
    expect(r.maintenance).toBe(0);
    expect(r.unitCost).toBe(15.74);
    expect(r.resale).toBe(47.21);
    expect(r.consumer).toBe(78.68);
  });

  test("exemplo antigo da home: luminária PLA 120 g a R$ 85/kg + embalagem R$ 5, manutenção 5%", () => {
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

  test("máquina: A1 de R$ 3.000 com 5000 h custa R$ 0,60/h; 2,5 h = R$ 1,50 e a manutenção % deixa de valer", () => {
    const perHour = machineHourCost({ price: 3000, lifeHours: 5000, upkeepPerHour: 0 });
    expect(perHour).toBe(0.6);
    const r = calculate({ ...empty, filaments: [{ pricePerKg: 120, grams: 50 }], printerWatts: 110, printHours: 2.5, machinePerHour: perHour }, settings);
    expect(r.machine).toBe(1.5);
    expect(r.energy).toBe(0.25); // 0,11 kW × 2,5 h × 0,90
    expect(r.maintenance).toBe(0);
    expect(r.unitCost).toBe(7.75); // 6 + 0,25 + 1,50
  });

  test("custo de máquina soma o desgaste por hora; vida útil 0 não divide por zero", () => {
    expect(machineHourCost({ price: 3000, lifeHours: 5000, upkeepPerHour: 0.2 })).toBe(0.8);
    expect(machineHourCost({ price: 3000, lifeHours: 0, upkeepPerHour: 0.2 })).toBe(0.2);
  });

  test("falha 10%: (filamento + energia + máquina) ÷ 0,9 − esse valor; mão de obra e extras ficam fora", () => {
    const r = calculate(
      { ...empty, filaments: [{ pricePerKg: 120, grams: 50 }], extras: [{ unitPrice: 5, qty: 1 }], printerWatts: 110, printHours: 2.5, laborHours: 0.5, machinePerHour: 0.6 },
      { ...settings, failurePct: 10 },
    );
    // base 6 + 0,25 + 1,50 = 7,75 → 7,75 ÷ 0,9 − 7,75 = 0,861
    expect(r.failure).toBe(0.86);
    expect(r.unitCost).toBe(23.61); // 7,75 + 0,861 + 5 + 10 (mão de obra)
  });

  test("mão de obra entra depois do multiplicador (e pode voltar ao jeito antigo)", () => {
    const input = { ...empty, filaments: [{ pricePerKg: 100, grams: 100 }], laborHours: 0.5 }; // 10 + 10
    const r = calculate(input, { ...settings, maintenancePct: 0 });
    expect(r.consumer).toBe(60); // 10 × 5 + 10
    expect(r.resale).toBe(40); // 10 × 3 + 10
    const old = calculate(input, { ...settings, maintenancePct: 0, multiplyLabor: true });
    expect(old.consumer).toBe(100); // 20 × 5
  });

  test("custos fixos por hora entram no custo e somam depois do multiplicador", () => {
    const r = calculate({ ...empty, filaments: [{ pricePerKg: 100, grams: 100 }], printHours: 2, fixedPerHour: 1.5 }, { ...settings, maintenancePct: 0 });
    expect(r.fixed).toBe(3);
    expect(r.unitCost).toBe(13);
    expect(r.consumer).toBe(53); // 10 × 5 + 3
  });

  test("impostos entram no denominador dos canais e saem do lucro direto/revenda", () => {
    const r = calculate(
      { ...empty, filaments: [{ pricePerKg: 100, grams: 100 }], marketplaceMarginPct: 30 },
      { ...settings, maintenancePct: 0, taxPct: 6, channels: [{ name: "Loja X", feePct: 20, feeFixed: 4 }] },
    );
    // (10 + 4) ÷ (1 − 0,20 − 0,06 − 0,30) = 31,82
    const ch = r.channels[0];
    expect(ch.price).toBe(31.82);
    expect(ch.fees).toBe(12.27); // 31,82 × 26% + 4
    expect(ch.marginPct).toBe(30);
    expect(r.consumerProfit).toBe(37); // 50 − 3 (6%) − 10
  });

  test("custo por grama e por hora de impressão da mesa", () => {
    const r = calculate({ ...empty, filaments: [{ pricePerKg: 100, grams: 200 }], printHours: 4, quantity: 2 }, { ...settings, maintenancePct: 0 });
    expect(r.perGram).toBe(0.1);
    expect(r.perHour).toBe(5);
    const none = calculate(empty, settings);
    expect(none.perGram).toBeNull();
    expect(none.perHour).toBeNull();
  });

  test("kWh medido desta impressão substitui W × horas", () => {
    const r = calculate({ ...empty, printerWatts: 200, printHours: 5, energyKwh: 0.3 }, settings);
    expect(r.energy).toBe(0.27); // 0,3 kWh × 0,90
  });
});

describe("taxas de canal por faixa de preço (#31)", () => {
  const base = { ...settings, maintenancePct: 0 };
  const cost10 = { ...empty, filaments: [{ pricePerKg: 100, grams: 100 }], marketplaceMarginPct: 30 }; // custo R$ 10

  test("taxas num preço: fixa só abaixo do limite, teto da comissão, frete obrigatório acima do limite, imposto à parte", () => {
    const ch = { name: "X", feePct: 20, feeFixed: 5, fixedBelow: 80, feeCapPerItem: 30, freeShippingAbove: 80, shippingCost: 20 };
    expect(channelFees(ch, 50, 0)).toBe(15); // 10 + 5
    expect(channelFees(ch, 100, 0)).toBe(40); // 20 + frete 20, sem fixa
    expect(channelFees(ch, 200, 6)).toBe(62); // teto 30 + frete 20 + imposto 12
    expect(channelFees({ name: "Y", feePct: 10, feeFixed: 2 }, 50, 0)).toBe(7); // sem faixas: igual a antes
  });

  test("taxa fixa só abaixo de R$ X: fica com o menor preço coerente com a própria faixa", () => {
    // abaixo de 30: (10 + 5) ÷ (1 − 0,2 − 0,3) = 30 → não é < 30; acima: 10 ÷ 0,5 = 20 → não é ≥ 30.
    // Nenhuma faixa fecha sozinha: o preço fica no limite (30), onde a fixa já não vale.
    const r = calculate(cost10, { ...base, channels: [{ name: "X", feePct: 20, feeFixed: 5, fixedBelow: 30 }] });
    expect(r.channels[0]).toMatchObject({ price: 30, fees: 6, profit: 14, shippingIncluded: false });
    const cheap = calculate(cost10, { ...base, channels: [{ name: "X", feePct: 20, feeFixed: 5, fixedBelow: 50 }] });
    expect(cheap.channels[0]).toMatchObject({ price: 30, fees: 11, profit: 9, marginPct: 30 }); // (10 + 5) ÷ 0,5 = 30 < 50
  });

  test("frete obrigatório acima de R$ Y entra no preço e é sinalizado", () => {
    // sem frete: 10 ÷ 0,5 = 20 < 25 ok → 20. Com custo maior, 60 ÷ 0,5 = 120 ≥ 100 → (60 + 20) ÷ 0,5 = 160
    const ch = { name: "ML", feePct: 20, feeFixed: 0, freeShippingAbove: 100, shippingCost: 20 };
    const low = calculate(cost10, { ...base, channels: [ch] });
    expect(low.channels[0]).toMatchObject({ price: 20, shippingIncluded: false });
    const high = calculate({ ...cost10, filaments: [{ pricePerKg: 100, grams: 600 }] }, { ...base, channels: [ch] });
    expect(high.channels[0]).toMatchObject({ price: 160, fees: 52, profit: 48, marginPct: 30, shippingIncluded: true });
  });

  test("teto da comissão em R$ baixa o preço de peças caras", () => {
    // sem teto: 200 ÷ 0,5 = 400 (comissão 80). Teto 30: (200 + 30) ÷ (1 − 0,3) = 328,57, comissão travada em 30
    const r = calculate({ ...cost10, filaments: [{ pricePerKg: 100, grams: 2000 }] }, { ...base, channels: [{ name: "X", feePct: 20, feeFixed: 0, feeCapPerItem: 30 }] });
    expect(r.channels[0]).toMatchObject({ price: 328.57, fees: 30, marginPct: 30 });
  });
});

test("custo extra por venda só daquele canal (#33): entra nas taxas e no preço", () => {
  const r = calculate(
    { ...empty, filaments: [{ pricePerKg: 100, grams: 100 }], marketplaceMarginPct: 30 },
    { ...settings, maintenancePct: 0, channels: [{ name: "Loja X", feePct: 20, feeFixed: 4, extraPerSale: 3 }] },
  );
  expect(r.channels[0]).toMatchObject({ price: 34, fees: 13.8, profit: 10.2, marginPct: 30 }); // (10 + 4 + 3) ÷ 0,5
  expect(r.consumer).toBe(50); // venda direta não paga a embalagem do marketplace
});

describe("taxa de falha por material ou por produto (#35)", () => {
  const st = { ...settings, failurePct: 5, failureByMaterial: { TPU: 12, ABS: 10 } };
  test("vale a maior entre os materiais da mesa; sem nenhum definido, a geral; a do produto manda", () => {
    expect(failureFor(["PLA", "TPU", "ABS"], st)).toEqual({ pct: 12, source: "TPU" });
    expect(failureFor(["PLA"], st)).toEqual({ pct: 5 });
    expect(failureFor([], st)).toEqual({ pct: 5 });
    expect(failureFor(["TPU"], st, 3)).toEqual({ pct: 3, source: "produto" });
    expect(failureFor(["TPU"], st, null)).toEqual({ pct: 12, source: "TPU" });
  });

  test("calculate usa a taxa informada no lugar da geral", () => {
    const r = calculate({ ...empty, filaments: [{ pricePerKg: 100, grams: 88 }], failurePct: 12 }, { ...st, maintenancePct: 0 });
    expect(r.failure).toBe(1.2); // 8,80 ÷ 0,88 − 8,80
  });
});
