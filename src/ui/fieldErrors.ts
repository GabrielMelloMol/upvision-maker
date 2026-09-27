import { z } from "zod";

/** Converte erro do Zod em { campo: mensagem }; outros erros vão em "_". */
export function fieldErrors(e: unknown): Record<string, string> {
  if (e instanceof z.ZodError) {
    return Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? "_"), i.message]));
  }
  return { _: e instanceof Error ? e.message : String(e) };
}
