import { describe, expect, test } from "vitest";
import { z } from "zod";
import { fieldErrors } from "./fieldErrors";

const errorsOf = (schema: z.ZodType, v: unknown) => {
  const r = schema.safeParse(v);
  return fieldErrors(r.error);
};

describe("fieldErrors", () => {
  const S = z.object({
    name: z.string().trim().min(1),
    watts: z.number().min(0),
    spool: z.number().positive(),
    pct: z.number().max(100),
    unit: z.string().max(3),
  });

  test("traduz as mensagens do Zod para português, por campo", () => {
    expect(errorsOf(S, { name: " ", watts: NaN, spool: 0, pct: 120, unit: "caixas" })).toEqual({
      name: "Obrigatório.",
      watts: "Digite um número.",
      spool: "Precisa ser maior que 0.",
      pct: "No máximo 100.",
      unit: "No máximo 3 caracteres.",
    });
  });

  test("número negativo e mínimo diferente de zero", () => {
    expect(errorsOf(z.object({ a: z.number().min(0), b: z.number().min(5) }), { a: -1, b: 2 })).toEqual({
      a: "Não pode ser negativo.",
      b: "No mínimo 5.",
    });
  });

  test("erro comum vai em _", () => {
    expect(fieldErrors(new Error("falhou"))).toEqual({ _: "falhou" });
  });
});

test("mensagens próprias (refine/transform) chegam intactas", () => {
  const schema = z.object({ doc: z.string().refine(() => false, "CPF inválido: confira os números.") });
  const r = schema.safeParse({ doc: "1" });
  expect(fieldErrors(r.error)).toEqual({ doc: "CPF inválido: confira os números." });
});
