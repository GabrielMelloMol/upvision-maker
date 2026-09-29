import { expect, test } from "vitest";
import { addKwhHistory, BILL_FLAGS, kwhFromBill, kwhWarning, plugWatts, type KwhEntry } from "./energy";

test("preço do kWh = total ÷ kWh, somando o adicional da bandeira (ANEEL)", () => {
  expect(kwhFromBill(276, 300, "verde")).toBe(0.92);
  expect(kwhFromBill(276, 300, "amarela")).toBe(0.94); // +0,01885
  expect(kwhFromBill(276, 300, "vermelha1")).toBe(0.96); // +0,04463
  expect(kwhFromBill(276, 300, "vermelha2")).toBe(1); // +0,07877
  expect(BILL_FLAGS.map((f) => f.label)).toEqual(["Verde", "Amarela", "Vermelha 1", "Vermelha 2"]);
});

test("sem números válidos não calcula", () => {
  expect(kwhFromBill(276, 0, "verde")).toBeNull();
  expect(kwhFromBill(0, 300, "verde")).toBeNull();
  expect(kwhFromBill(NaN, 300, "verde")).toBeNull();
});

test("aviso quando o resultado foge do normal no Brasil (provável troca de campos)", () => {
  expect(kwhWarning(0.92)).toBeNull();
  expect(kwhWarning(0.05)).toMatch(/Confira/);
  expect(kwhWarning(12)).toMatch(/Confira/);
});

test("histórico: mais recente primeiro, substitui o mesmo mês, guarda 12", () => {
  const e = (month: string, price: number): KwhEntry => ({ month, total: 100, kwh: 100, flag: "verde", price });
  let h: KwhEntry[] = [];
  for (let m = 1; m <= 13; m++) h = addKwhHistory(h, e(`2026-${String(m).padStart(2, "0")}`, m));
  expect(h).toHaveLength(12);
  expect(h[0].month).toBe("2026-13");
  h = addKwhHistory(h, e("2026-13", 99));
  expect(h).toHaveLength(12);
  expect(h[0].price).toBe(99);
});

test("tomada medidora: W médio = (kWh fim − início) ÷ horas × 1000", () => {
  expect(plugWatts({ startKwh: 52.16, endKwh: 52.46, hours: 3 })).toEqual({ watts: 100, warnings: [] });
});

test("tomada medidora: avisa impressão curta, valor longe do catálogo e leitura impossível", () => {
  expect(plugWatts({ startKwh: 10, endKwh: 10.1, hours: 0.5 }).warnings).toEqual([expect.stringMatching(/menos de 1 hora/)]);
  expect(plugWatts({ startKwh: 10, endKwh: 10.6, hours: 2 }, 95).warnings).toEqual([expect.stringMatching(/catálogo.*95 W/)]);
  expect(plugWatts({ startKwh: 10, endKwh: 10.2, hours: 2 }, 95).warnings).toEqual([]); // 100 W, perto de 95
  expect(plugWatts({ startKwh: 10, endKwh: 9, hours: 2 }).watts).toBeNull();
  expect(plugWatts({ startKwh: 10, endKwh: 11, hours: 0 }).watts).toBeNull();
});
