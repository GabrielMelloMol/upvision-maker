import { bedMm } from "../bed";
import { layoutOnPlate } from "../keychain";
import type { CS, ManifoldToplevel } from "../manifold";
import { toMesh } from "../mesh";
import { followTransform, fitInto, scoped } from "../shape2d";
import type { Model } from "../types";
import { MissingInput, requireArt, roundedRect, type ModelCtx, type ModelOutput } from "./common";

export type ShadowboxOrder = "dark-back" | "light-back" | "image";

export type ShadowboxParams = {
  width: number; // largura da imagem (mm)
  plate: number; // espessura de cada placa
  gap: number; // profundidade entre uma camada e a seguinte (altura da borda-espaçadora)
  border: number; // largura da moldura de cada placa
  order: ShadowboxOrder; // qual cor fica no fundo
  led: boolean; // fundo fino para luz atrás
};

export const DEFAULT_SHADOWBOX: ShadowboxParams = { width: 100, plate: 1.2, gap: 3, border: 8, order: "dark-back", led: false };

export const MAX_SHADOWBOX_LAYERS = 8;
const LED_BACK_MM = 0.8; // fundo fino que difunde a luz
const PLATE_GAP_MM = 6; // espaço entre as placas na mesa
const DIGIT_FRACTION = 0.6; // altura do número em relação à moldura
const DIGIT_MAX_MM = 6;
const BRIDGE_MM = 1.6; // largura da ponte que prende uma área solta à moldura
const BRIDGE_OVERLAP_MM = 1; // a ponte entra na moldura para fundir

/** Luminância aproximada (0 a 1) de "#rrggbb"; cor inválida conta como meio-tom. */
function luma(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 : 0.5;
}

type Layer = { color: string; cs: CS };

/**
 * Áreas da placa que não encostam na moldura cairiam: cada uma ganha uma ponte fina, em linha reta, até a borda mais
 * próxima da janela. Devolve a placa já com as pontes e quantas foram.
 */
function bridged(M: ManifoldToplevel, body: CS, w: number, h: number, k: <D extends { delete(): void }>(o: D) => D): { cs: CS; bridges: number } {
  const parts = body.decompose().map(k);
  if (parts.length < 2) return { cs: body, bridges: 0 };
  const main = parts.reduce((a, c) => (c.area() > a.area() ? c : a));
  const bars = parts.filter((c) => c !== main).map((c) => {
    const b = c.bounds();
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    const o = BRIDGE_OVERLAP_MM, t = BRIDGE_MM;
    const ways = [
      { d: cx + w / 2, size: [cx + w / 2 + o, t], from: [-w / 2 - o, cy - t / 2] }, // esquerda
      { d: w / 2 - cx, size: [w / 2 - cx + o, t], from: [cx, cy - t / 2] }, // direita
      { d: cy + h / 2, size: [t, cy + h / 2 + o], from: [cx - t / 2, -h / 2 - o] }, // embaixo
      { d: h / 2 - cy, size: [t, h / 2 - cy + o], from: [cx - t / 2, cy] }, // em cima
    ] as { d: number; size: [number, number]; from: [number, number] }[];
    const way = ways.reduce((a, c2) => (c2.d < a.d ? c2 : a));
    return k(k(M.CrossSection.square(way.size)).translate(way.from));
  });
  return { cs: k(M.CrossSection.union([body, ...bars])), bridges: bars.length };
}

/** Junta a menor região na vizinha até sobrarem `max` camadas (a vizinha mantém a cor). Não apaga as entradas. */
function mergeSmallest(layers: Layer[], max: number, add: (a: CS, b: CS) => CS): { layers: Layer[]; merged: number } {
  const out = [...layers];
  let merged = 0;
  while (out.length > max) {
    const small = out.reduce((best, l, i) => (l.cs.area() < out[best].cs.area() ? i : best), 0);
    const into = small > 0 ? small - 1 : 1;
    out[into] = { color: out[into].color, cs: add(out[into].cs, out[small].cs) };
    out.splice(small, 1);
    merged++;
  }
  return { layers: out, merged };
}

/**
 * Shadowbox (#104): a imagem colorida vira de 2 a 8 placas recortadas, uma por cor, da camada 1 (fundo) à última (frente).
 * Cada placa tem a moldura inteira mais as áreas das cores dela e das que ficam na frente; a moldura sobe `gap` mm e faz de
 * espaçador, então as placas empilham coladas pela borda. Cada placa é de uma cor só e vai numerada na quina.
 */
export function buildShadowbox(ctx: ModelCtx, p: ShadowboxParams): ModelOutput {
  const art = requireArt(ctx.art);
  if (!ctx.artLayers || ctx.artLayers.length < 2) throw new MissingInput("Envie uma imagem ou SVG colorido: cada cor vira uma camada (de 3 a 8 cores fica melhor).");
  const { M } = ctx;
  return scoped((k) => {
    const placed = k(fitInto(art, p.width, 1e6, 0));
    const b = placed.bounds();
    const center: [number, number] = [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2];
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
    const aligned: Layer[] = ctx.artLayers!
      .map((l) => ({ color: l.color, cs: k(k(k(followTransform(art, placed, l.cs)).intersect(placed)).translate(center)) }))
      .filter((l) => !l.cs.isEmpty());
    if (aligned.length < 2) throw new MissingInput("A imagem precisa de pelo menos 2 cores diferentes.");

    const ordered = p.order === "image" ? aligned : [...aligned].sort((x, y) => (luma(x.color) - luma(y.color)) * (p.order === "dark-back" ? 1 : -1));
    const { layers, merged } = mergeSmallest(ordered, MAX_SHADOWBOX_LAYERS, (a, c) => k(a.add(c)));
    const n = layers.length;

    const window = k(M.CrossSection.square([w, h], true));
    const outer = k(roundedRect(M, w + 2 * p.border, h + 2 * p.border, p.border));
    const ring = k(outer.subtract(window));
    const digitH = Math.min(p.border * DIGIT_FRACTION, DIGIT_MAX_MM);
    const corner: [number, number] = [-w / 2 - p.border / 2, -h / 2 - p.border / 2];

    // da frente para trás: o que está na frente aparece também nas placas de trás
    const reach: CS[] = [];
    let acc: CS | null = null;
    for (let i = n - 1; i >= 0; i--) {
      acc = k(acc ? acc.add(layers[i].cs) : layers[i].cs.translate([0, 0]));
      reach[i] = acc;
    }

    let bridges = 0;
    const models: Model[] = layers.map((l, i) => {
      const num = ctx.text(String(i + 1), digitH);
      const nb = num?.bounds();
      const digit = num && nb ? k(k(num).translate([corner[0] - (nb.min[0] + nb.max[0]) / 2, corner[1] - (nb.min[1] + nb.max[1]) / 2])) : null;
      const base = i === 0 ? outer : k(ring.add(reach[i]));
      const cut = digit ? k(base.subtract(digit)) : base;
      const { cs: body, bridges: made } = bridged(M, cut, w, h, k);
      bridges += made;
      const lip = digit ? k(ring.subtract(digit)) : ring;
      const t = i === 0 && p.led ? Math.min(p.plate, LED_BACK_MM) : p.plate;
      const solid = k(k(body.extrude(t)).add(k(lip.extrude(t + p.gap))));
      const tag = i === 0 ? " (fundo)" : i === n - 1 ? " (frente)" : "";
      return { name: `Camada ${i + 1} de ${n}${tag}`, parts: [{ name: `Camada ${i + 1}`, color: l.color, mesh: toMesh(solid) }] };
    });

    const laid = layoutOnPlate(models, bedMm(), PLATE_GAP_MM);
    const warnings = [`Monte na ordem dos números: a 1 é o fundo e a ${n} fica na frente. Cole as bordas; a profundidade total fica em ${(n * (p.plate + p.gap)).toFixed(0)} mm.`];
    if (merged) warnings.push(`A imagem tinha mais de ${MAX_SHADOWBOX_LAYERS} cores: ${merged} região(ões) pequena(s) foram juntadas à vizinha.`);
    if (bridges) warnings.push(`${bridges} área(s) soltas ganharam uma ponte fina (${BRIDGE_MM} mm) até a moldura para não caírem; corte a ponte com estilete se atrapalhar.`);
    if (p.led) warnings.push("Fundo fino para luz: encoste uma fita de LED ou uma base com luz atrás da camada 1.");
    if (w + 2 * p.border > bedMm() / 2) warnings.push(`As ${n} placas não cabem juntas na mesa de ${bedMm()} mm: use "Mesa por cor" (uma placa por mesa).`);
    return { models: laid, warnings };
  });
}
