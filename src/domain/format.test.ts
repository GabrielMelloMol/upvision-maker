import { expect, test } from "vitest";
import { parseDecimal } from "./format";

test("parseDecimal aceita vírgula ou ponto e rejeita lixo", () => {
  expect(parseDecimal("85,50")).toBe(85.5);
  expect(parseDecimal("1.5")).toBe(1.5);
  expect(parseDecimal(" 12 ")).toBe(12);
  expect(parseDecimal("")).toBeNaN();
  expect(parseDecimal("abc")).toBeNaN();
});
