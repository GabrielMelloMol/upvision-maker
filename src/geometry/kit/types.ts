import type { CS, ManifoldToplevel } from "../manifold";

/** Registro de objetos do Manifold (escopo): `k(obj)` devolve `obj` e o apaga no fim do `scoped`. */
export type K = <D extends { delete(): void }>(o: D) => D;

/** Parâmetros do formulário: os do kit (KitCommon) + os do modelo, tudo plano. */
export type KitParams = Record<string, string | number | boolean>;

/** Cores do modelo: `key` é o que as peças usam; `label` aparece na legenda e na lista de filamentos. */
export type KitPalette = readonly { key: string; label: string; default: string }[];

/** Uma camada de uma peça: região 2D (mm, plano XY) numa cor da paleta. A espessura é a da peça, salvo `z`. */
export type KitLayer = { cs: CS; color: string; z?: [number, number] };

/** Pino em pé (sobe da face de cima da peça): eixo de roda, pino de hélice, trava. */
export type KitPin = { x: number; y: number; r: number; len: number; color?: string };

/**
 * Uma peça plana do kit. `layers[0]` dá o contorno (para arrumar no cartão e prender com pontos de corte); furos, fendas e
 * abas já vêm cortados/somados. `count` = quantas iguais (cada uma leva seu número).
 */
export type KitPart = {
  id: string;
  label: string;
  count?: number;
  layers: KitLayer[];
  pins?: KitPin[];
  /** Espessura própria (padrão: a do kit). */
  thickness?: number;
};

/** Onde cada peça fica no montado: gira (graus, ordem X, Y, Z) e depois move. Plano impresso = XY, z de 0 a t. */
export type Placement = { part: string; index?: number; rotate?: [number, number, number]; translate: [number, number, number] };

/** Par que se toca de propósito (a colisão ignora, mas a folga é conferida): "id" ou "id#índice" (índice a partir de 1). */
export type KitPair = { a: string; b: string; kind: "pin-hole" | "tab-window" | "slot-slot" | "other"; /** folga esperada, em mm (padrão: a folga da fenda) */ gap?: number };

export type KitBuild = {
  parts: KitPart[];
  assembly: Placement[];
  /** Texto de montagem; `{id}` vira o(s) número(s) das peças daquele id ("4", "4 a 7" ou "1, 3"). */
  steps: string[];
  pairs?: KitPair[];
  warnings?: string[];
};

/** O que o modelo recebe para desenhar as peças. */
export type KitEnv = {
  M: ManifoldToplevel;
  k: K;
  /** Espessura das peças (mm). */
  t: number;
  /** Folga somada à espessura nas fendas. */
  fit: number;
  /** Folga do furo sobre o pino (encaixe por pressão: 0,15; giratório: use `spin`). */
  pinFit: number;
  /** Fator de tamanho (1 = o do modelo): multiplique as medidas por ele. */
  scale: number;
  /** Os parâmetros inteiros (os do modelo e os do kit). */
  p: KitParams;
};

/** Seção da tela do modelo (mesmo formato de `Section` das telas dos modelos). */
export type KitSection = { title: string; fields: KitField[]; when?: { k: string; is: string } };
export type KitField =
  | { k: string; kind: "num"; label: string; min: number; max: number; step?: number; unit?: string; hint?: string }
  | { k: string; kind: "choice"; label: string; options: readonly (readonly [string, string])[] }
  | { k: string; kind: "bool"; label: string }
  | { k: string; kind: "text"; label: string; max?: number; hint?: string }
  | { k: string; kind: "color"; label: string };

export type KitTemplate = {
  id: string;
  label: string;
  blurb: string;
  palette: KitPalette;
  /** Peças que aceitam a arte do usuário em relevo (id, rótulo). Vazio/ausente: o modelo não oferece arte. */
  artTargets?: readonly (readonly [string, string])[];
  /** Valores padrão dos parâmetros do modelo (os do kit vêm de DEFAULT_KIT_COMMON). */
  defaults: KitParams;
  /** Campos do modelo (o kit acrescenta Cartão, Peças e encaixe, Cores e Arte em relevo). */
  sections: KitSection[];
  build: (env: KitEnv) => KitBuild;
};
