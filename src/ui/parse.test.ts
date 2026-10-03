import { describe, expect, test } from "vitest";
import { formatDuration, numberNote, formatMass, formatMoneyInput, parseDuration, parseMass, parseMoney } from "./parse";

describe("parseDuration (minutos)", () => {
  test.each([
    ["3h20", 200],
    ["3h 20min", 200],
    ["3 h 20 m", 200],
    ["3:20", 200],
    ["03:05", 185],
    ["200 min", 200],
    ["200min", 200],
    ["45m", 45],
    ["2h", 120],
    ["1,5 h", 90],
    ["1.5h", 90],
    ["3", 180], // número solto = horas
    ["1d 2h", 1560],
    ["", NaN],
    ["abc", NaN],
    ["3h70", NaN], // minutos de 0 a 59 quando vem depois de horas
    ["-2h", NaN],
  ])("%s → %s", (s, min) => {
    expect(parseDuration(s)).toBe(min);
  });

  test("número solto em minutos quando pedido (mão de obra)", () => {
    expect(parseDuration("15", "min")).toBe(15);
    expect(parseDuration("1h", "min")).toBe(60);
  });

  test("formatDuration é o inverso legível", () => {
    expect(formatDuration(200)).toBe("3h20");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(0)).toBe("0 min");
    expect(parseDuration(formatDuration(1234))).toBe(1234);
  });
});

describe("parseMass (gramas)", () => {
  test.each([
    ["850", 850],
    ["850 g", 850],
    ["850g", 850],
    ["1,2 kg", 1200],
    ["2 rolos", 2000],
    ["1 rolo", 1000],
    ["1,5 rolo", 1500],
    ["2r", 2000],
    ["1.500", 1500], // milhar pt-BR
    ["", NaN],
    ["dois", NaN],
  ])("%s → %s (rolo de 1 kg)", (s, g) => {
    expect(parseMass(s, 1000)).toBe(g);
  });

  test("rolo usa o peso do rolo cadastrado", () => {
    expect(parseMass("2 rolos", 750)).toBe(1500);
  });

  test("formatMass", () => {
    expect(formatMass(2000)).toBe("2.000 g");
    expect(formatMass(1500, 1000)).toBe("1.500 g (1,5 rolo)");
    expect(formatMass(2000, 1000)).toBe("2.000 g (2 rolos)");
  });
});

describe("parseMoney", () => {
  test.each([
    ["15,90", 15.9],
    ["R$ 15,90", 15.9],
    ["r$15", 15],
    ["1.234,56", 1234.56],
    ["1234.56", 1234.56],
    ["15.9", 15.9],
    ["0,35", 0.35],
    ["", NaN],
    ["abc", NaN],
  ])("%s → %s", (s, v) => {
    expect(parseMoney(s)).toBe(v);
  });

  test("formatMoneyInput formata para edição (sem R$, 2 casas)", () => {
    expect(formatMoneyInput("15,9")).toBe("15,90");
    expect(formatMoneyInput("1234.5")).toBe("1.234,50");
    expect(formatMoneyInput("abc")).toBe("abc"); // não esconde o que foi digitado
    expect(formatMoneyInput("")).toBe("");
  });
});

describe("mesma leitura de número em todos os campos (M9, M12)", () => {
  test("dinheiro com 3 casas não vira mil: 0.856 é R$ 0,856 (preço do kWh)", () => {
    expect(parseMoney("0.856")).toBe(0.856);
    expect(parseMoney("0.500")).toBe(0.5);
  });
  test("massa com ponto de milhar: 1.250 g é mil duzentos e cinquenta gramas", () => {
    expect(parseMass("1.250", 1000)).toBe(1250);
    expect(parseMass("1.200,5", 1000)).toBe(1201);
  });
  test("aviso quando dá para ler de dois jeitos", () => {
    expect(numberNote("1.200")).toBe('Entendi "1.200" como 1.200. Se era 1,2, escreva 1,2.');
    expect(numberNote("1,500 kg")).toBe('Entendi "1,500" como 1,5. Se era 1.500, escreva 1500.');
    expect(numberNote("1.200,5")).toBeUndefined();
    expect(numberNote("850")).toBeUndefined();
  });
});
