import type { z } from "zod";
import { logError } from "../diagnostics/log";

/**
 * Lê um JSON guardado no banco (preferências, dados da empresa) aproveitando o que ainda vale (A3).
 * Se o objeto inteiro passa no esquema, é ele. Se algum campo ficou inválido (regra mais rígida, versão nova,
 * backup antigo), só esse campo volta ao padrão e o resto é mantido, em vez de tudo virar o padrão e o próximo
 * "Salvar" gravar o padrão por cima. Os campos descartados vão para o registro de diagnóstico.
 */
export function salvage<S extends z.ZodObject>(what: string, schema: S, defaults: z.output<S>, text: string): z.output<S> {
  let stored: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch (e) {
    logError(what, new Error(`Dados ilegíveis no banco, usando o padrão: ${e instanceof Error ? e.message : String(e)}`), "warn");
    return defaults;
  }
  const whole = schema.safeParse({ ...defaults, ...stored });
  if (whole.success) return whole.data;
  const dropped: string[] = [];
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, field] of Object.entries(schema.shape)) {
    if (!(key in stored)) continue;
    if ((field as z.ZodType).safeParse(stored[key]).success) merged[key] = stored[key];
    else dropped.push(key);
  }
  logError(what, new Error(`Campos inválidos voltaram ao padrão: ${dropped.join(", ") || "(esquema)"}`), "warn");
  const retry = schema.safeParse(merged);
  return retry.success ? retry.data : defaults;
}
