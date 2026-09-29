import { z } from "zod";

const Line = z.object({ ref: z.string(), price: z.string(), qty: z.string() });
export type Line = z.infer<typeof Line>;

export const EMPTY_FORM = { watts: "", time: "", labor: "", quantity: "1", freight: "", margin: "", kwh: "", name: "", prepTime: "", prepFixed: "" };
export type CalcForm = typeof EMPTY_FORM;

const Saved = z.object({
  mode: z.enum(["quick", "full"]),
  fil: z.array(Line),
  ext: z.array(Line),
  printerId: z.string(),
  f: z.record(z.string(), z.string()),
});
export type Saved = { mode: "quick" | "full"; fil: Line[]; ext: Line[]; printerId: string; f: CalcForm };

const KEY = "upvision:calculadora";

/** Formulário guardado (JSON) → estado da calculadora; null se vier estragado. Campos novos ganham o padrão. */
export function parseSaved(json: string | null): Saved | null {
  try {
    const v = Saved.safeParse(JSON.parse(json ?? "null"));
    return v.success ? { ...v.data, f: { ...EMPTY_FORM, ...v.data.f } } : null;
  } catch {
    return null;
  }
}

/** Último cálculo (só conveniência deste computador): some sem erro se o armazenamento falhar ou vier estragado. */
export function loadSaved(): Saved | null {
  try {
    return parseSaved(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function storeSaved(s: Saved | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // modo privado/armazenamento bloqueado: só não lembra
  }
}
