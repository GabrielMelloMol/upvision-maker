import { CATALOG } from "../geometry/fontCatalog";
import type { FieldDef, Section } from "../tools/models/fields";
import type { ScadParam, ScadValue } from "./customizer";

/** Parâmetros do Customizer (#96) → campos do formulário dos Modelos prontos (ParamField), e de volta. */
type FormValue = string | number | boolean;

const WIDE = 1e6; // número sem limites no .scad: o campo aceita qualquer valor razoável
const fontId = (family: string) => CATALOG.find((f) => f.family.toLowerCase() === family.toLowerCase() || f.internal?.toLowerCase() === family.toLowerCase())?.id;

export function toField(p: ScadParam): FieldDef {
  const base = { k: p.name, label: p.label };
  switch (p.kind) {
    case "num":
      return { ...base, kind: "num", min: p.min ?? -WIDE, max: p.max ?? WIDE, step: p.step };
    case "choice":
      return { ...base, kind: "choice", options: p.options.map(([v, l]) => [String(v), l] as const) };
    case "bool":
      return { ...base, kind: "bool" };
    case "color":
      return { ...base, kind: "color" };
    case "font":
      // fonte fora do catálogo: fica como texto (o OpenSCAD usa a padrão se não achar)
      return fontId(p.value) ? { ...base, kind: "font" } : { ...base, kind: "text", max: 60, hint: "Fonte fora do catálogo do app." };
    case "vector":
      return { ...base, kind: "text", max: 200, hint: "Números separados por vírgula." };
    case "text":
      return { ...base, kind: "text", max: p.maxLength ?? 200 };
  }
}

export const toSections = (params: ScadParam[]): Section[] =>
  [...new Set(params.map((p) => p.tab))].map((tab) => ({ title: tab, fields: params.filter((p) => p.tab === tab).map(toField) }));

export function toFormValue(p: ScadParam, v: ScadValue): FormValue {
  if (Array.isArray(v)) return v.join(", ");
  if (p.kind === "font") return fontId(String(v)) ?? String(v);
  if (p.kind === "choice") return String(v);
  return v;
}

/** Valor do formulário → valor do OpenSCAD; null se inválido (vetor com texto, cor sem #). */
export function fromFormValue(p: ScadParam, v: FormValue): ScadValue | null {
  switch (p.kind) {
    case "vector": {
      const nums = String(v).split(",").map((x) => x.trim()).filter(Boolean).map(Number);
      return nums.length && nums.every(Number.isFinite) ? nums : null;
    }
    case "font":
      return CATALOG.find((f) => f.id === v)?.family ?? String(v);
    case "choice":
      return p.options.find(([o]) => String(o) === String(v))?.[0] ?? null;
    case "num":
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    case "color":
      return /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : null;
    default:
      return v;
  }
}
