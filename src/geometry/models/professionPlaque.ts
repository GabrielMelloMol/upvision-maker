import type { CS } from "../manifold";
import { medalOutline } from "../medal";
import { toMesh } from "../mesh";
import { fitInto, scoped } from "../shape2d";
import type { Model } from "../types";
import { artParts, MissingInput, moveMesh, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

export type ProfessionParams = {
  name: string;
  role: string;
  width: number;
  thickness: number;
  relief: number;
  fit: number; // folga do encaixe do símbolo e da placa na base
  weight: boolean; // espaço para peso (moedas/arruelas) na base, com pausa
  layerHeight: number;
  baseColor: string;
  plateColor: string;
  accentColor: string;
};

export const DEFAULT_PROFESSION: ProfessionParams = {
  name: "Dra. Ana Souza",
  role: "Psicóloga · CRP 00/0000",
  width: 150,
  thickness: 4,
  relief: 1,
  fit: 0.2,
  weight: true,
  layerHeight: 0.2,
  baseColor: "#1c1c1e",
  plateColor: "#f8f8f6",
  accentColor: "#2563eb",
};

const TAB_H = 8;
const SLOT_FIT = 0.4;
const SYMBOL_DEPTH = 1; // rebaixo onde o símbolo encaixa
const SYMBOL_T = 2.5;
const BASE_D = 40;
const BASE_H = 14;
const WEIGHT: [number, number] = [26, 6]; // bolsão para moedas/arruelas Ø26 × 6
const WEIGHT_FLOOR = 2;
const GAP = 12;

/**
 * Placa de profissão em 3 peças: base (com rasgo e, opcionalmente, bolsão para peso fechado por pausa), placa
 * com nome e profissão, e o símbolo enviado pela pessoa, que encaixa num rebaixo da placa. Sem símbolo, estrela.
 */
export function buildProfessionPlaque(ctx: ModelCtx, p: ProfessionParams): ModelOutput {
  const { M, text } = ctx;
  if (!p.name.trim()) throw new MissingInput("Digite o nome.");
  const H = p.width * 0.36;
  const m = H * 0.12;
  const side = H - 2 * m;
  const models: Model[] = [];
  const out = scoped((k) => {
    const panel = k(roundedRect(M, p.width, H, m));
    const tabW = p.width * 0.4;
    const tab = k(k(M.CrossSection.square([tabW, TAB_H + 1], true)).translate([0, -H / 2 - TAB_H / 2 + 0.5]));
    const cx = -p.width / 2 + m + side / 2;
    const custom = !!ctx.art && !ctx.art.isEmpty();
    const src: CS = custom ? ctx.art! : k(medalOutline(M, "star", 100));
    const symbol = k(k(fitInto(src, side * 0.9, side * 0.9, 0)).translate([cx, 0]));
    const pocket = k(symbol.offset(p.fit, "Round"));
    const textX0 = cx + side / 2 + m;
    const tw = p.width / 2 - m - textX0;
    const lines = [
      [p.name, H * 0.24, H * 0.12],
      [p.role, H * 0.13, -H * 0.16],
    ] as const;
    const texts = lines
      .map(([s, h, cy]) => {
        const raw = s.trim() ? text(s, h) : null;
        return raw ? k(k(fitInto(k(raw), tw, h, cy)).translate([textX0 + tw / 2, 0])) : null;
      })
      .filter((c): c is CS => !!c);
    const plateSolid = k(k(k(panel.add(tab)).extrude(p.thickness)).subtract(k(k(pocket.extrude(SYMBOL_DEPTH + 0.01)).translate([0, 0, p.thickness - SYMBOL_DEPTH]))));
    models.push({
      name: "Placa",
      parts: [
        { name: "Placa", color: p.plateColor, mesh: toMesh(plateSolid) },
        { name: "Nome", color: p.accentColor, mesh: slab(k(M.CrossSection.union(texts)), p.relief, p.thickness) },
      ],
    });
    // símbolo: peça separada, na mesa ao lado; entra no rebaixo e fica saltado
    const symCtx = custom ? ctx : { ...ctx, art: null, artLayers: null };
    const symParts = artParts(symCtx, symbol, p.accentColor, "Símbolo", SYMBOL_T, 0).map((x) => ({ ...x, mesh: moveMesh(x.mesh, 0, -H / 2 - TAB_H - BASE_D - 2 * GAP - side / 2) }));
    models.push({ name: "Símbolo", parts: symParts });
    // base
    const bw = p.width * 0.8;
    let base = k(k(roundedRect(M, bw, BASE_D, 4)).extrude(BASE_H));
    base = k(base.subtract(k(k(M.Manifold.cube([tabW + SLOT_FIT, p.thickness + SLOT_FIT, TAB_H + SLOT_FIT], true)).translate([0, 0, BASE_H - (TAB_H + SLOT_FIT) / 2 + 0.01]))));
    const pauses: number[] = [];
    if (p.weight) {
      const xs = [-bw / 2 + WEIGHT[0] / 2 + 6, bw / 2 - WEIGHT[0] / 2 - 6];
      for (const x of xs) base = k(base.subtract(k(k(M.Manifold.cylinder(WEIGHT[1], WEIGHT[0] / 2, WEIGHT[0] / 2, 48)).translate([x, 0, WEIGHT_FLOOR]))));
      pauses.push(Math.round((Math.ceil((WEIGHT_FLOOR + WEIGHT[1]) / p.layerHeight - 1e-6) * p.layerHeight + p.layerHeight) * 1000) / 1000);
    }
    models.push({ name: "Base", parts: [{ name: "Base", color: p.baseColor, mesh: moveMesh(toMesh(base), 0, -H / 2 - TAB_H - GAP - BASE_D / 2) }] });
    return { pauses };
  });
  const z = out.pauses[0]?.toFixed(2).replace(".", ",");
  return {
    models,
    pauses: out.pauses,
    warnings: [
      "Três peças: cole o símbolo no rebaixo da placa e encaixe a placa na base.",
      ...(z ? [`Pausa em Z = ${z} mm: coloque moedas ou arruelas nos 2 bolsões da base e retome (a base fica pesada e não tomba).`] : []),
    ],
  };
}
