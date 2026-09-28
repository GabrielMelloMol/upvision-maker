import { z } from "zod";

const num = (n: unknown) => Number(n).toLocaleString("pt-BR");

/** Mensagem em português a partir do código do Zod (as padrão vêm em inglês). */
function message(i: z.core.$ZodIssue): string {
  const isText = "origin" in i && i.origin === "string";
  switch (i.code) {
    case "invalid_type":
      return i.expected === "number" ? "Digite um número." : "Obrigatório.";
    case "too_small":
      if (isText) return Number(i.minimum) <= 1 ? "Obrigatório." : `No mínimo ${num(i.minimum)} caracteres.`;
      if (Number(i.minimum) === 0) return i.inclusive ? "Não pode ser negativo." : "Precisa ser maior que 0.";
      return `No mínimo ${num(i.minimum)}.`;
    case "too_big":
      return isText ? `No máximo ${num(i.maximum)} caracteres.` : `No máximo ${num(i.maximum)}.`;
    default:
      return "Valor inválido.";
  }
}

/** Converte erro do Zod em { campo: mensagem }; outros erros vão em "_". */
export function fieldErrors(e: unknown): Record<string, string> {
  if (e instanceof z.ZodError) {
    return Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? "_"), message(i)]));
  }
  return { _: e instanceof Error ? e.message : String(e) };
}
