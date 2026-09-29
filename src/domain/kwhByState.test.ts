import { expect, test } from "vitest";
import { KWH_BY_STATE, stateKwhPrice, STATES } from "./kwhByState";

test("27 UFs, cada uma com distribuidora, tarifa plausível e ICMS de 17 a 23 % (#39)", () => {
  expect(STATES).toHaveLength(27);
  for (const uf of STATES) {
    const r = KWH_BY_STATE[uf];
    expect(r.distributor).not.toBe("");
    expect(r.tariff).toBeGreaterThan(0.5);
    expect(r.tariff).toBeLessThan(1.2);
    expect(r.icmsPct).toBeGreaterThanOrEqual(17);
    expect(r.icmsPct).toBeLessThanOrEqual(23);
  }
});

test("imposto por dentro: SP (Enel SP 0,7894, ICMS 18 % + 3 %) ≈ R$ 1,00", () => {
  expect(stateKwhPrice("SP")).toBe(1);
  expect(stateKwhPrice("XX")).toBeNull();
});
