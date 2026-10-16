import type { CS } from "../manifold";
import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { artParts, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

/*
 * Chaveiros de academia além da anilha (#213): o halter (barra e anilhas em degraus, como os mais vendidos) e a
 * kettlebell (corpo redondo com a alça vazada, que serve de argola). Deitados na mesa, sem suporte; a arte ou o texto
 * fica em relevo numa cor própria.
 */
type K = <D extends { delete(): void }>(o: D) => D;

export type DumbbellParams = {
  length: number; // comprimento da barra e das anilhas (a argola fica além da ponta)
  plateH: number; // altura da anilha de dentro, a maior
  thickness: number;
  relief: number;
  text: string;
  plateColor: string;
  barColor: string;
  textColor: string;
};
export const DEFAULT_DUMBBELL: DumbbellParams = { length: 58, plateH: 32, thickness: 5, relief: 1, text: "20 KG", plateColor: "#1c1c1e", barColor: "#9ca3af", textColor: "#f8f8f6" };

// de fora para dentro, em fração do comprimento: tampa (anilha pequena), anilha grande, trava e a barra
const CAP_W = 0.075;
const CAP_H = 0.62; // da altura da anilha grande
const PLATE_W = 0.1;
const GAP = 0.6; // fresta entre a tampa e a anilha: dá cara de duas anilhas empilhadas
const COLLAR_W = 0.04;
const COLLAR_H = 0.36;
const BRIDGE_H = 0.3; // a ponte que mantém tampa e anilha juntas, no meio da fresta
const PLATE_R = 2.6;
const BAR_H = 0.34; // da altura da anilha
const LOOP_R = 4.4;
const LOOP_HOLE = 2.1;
const GRIP_GAP = 0.9; // texto não encosta nas bordas da barra

/** Retângulo de cantos arredondados com o canto esquerdo em x0 (e centrado em y). */
const box = (M: Parameters<typeof roundedRect>[0], k: K, x0: number, w: number, h: number, r: number): CS => k(k(roundedRect(M, w, h, r)).translate([x0 + w / 2, 0]));

/**
 * Halter de chaveiro: duas anilhas empilhadas de cada lado (a tampa pequena por fora, a grande por dentro, como
 * discos vistos de lado, com uma fresta entre elas), trava e barra com o texto no meio. A argola fica numa orelha na
 * ponta direita, longe do texto.
 */
export function buildDumbbell(ctx: ModelCtx, p: DumbbellParams): ModelOutput {
  const { M, text, art, artLayers } = ctx;
  return scoped((k) => {
    const L = p.length, H = p.plateH;
    const half = L / 2;
    const wCap = L * CAP_W, wPl = L * PLATE_W, wCol = L * COLLAR_W;
    const side = (sign: 1 | -1) => {
      const cap = box(M, k, sign === 1 ? half - wCap : -half, wCap, H * CAP_H, PLATE_R);
      const plate = box(M, k, sign === 1 ? half - wCap - GAP - wPl : -half + wCap + GAP, wPl, H, PLATE_R);
      const bridge = box(M, k, sign === 1 ? half - wCap - GAP - 0.2 : -half + wCap - 0.2, GAP + 0.4, H * BRIDGE_H, 0.3);
      const collar = box(M, k, sign === 1 ? half - wCap - GAP - wPl - wCol : -half + wCap + GAP + wPl - 0.01, wCol + 0.01, H * COLLAR_H, 0.8); // 0,01 de encaixe na anilha; a face de dentro é a da barra
      return [cap, plate, bridge, collar];
    };
    const ear = k(k(M.CrossSection.circle(LOOP_R, 48)).translate([half + LOOP_R - 1.6, 0]));
    const earHole = k(k(M.CrossSection.circle(LOOP_HOLE, 32)).translate([half + LOOP_R - 1.6, 0]));
    const plates = k(k(M.CrossSection.union([...side(1), ...side(-1), ear])).subtract(earHole));
    const barLen = L - 2 * (wCap + GAP + wPl + wCol);
    const barH = H * BAR_H;
    const bar = box(M, k, -barLen / 2, barLen, barH, 1.4);
    const parts = [
      { name: "Anilhas", color: p.plateColor, mesh: slab(plates, p.thickness) },
      { name: "Barra", color: p.barColor, mesh: slab(bar, p.thickness) },
    ];
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (src) {
      const w = barLen - 2 * GRIP_GAP, h = barH - 2 * GRIP_GAP;
      const box2 = k(M.CrossSection.square([w, h], true));
      const placed = k(shrinkToFit(k(fitInto(src, w, h, 0)), box2)); // centrado na barra
      if (!placed.isEmpty()) parts.push(...artParts({ M, text, art, artLayers }, placed, p.textColor, "Texto", p.relief, p.thickness));
    }
    return { models: [{ name: "Halter", parts }] };
  });
}

export type KettlebellParams = {
  diameter: number;
  thickness: number;
  relief: number;
  text: string;
  bodyColor: string;
  textColor: string;
};
export const DEFAULT_KETTLEBELL: KettlebellParams = { diameter: 38, thickness: 4, relief: 1, text: "16", bodyColor: "#1c1c1e", textColor: "#d6262e" };

const HANDLE_W = 0.7; // largura externa da alça, em fração do diâmetro
const HANDLE_ROOT = 0.3; // onde a alça nasce, dentro do corpo (fração do raio)
const HANDLE_TOP = 1.75; // topo da alça (fração do raio)
const WINDOW_ABOVE_BODY = 1.03; // a janela da alça começa logo acima do corpo: é a argola
const HANDLE_BAR = 0.17; // espessura da alça
const FLAT_BASE = 0.9; // a base achatada corta o corpo a esta fração do raio

export function buildKettlebell(ctx: ModelCtx, p: KettlebellParams): ModelOutput {
  const { M, text, art, artLayers } = ctx;
  return scoped((k) => {
    const r = p.diameter / 2;
    const belly = k(M.CrossSection.circle(r, 96));
    const cut = k(k(M.CrossSection.square([4 * r, 4 * r], true)).translate([0, -FLAT_BASE * r - 2 * r]));
    const body = k(belly.subtract(cut)); // base achatada
    const hw = p.diameter * HANDLE_W, hb = p.diameter * HANDLE_BAR;
    const yBot = r * HANDLE_ROOT, yTop = r * HANDLE_TOP;
    const outer = k(k(roundedRect(M, hw, yTop - yBot, hw * 0.4)).translate([0, (yTop + yBot) / 2]));
    const winBot = r * WINDOW_ABOVE_BODY, winTop = yTop - hb;
    const inner = k(k(roundedRect(M, hw - 2 * hb, winTop - winBot, (hw - 2 * hb) * 0.4)).translate([0, (winTop + winBot) / 2]));
    const handle = k(outer.subtract(inner));
    const whole = k(body.add(handle));
    const parts = [{ name: "Kettlebell", color: p.bodyColor, mesh: slab(whole, p.thickness) }];
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (src) {
      const side = r * 1.15;
      const area = k(k(M.CrossSection.circle(r * 0.72, 64)).translate([0, -r * 0.18]));
      const placed = k(shrinkToFit(k(fitInto(src, side, side * 0.72, -r * 0.18)), area));
      if (!placed.isEmpty()) parts.push(...artParts({ M, text, art, artLayers }, placed, p.textColor, "Texto", p.relief, p.thickness));
    }
    return { models: [{ name: "Kettlebell", parts }] };
  });
}
