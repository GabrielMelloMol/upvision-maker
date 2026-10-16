import { describe, expect, it } from "vitest";
import { calculate } from "./calc";
import { exampleParts, exampleResult, EXAMPLE_SETTINGS, priceSteps } from "./priceExample";

describe("exemplo da página Como calculamos o preço (#216)", () => {
  it("as linhas do custo somam o custo da mesa", () => {
    const r = exampleResult();
    expect(exampleParts()).toBe(r.batchCost);
    expect(r.unitCost).toBe(Math.round((r.batchCost / 4) * 100) / 100);
  });

  it("cada passo mostra o valor que a Calculadora calcula", () => {
    const r = exampleResult();
    const by = Object.fromEntries(priceSteps().map((s) => [s.id, s]));
    expect(by.filament.value).toBe(r.filament);
    expect(by.energy.value).toBe(r.energy);
    expect(by.failure.value).toBe(r.failure);
    expect(by.unit.value).toBe(r.unitCost);
    expect(by.multiplier.value).toBe(r.consumer);
    expect(by.channel.value).toBe(r.channels[0].price);
  });

  it("números conhecidos: 72 g a R$ 120/kg = R$ 8,64; 0,6 kWh × R$ 0,90 = R$ 0,54; falha = 5% do que se perde", () => {
    const r = exampleResult();
    expect(r.filament).toBe(8.64);
    expect(r.energy).toBe(0.54);
    expect(r.machine).toBe(2.4);
    expect(r.labor).toBe(10);
    const lost = r.filament + r.energy + r.machine;
    expect(r.failure).toBeCloseTo(lost / 0.95 - lost, 2);
  });

  it("o preço do canal deixa a margem pedida depois das taxas e do imposto", () => {
    const c = exampleResult().channels[0];
    expect(c.marginPct).toBeCloseTo(30, 0);
  });

  it("usa os mesmos multiplicadores do exemplo nas duas frases", () => {
    const m = priceSteps().find((s) => s.id === "multiplier")!;
    expect(m.sum).toContain(`× ${EXAMPLE_SETTINGS.multResale}`);
    expect(m.sum).toContain(`× ${EXAMPLE_SETTINGS.multConsumer}`);
    expect(calculate).toBeTypeOf("function");
  });
});
