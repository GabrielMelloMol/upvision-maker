import type { ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Part } from "../types";
import { MissingInput, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type KeycapProfile = "flat" | "sphere";
export type KeycapLayout = "print" | "assembled";

export type KeycapParams = {
  legend: string; // letra ou texto curto; o desenho enviado (ícone) vence
  units: number; // largura em u (1 u = 19,05 mm)
  height: number; // altura total
  taper: number; // quanto o topo é menor que a base, de cada lado
  profile: KeycapProfile;
  wall: number;
  topThickness: number;
  fit: number; // folga somada à cruz da haste (cada medida)
  legendHeight: number; // altura da letra ou do ícone
  legendDepth: number; // profundidade da legenda embutida
  layout: KeycapLayout; // de ponta-cabeça (topo na mesa, haste sem suporte) ou montada
  bodyColor: string;
  legendColor: string;
};

export const DEFAULT_KEYCAP: KeycapParams = { legend: "A", units: 1, height: 8, taper: 1.5, profile: "flat", wall: 1.2, topThickness: 1.6, fit: 0.15, legendHeight: 6, legendDepth: 0.6, layout: "print", bodyColor: "#1c1c1e", legendColor: "#f8f8f6" };

export const PITCH_MM = 19.05; // passo entre teclas, 1 u
export const KEY_DEPTH_MM = 18; // base da tecla de 1 u (frente a trás)
const KEY_GAP_MM = 1.05; // folga entre teclas vizinhas
const CORNER_MM = 1;
const DISH_MM = 1; // queda do topo esférico nos cantos
/** Haste MX: cruz do interruptor (braços de 1,17 por 4,1 mm) num cilindro de 5,5 mm. */
export const STEM = { cross: 4.1, arm: 1.17, outer: 5.5, height: 4.5, hole: 4 };
const TOP_EPS = 0.5;

/** Largura da base da tecla (mm) para `units` u. */
export const keyWidth = (units: number) => units * PITCH_MM - KEY_GAP_MM;

type K = <D extends { delete(): void }>(o: D) => D;

/** Fatia fina de retângulo arredondado em z, para o casco entre base e topo. */
const slab = (M: ManifoldToplevel, w: number, d: number, z: number, k: K): Solid => k(k(k(roundedRect(M, w, d, CORNER_MM)).extrude(0.01)).translate([0, 0, z]));

/** Corpo por fora: casco entre a base e o topo, com o topo esférico (calota) se pedido. */
function shellOuter(M: ManifoldToplevel, p: KeycapParams, k: K): Solid {
  const w = keyWidth(p.units), d = KEY_DEPTH_MM;
  const hull = k(M.Manifold.hull([slab(M, w, d, 0, k), slab(M, w - 2 * p.taper, d - 2 * p.taper, p.height - 0.01, k)]));
  if (p.profile !== "sphere") return hull;
  // calota: o topo é plano no meio de altura `height` e cai `DISH_MM` nos cantos
  const c = Math.hypot(w - 2 * p.taper, d - 2 * p.taper) / 2;
  const r = (c * c + DISH_MM * DISH_MM) / (2 * DISH_MM);
  return k(hull.intersect(k(k(M.Manifold.sphere(r, 128)).translate([0, 0, p.height - r]))));
}

/**
 * Tecla de teclado mecânico (#115): corpo oco com topo reto ou esférico baixo, haste em cruz MX (com folga ajustável),
 * e a legenda (letra ou ícone) embutida rente ao topo em outra cor. Por padrão sai de ponta-cabeça: o topo fica na mesa
 * (a legenda sai lisa) e a haste cresce para cima, sem suporte.
 */
export function buildKeycap(ctx: ModelCtx, p: KeycapParams): ModelOutput {
  const { M, art, text } = ctx;
  const w = keyWidth(p.units), d = KEY_DEPTH_MM;
  const topW = w - 2 * p.taper, topD = d - 2 * p.taper;
  const dish = p.profile === "sphere" ? DISH_MM : 0;
  const ceiling = p.height - dish - p.topThickness; // teto da cavidade
  if (topW - 2 * p.wall < STEM.outer + 1 || topD - 2 * p.wall < STEM.outer + 1) throw new Error("Topo estreito demais para a haste: diminua o afunilamento ou a parede.");
  if (ceiling - STEM.height < 0.4) throw new Error("A tecla é baixa demais para a haste: aumente a altura ou diminua a espessura do topo.");
  return scoped((k) => {
    const src = art && !art.isEmpty() ? art : (() => { const t = p.legend.trim() ? text(p.legend.trim(), 100) : null; return t && k(t); })();
    if (!src || src.isEmpty()) throw new MissingInput("Digite a legenda ou envie um ícone.");
    const outer = shellOuter(M, p, k);
    // cavidade: casco menor por dentro, aberto embaixo, com teto plano em `ceiling`
    const cavity = k(M.Manifold.hull([slab(M, w - 2 * p.wall, d - 2 * p.wall, -0.01, k), slab(M, topW - 2 * p.wall, topD - 2 * p.wall, ceiling - 0.01, k)]));
    let body = k(outer.subtract(cavity));
    // haste: cilindro do teto para baixo, com a cruz vazada (folga somada às duas medidas)
    const stemBottom = ceiling - STEM.height;
    const stem = k(k(M.Manifold.cylinder(STEM.height + 0.02, STEM.outer / 2, STEM.outer / 2, 48, false)).translate([0, 0, stemBottom]));
    const arm = (l: number, t: number) => k(k(M.Manifold.cube([l, t, STEM.hole + 0.01], true)).translate([0, 0, stemBottom + (STEM.hole - 0.01) / 2 - 0.005]));
    const cross = k(arm(STEM.cross + p.fit, STEM.arm + p.fit).add(arm(STEM.arm + p.fit, STEM.cross + p.fit)));
    body = k(body.add(k(stem.subtract(cross))));
    // legenda embutida: o desenho extrudado, cortado do corpo e dado à outra cor (interseção com a casca)
    const legend = k(fitInto(src, topW * 0.8, Math.min(p.legendHeight, topD * 0.8), 0));
    const prism = k(k(legend.extrude(p.legendDepth + dish + TOP_EPS)).translate([0, 0, p.height - dish - p.legendDepth]));
    const fill = k(body.intersect(prism));
    const parts: Part[] = [];
    if (!fill.isEmpty()) {
      body = k(body.subtract(prism));
      parts.push({ name: "Legenda", color: p.legendColor, mesh: solidMesh(place(k, fill, p)) });
    }
    parts.unshift({ name: "Tecla", color: p.bodyColor, mesh: solidMesh(place(k, body, p)) });
    const warnings: string[] = [];
    if (p.units >= 2) warnings.push("Teclas de 2 u ou mais usam estabilizador: a haste do meio sai aqui, mas as hastes laterais não estão incluídas.");
    if (p.profile === "sphere" && p.layout === "print") warnings.push("Topo esférico de ponta-cabeça: a borda fica a 1 mm da mesa e pede suporte; prefira o topo plano ou imprima montada com suporte na haste.");
    warnings.push(`Haste MX com folga de ${p.fit.toFixed(2).replace(".", ",")} mm: teste numa tecla e ajuste (a cruz do interruptor tem 1,17 mm de braço).`);
    return { models: [{ name: "Tecla", parts }], warnings };
  });
}

/** Montada (topo para cima) ou de ponta-cabeça apoiada no topo, pronta para imprimir. */
function place(k: K, s: Solid, p: KeycapParams): Solid {
  return p.layout === "assembled" ? s : k(k(s.rotate([180, 0, 0])).translate([0, 0, p.height]));
}
