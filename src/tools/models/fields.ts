import type { LucideIcon } from "lucide-react";
import type { ModelCtx, ModelOutput } from "../../geometry/models/common";

export type Params = Record<string, string | number | boolean>;

export type FieldDef =
  | { k: string; kind: "num"; label: string; min: number; max: number; step?: number; unit?: string; hint?: string }
  | { k: string; kind: "text"; label: string; max?: number; hint?: string }
  | { k: string; kind: "money"; label: string; hint?: string }
  | { k: string; kind: "color"; label: string }
  | { k: string; kind: "bool"; label: string }
  | { k: string; kind: "choice"; label: string; options: readonly (readonly [string, string])[] };

export type Section = { title: string; fields: FieldDef[] };

export const CATEGORIES = [
  ["keychains", "Chaveiros"],
  ["plates", "Placas"],
  ["party", "Festa e esporte"],
  ["home", "Casa"],
  ["kitchen", "Cozinha"],
] as const;
export type Category = (typeof CATEGORIES)[number][0];

export type ModelDef = {
  id: string;
  category: Category;
  label: string;
  blurb: string;
  icon: LucideIcon;
  defaults: Params;
  sections: Section[];
  /** Aceita desenho enviado (SVG/imagem). */
  art?: string;
  /** Tem texto: mostra o seletor de fonte (na seção `fontSection`, padrão 0). */
  font?: boolean;
  fontSection?: number;
  build: (ctx: ModelCtx, p: Params) => ModelOutput;
};

// cada build recebe os parâmetros do formulário com os tipos do modelo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const as = <T,>(p: Params) => p as any as T;
export const num = (k: string, label: string, min: number, max: number, extra: Partial<Extract<FieldDef, { kind: "num" }>> = {}): FieldDef => ({ k, kind: "num", label, min, max, ...extra });
export const color = (k: string, label: string): FieldDef => ({ k, kind: "color", label });
export const text = (k: string, label: string, max = 30, hint?: string): FieldDef => ({ k, kind: "text", label, max, hint });

export const bool = (k: string, label: string): FieldDef => ({ k, kind: "bool", label });
export const choice = (k: string, label: string, options: readonly (readonly [string, string])[]): FieldDef => ({ k, kind: "choice", label, options });
