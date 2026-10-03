import { describe, expect, test } from "vitest";
import { parseDecimal, readNumber } from "./format";

test("parseDecimal aceita vírgula ou ponto e rejeita lixo", () => {
  expect(parseDecimal("85,50")).toBe(85.5);
  expect(parseDecimal("1.5")).toBe(1.5);
  expect(parseDecimal(" 12 ")).toBe(12);
  expect(parseDecimal("")).toBeNaN();
  expect(parseDecimal("abc")).toBeNaN();
});

describe("readNumber: o número como se escreve no Brasil (A5, M9, M12, B10)", () => {
  test.each([
    ["1200", 1200],
    ["1,2", 1.2],
    ["1.234,56", 1234.56],
    ["1.200,5", 1200.5], // A5: virava NaN e depois 0 g
    ["1.234.567", 1234567],
    ["0.856", 0.856], // M9: virava R$ 856
    ["0,856", 0.856],
    ["1.5", 1.5],
    ["1200.5", 1200.5],
    ["1,234.56", 1234.56], // americano completo
    ["-3,5", -3.5],
    [" 1 200 ", 1200],
    [",5", 0.5],
  ])("%s → %s", (text, value) => {
    expect(readNumber(text).value).toBeCloseTo(value, 9);
    expect(readNumber(text).ambiguous).toBe(false);
  });

  test("ponto com 3 dígitos é milhar, mas avisa e guarda a outra leitura", () => {
    expect(readNumber("1.200")).toEqual({ value: 1200, ambiguous: true, alt: 1.2 }); // A5: Calculadora lia 1,2 g
    expect(readNumber("1.250")).toEqual({ value: 1250, ambiguous: true, alt: 1.25 }); // M12: baixa no celular
  });

  test("vírgula com 3 dígitos é decimal, mas pode ser o milhar americano", () => {
    expect(readNumber("1,500")).toEqual({ value: 1.5, ambiguous: true, alt: 1500 });
    expect(readNumber("0,500").ambiguous).toBe(false); // milhar não começa com 0
  });

  test("lixo e formatos impossíveis viram NaN", () => {
    for (const s of ["", "abc", "1.2.3", "1,2,3,4.5", "12.34.567", "1.", "1,", "10%", "15 reais", "1..2"]) expect(readNumber(s).value).toBeNaN();
  });

  test("parseDecimal usa a mesma leitura", () => {
    expect(parseDecimal("1.200")).toBe(1200);
    expect(parseDecimal("1.200,5")).toBe(1200.5);
    expect(parseDecimal("0.856")).toBe(0.856);
  });
});
