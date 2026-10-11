import type { CS, ManifoldToplevel } from "../manifold";
import type { K } from "./types";

/**
 * Juntas planas reutilizáveis (funções puras de CS, em mm). Todas devolvem a região a SOMAR (aba, rabo) ou a TIRAR (fenda,
 * janela, furo) da peça; as folgas já vêm somadas.
 */

/** Retângulo com cantos em (x0, y0)–(x1, y1). */
export function rect(M: ManifoldToplevel, k: K, x0: number, y0: number, x1: number, y1: number): CS {
  return k(k(M.CrossSection.square([x1 - x0, y1 - y0], false)).translate([x0, y0]));
}

/** Círculo de raio `r` em (x, y). */
export function disc(M: ManifoldToplevel, k: K, x: number, y: number, r: number, seg = 48): CS {
  return k(k(M.CrossSection.circle(r, seg)).translate([x, y]));
}

/** Polígono por pontos. */
export function poly(M: ManifoldToplevel, k: K, pts: [number, number][]): CS {
  return k(new M.CrossSection([pts], "NonZero"));
}

/**
 * Meia-fenda (cross-lap): a fenda de uma placa que cruza outra. Duas placas se cruzam quando uma tem a fenda vinda de cima e a
 * outra de baixo, cada uma até a metade da altura de encontro. `edge` = y da borda de onde a fenda entra; `from` = de que lado
 * (a fenda vai de `edge` para dentro, `depth` mm); a largura é `t + fit`.
 */
export function crossLap(M: ManifoldToplevel, k: K, o: { x: number; edge: number; depth: number; from: "top" | "bottom"; t: number; fit: number; over?: number }): CS {
  const w = o.t + o.fit, over = o.over ?? 1; // `over`: passa um pouco da borda, para o corte sair limpo
  return o.from === "top" ? rect(M, k, o.x - w / 2, o.edge - o.depth, o.x + w / 2, o.edge + over) : rect(M, k, o.x - w / 2, o.edge - over, o.x + w / 2, o.edge + o.depth);
}

/** Janela para uma aba (lingueta) de largura `tabW` e espessura de placa `t`: mede (tabW + fit) × (t + fit). */
export function tabWindow(M: ManifoldToplevel, k: K, o: { cx: number; cy: number; tabW: number; t: number; fit: number; vertical?: boolean }): CS {
  const a = o.tabW + o.fit, b = o.t + o.fit;
  const [w, h] = o.vertical ? [b, a] : [a, b];
  return rect(M, k, o.cx - w / 2, o.cy - h / 2, o.cx + w / 2, o.cy + h / 2);
}

/** Aba (lingueta) que sai de uma borda: retângulo de `w` × `len` com a base em y = `base` (cresce para `dir`: 1 = +y, -1 = -y). */
export function tab(M: ManifoldToplevel, k: K, o: { x: number; base: number; w: number; len: number; dir?: 1 | -1 }): CS {
  const d = o.dir ?? 1;
  return d === 1 ? rect(M, k, o.x - o.w / 2, o.base - 0.01, o.x + o.w / 2, o.base + o.len) : rect(M, k, o.x - o.w / 2, o.base - o.len, o.x + o.w / 2, o.base + 0.01);
}

/**
 * Rabo de andorinha: `tail` (a somar à peça macho, base em y = `base`, ponta mais larga em y = base + len) e `socket` (a tirar
 * da fêmea, `fit` maior em volta).
 */
export function dovetail(M: ManifoldToplevel, k: K, o: { x: number; base: number; wBase: number; wTip: number; len: number; fit: number }): { tail: CS; socket: CS } {
  const hb = o.wBase / 2, ht = o.wTip / 2, y1 = o.base + o.len;
  const tail = poly(M, k, [[o.x - hb, o.base - 0.01], [o.x + hb, o.base - 0.01], [o.x + ht, y1], [o.x - ht, y1]]);
  const socket = k(tail.offset(o.fit / 2, "Miter"));
  return { tail, socket };
}

/** Furo para um pino: raio do pino + folga/2. `pinFit` 0,15 = por pressão; use ~0,3 para o pino girar. */
export function pinHole(M: ManifoldToplevel, k: K, o: { x: number; y: number; r: number; fit: number }): CS {
  return disc(M, k, o.x, o.y, o.r + o.fit / 2);
}
