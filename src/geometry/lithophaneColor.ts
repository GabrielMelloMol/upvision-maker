import { heightfieldMesh } from "./heightfield";
import type { ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import { hexToRgb } from "../vectorize/palette";
import type { Mesh, Model } from "./types";

/*
 * Litofania colorida (#102): a foto vira camadas de ciano, magenta, amarelo e preto de espessura variável sobre uma
 * camada branca de difusão. Cada filamento deixa passar a luz de cada canal (R, G, B) como exp(−a·espessura); o `a`
 * vem da cor do filamento e do seu TD (transmission distance, mm). Para cada ponto, escolhemos as espessuras que
 * deixam passar a cor da foto (mínimos quadrados no log da transmitância, com limite por tinta) e arredondamos para
 * a altura de camada. A prévia contra a luz usa o mesmo modelo, então mostra o que a peça deve dar.
 */
export type Ink = { hex: string; td: number; /** true = TD medido/cadastrado pela pessoa; false = valor típico. */ known?: boolean };
export type InkRole = "white" | "cyan" | "magenta" | "yellow" | "black";
export type ColorLithoParams = {
  inks: Record<InkRole, Ink>;
  /** Espessura máxima de ciano, magenta e amarelo (o preto usa metade). */
  maxInk: number;
  /** Espessura do branco de difusão (atrás de todas as tintas). */
  whiteT: number;
  /** Moldura inteiriça em volta (mm). */
  border: number;
};

export const COLOR_LAYER = 0.08;
export const COLOR_ROLES: InkRole[] = ["white", "cyan", "magenta", "yellow", "black"];
export const COLOR_NAMES: Record<InkRole, string> = { white: "Branco", cyan: "Ciano", magenta: "Magenta", yellow: "Amarelo", black: "Preto" };
export const DEFAULT_COLOR_LITHO: ColorLithoParams = {
  inks: {
    white: { hex: "#f8f8f6", td: 1 },
    cyan: { hex: "#00aeef", td: 3 },
    magenta: { hex: "#ec008c", td: 3 },
    yellow: { hex: "#fff200", td: 4 },
    black: { hex: "#1c1c1e", td: 0.6 },
  },
  maxInk: 1.6,
  whiteT: 0.8,
  border: 3,
};

const GAMMA = 2.2;
const FLOOR = 0.03; // um canal nunca passa 100% nem 0% de luz
const INK_ORDER: InkRole[] = ["cyan", "magenta", "yellow", "black"]; // da luz para quem olha
const COST = [0.03, 0.03, 0.03, 0.01]; // preferir o preto para os cinzas
const SWEEPS = 24;
const FOOT_D = 12;
const FOOT_H = 3;

/** Absorção por mm (R, G, B) de um filamento: a luz restante com a espessura `td` é a cor do filamento. */
export function inkAbsorbance(hex: string, td: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b].map((v) => -Math.log(FLOOR + (1 - FLOOR) * (v / 255)) / Math.max(td, 0.05)) as [number, number, number];
}

const maxOf = (i: number, P: ColorLithoParams) => (i === 3 ? P.maxInk / 2 : P.maxInk);
const absorbances = (P: ColorLithoParams) => INK_ORDER.map((r) => inkAbsorbance(P.inks[r].hex, P.inks[r].td));

/** Espessuras [ciano, magenta, amarelo, preto] em mm (sem arredondar) que deixam passar a cor `rgb` (0–255). */
export function solveInks(rgb: [number, number, number], P: ColorLithoParams, a = absorbances(P)): [number, number, number, number] {
  const y = rgb.map((v) => Math.log(Math.max(Math.pow(v / 255, GAMMA), FLOOR)));
  const t: [number, number, number, number] = [0, 0, 0, 0];
  for (let s = 0; s < SWEEPS; s++)
    for (let i = 0; i < 4; i++) {
      let num = -COST[i], den = 1e-6;
      for (let c = 0; c < 3; c++) {
        let rest = -y[c];
        for (let j = 0; j < 4; j++) if (j !== i) rest -= a[j][c] * t[j];
        num += a[i][c] * rest;
        den += a[i][c] * a[i][c];
      }
      t[i] = Math.min(maxOf(i, P), Math.max(0, num / den));
    }
  return t;
}

const quant = (v: number) => Math.round(v / COLOR_LAYER) * COLOR_LAYER;

/** Espessura por ponto de cada tinta (ciano, magenta, amarelo, preto), em múltiplos da altura de camada. */
export function colorThickness(rgba: Uint8ClampedArray, cols: number, rows: number, P: ColorLithoParams): Float32Array[] {
  const n = cols * rows;
  const out = INK_ORDER.map(() => new Float32Array(n));
  const a = absorbances(P);
  for (let i = 0; i < n; i++) {
    const al = rgba[i * 4 + 3] / 255;
    const px = [0, 1, 2].map((c) => rgba[i * 4 + c] * al + 255 * (1 - al)) as [number, number, number];
    const t = solveInks(px, P, a);
    for (let k = 0; k < 4; k++) out[k][i] = Math.min(quant(t[k]), maxOf(k, P));
  }
  return out;
}

/** Cor (0–255) que passa pelas espessuras `t` quando a luz atrás é branca. */
export function transmitted(t: number[], P: ColorLithoParams): [number, number, number] {
  const a = absorbances(P);
  return [0, 1, 2].map((c) => {
    const tr = Math.exp(-t.reduce((s, ti, i) => s + a[i][c] * ti, 0));
    return Math.round(255 * Math.pow(Math.min(1, tr), 1 / GAMMA));
  }) as [number, number, number];
}

/** Prévia contra a luz (RGBA), com a moldura em volta mostrada escura. */
export function colorPreview(t: Float32Array[], cols: number, rows: number, P: ColorLithoParams): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(cols * rows * 4);
  const tint = hexToRgb(P.inks.white.hex).map((v) => v / 255);
  for (let i = 0; i < cols * rows; i++) {
    const [r, g, b] = transmitted(t.map((x) => x[i]), P);
    out.set([r * tint[0], g * tint[1], b * tint[2], 255], i * 4);
  }
  return out;
}

const solidOf = (M: ManifoldToplevel, m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

/** Avisos sobre o que a pessoa precisa para imprimir. */
export function colorWarnings(P: ColorLithoParams): string[] {
  const out = [
    "Esta litofania usa 5 filamentos ao mesmo tempo (branco, ciano, magenta, amarelo e preto): precisa de um AMS com 5 espaços (por exemplo, dois AMS) ou trocas à mão.",
    "Use filamentos translúcidos ou finos o bastante para a luz passar (próprios para litofania): o ciano, o magenta e o amarelo muito opacos deixam tudo escuro.",
  ];
  const typical = (["cyan", "magenta", "yellow", "black"] as InkRole[]).filter((r) => !P.inks[r].known);
  if (typical.length)
    out.push(`Sem TD cadastrado para ${typical.map((r) => COLOR_NAMES[r].toLowerCase()).join(", ")}: usei valores típicos. Cadastre o TD do seu filamento em Estoque para as cores saírem certas.`);
  return out;
}

/**
 * Litofania colorida em pé (luz atrás): um volume por filamento. Da luz para quem olha: branco, ciano, magenta,
 * amarelo e preto; a moldura é só de branco, na espessura total.
 */
export function buildColorLithophane(M: ManifoldToplevel, rgba: Uint8ClampedArray, cols: number, rows: number, cell: number, P: ColorLithoParams): { model: Model; warnings: string[]; thickness: Float32Array[] } {
  const thick = colorThickness(rgba, cols, rows, P);
  const n = cols * rows;
  const b = Math.round(P.border / cell);
  const isFrame = (i: number) => {
    const r = Math.floor(i / cols), c = i % cols;
    return r < b || r >= rows - b || c < b || c >= cols - b;
  };
  for (let i = 0; i < n; i++) if (isFrame(i)) for (const ink of thick) ink[i] = 0;
  // superfícies acumuladas: S0 = branco, S1..S4 = depois de cada tinta
  const surf = [new Float32Array(n).fill(P.whiteT)];
  for (let k = 0; k < 4; k++) surf.push(surf[k].map((v, i) => v + thick[k][i]));
  const top = surf[4].reduce((m, v) => Math.max(m, v), 0);
  for (let i = 0; i < n; i++) if (isFrame(i)) for (const s of surf) s[i] = top;
  const W = (cols - 1) * cell, H = (rows - 1) * cell;
  const stand = (x: number, y: number, z: number): [number, number, number] => [x, z, y + H / 2];
  const parts = scoped((k) => {
    const hf = surf.map((s) => k(solidOf(M, heightfieldMesh(s, cols, rows, cell, stand))));
    const foot = k(k(M.Manifold.cube([W, FOOT_D, FOOT_H], true)).translate([0, top / 2, FOOT_H / 2]));
    return hf.map((s, i) => {
      const role = i === 0 ? "white" : INK_ORDER[i - 1];
      const slab = i === 0 ? k(s.add(foot)) : k(s.subtract(hf[i - 1]));
      return slab.isEmpty() ? null : { name: COLOR_NAMES[role], color: P.inks[role].hex, mesh: toMesh(slab) };
    });
  }).filter((x) => x !== null);
  return { model: { name: "Litofania colorida", parts }, warnings: colorWarnings(P), thickness: thick };
}

