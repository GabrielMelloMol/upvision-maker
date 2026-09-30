import { BG_TEXTURES } from "../../geometry/models/textures";
import type { LucideIcon } from "lucide-react";
import type { ModelCtx, ModelOutput } from "../../geometry/models/common";

export type Params = Record<string, string | number | boolean>;

export type FieldDef =
  | { k: string; kind: "num"; label: string; min: number; max: number; step?: number; unit?: string; hint?: string }
  | { k: string; kind: "text"; label: string; max?: number; hint?: string }
  | { k: string; kind: "money"; label: string; hint?: string }
  | { k: string; kind: "color"; label: string }
  | { k: string; kind: "bool"; label: string }
  | { k: string; kind: "choice"; label: string; options: readonly (readonly [string, string])[] }
  /** Fonte própria de uma parte do modelo (a letra, uma linha); `sample` = campo de texto da prévia. */
  | { k: string; kind: "font"; label: string; sample?: string };

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
/** Textura rebaixada no fundo de placas e letreiros (#50). */
/** Cavidade para resina epóxi (#53). */
export const resinFields: FieldDef[] = [
  bool("resin", "Cavidade para resina"),
  num("resinDepth", "Profundidade da resina", 0.6, 4),
  num("resinWall", "Borda da resina", 1, 4),
];
export const textureFields: FieldDef[] = [
  choice("texture", "Textura do fundo", BG_TEXTURES),
  num("texturePitch", "Tamanho do padrão", 3, 20, { step: 0.5 }),
  num("textureDepth", "Rebaixo da textura", 0.4, 1, { step: 0.1 }),
];
export const font = (k: string, label: string, sample?: string): FieldDef => ({ k, kind: "font", label, sample });

/** Grupos de campos repetidos entre modelos. */
export const logoFields = (maxW: number) => [
  num("width", "Largura da arte", 15, maxW, { step: 1 }),
  num("base", "Base", 1.2, 8),
  num("relief", "Relevo", 0.4, 4),
  num("border", "Borda", 1, 10, { step: 0.5 }),
];
export const nfcFields: FieldDef[] = [
  num("tagDiameter", "Diâmetro da tag", 15, 35, { hint: "NTAG213/215 redonda: 25 mm." }),
  num("tagThickness", "Espessura da tag", 0.3, 2),
  num("layerHeight", "Altura de camada", 0.08, 0.32, { step: 0.02, hint: "A mesma do fatiador: define a camada da pausa." }),
];
export const signLine = (i: number): Section => ({
  title: `Linha ${i}`,
  fields: [text(`line${i}`, "Texto", 24), num(`h${i}`, "Altura", 6, 80, { step: 1 }), num(`dx${i}`, "Deslocamento (→)", -80, 80, { step: 1 }), color(`c${i}`, "Cor"), font(`font${i}`, `Fonte da linha ${i}`, `line${i}`)],
});
