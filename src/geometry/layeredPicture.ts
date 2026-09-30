import { heightfieldMesh } from "./heightfield";
import { hangTab, shapeRegion, type LayeredHang, type LayeredShape } from "./layeredShape";
import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { hexToRgb, rgbToLab } from "../vectorize/palette";
import { scoped } from "./shape2d";
import type { Model } from "./types";

export type LayeredParams = {
  base: number; // camadas da 1ª cor (fundo escuro) antes do relevo
  relief: number; // altura do relevo (claro = alto)
  layerHeight: number;
  colors: string[]; // filamentos, 2–4
  split: boolean; // uma parte por cor (AMS / multimaterial) em vez de uma peça só com pausas
  /** TD (transmission distance, mm) de cada cor, na ordem de `colors`; null = sem medida. Faixa ∝ TD (#100). */
  tds?: (number | null)[];
  shape?: LayeredShape;
  hang?: LayeredHang;
  magnet?: boolean;
  magnetD?: number;
  magnetH?: number;
  /** Só para teste: ímã ligado mas sem o oco (compara volumes). */
  magnetHole?: boolean;
  /** 1 = sujeito, por ponto da grade (Silhueta); fora dele o fundo pode ficar liso. */
  mask?: Uint8Array | null;
  /** Fundo liso na cor de índice `background` (ordem do escuro ao claro); ausente = fundo com relevo. */
  background?: number | null;
};

export const DEFAULT_LAYERED: LayeredParams = { base: 0.6, relief: 2.4, layerHeight: 0.12, colors: ["#1c1c1e", "#8e8e93", "#f8f8f6"], split: false };

/** Troca de filamento: pausa antes da camada `layer` (topo em `z`); a cor anterior termina em `z - altura de camada`. */
export type ColorSwap = { z: number; layer: number; color: string };

const lightness = (hex: string) => rgbToLab(...hexToRgb(hex))[0];
const snap = (z: number, lh: number) => Math.round(Math.round(z / lh) * lh * 1000) / 1000;
const MAGNET_PLAY = 0.3; // no diâmetro
const MAGNET_PLAY_H = 0.2;
const MAGNET_FLOOR = 0.6; // embaixo do ímã
const MAGNET_ROOF = 0.6; // em cima do ímã, antes do relevo

/** Divisas entre as faixas de cor (do escuro ao claro), proporcionais ao TD quando houver. */
function bandBounds(base: number, top: number, n: number, tds: (number | null)[] | null, lh: number): number[] {
  const known = (tds ?? []).filter((t): t is number => t != null && t > 0);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const w = Array.from({ length: n }, (_, i) => (known.length ? (tds![i] ?? avg) : 1));
  const total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return w.slice(0, -1).map((wi) => {
    acc += wi;
    return snap(base + ((top - base) * acc) / total, lh);
  });
}

/**
 * Quadro por camadas (estilo HueForge): placa deitada em que o claro da foto é mais alto; os filamentos vão do
 * mais escuro (embaixo) ao mais claro (em cima) e trocam em alturas fixas. Devolve as trocas (pausas). Com `split`, cada faixa de altura sai como parte da sua cor (o fatiador troca sozinho no AMS).
 * #100: formato (inclusive o contorno do sujeito), aba com furo, ímã embutido (com pausa em `magnetZ`), fundo liso
 * numa cor fora do sujeito e faixas proporcionais ao TD de cada filamento.
 */
export function buildLayeredPicture(
  M: ManifoldToplevel,
  luma: Float32Array,
  cols: number,
  rows: number,
  cell: number,
  p: LayeredParams,
): { model: Model; preview: Model; swaps: ColorSwap[]; magnetZ?: number; warnings: string[] } {
  if (p.colors.length < 2) throw new Error("Escolha pelo menos 2 filamentos.");
  const lh = p.layerHeight;
  const order = p.colors.map((c, i) => ({ c, td: p.tds?.[i] ?? null })).sort((a, b) => lightness(a.c) - lightness(b.c));
  const colors = order.map((o) => o.c);
  const warnings: string[] = [];
  // ímã: base mais grossa com um oco fechado; o relevo sobe junto
  const magnetD = p.magnetD ?? 10, magnetH = p.magnetH ?? 2;
  const back = p.magnet ? snap(MAGNET_FLOOR + magnetH + MAGNET_PLAY_H + MAGNET_ROOF, lh) : 0;
  const base = snap(back + p.base, lh);
  const top = snap(base + p.relief, lh);
  const bounds = bandBounds(base, top, colors.length, p.tds ? order.map((o) => o.td) : null, lh);
  const cuts = [0, ...bounds, top + 1];
  // fundo liso: uma camada abaixo da divisa, para a cor de cima não aparecer numa lâmina fina
  const bgIdx = p.background != null ? Math.min(p.background, colors.length - 1) : -1;
  const flatBg = p.mask && bgIdx >= 0 ? (bgIdx === colors.length - 1 ? top : Math.max(lh, snap(cuts[bgIdx + 1] - lh, lh))) : null;
  const t = luma.map((l, i) => (flatBg != null && !p.mask![i] ? flatBg : Math.max(lh, snap(base + l * (top - base), lh))));
  const swaps = bounds.map((b, i) => {
    const z = snap(b + lh, lh);
    return { z, layer: Math.round(z / lh), color: colors[i + 1] };
  });
  const W = (cols - 1) * cell, H = (rows - 1) * cell;
  const mesh = heightfieldMesh(t, cols, rows, cell);
  let magnetZ: number | undefined;
  const { whole, parts } = scoped((k) => {
    let solid: Solid = k(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices })));
    const region = shapeRegion(M, p.shape ?? "rect", W, H, p.mask, cols, rows, cell);
    const outline: CS = region ? k(region) : k(M.CrossSection.square([W, H], true));
    if (region) solid = k(solid.intersect(k(k(region.extrude(top + 2)).translate([0, 0, -1]))));
    if (p.hang && p.hang !== "none") {
      const b = outline.bounds();
      const [ring, hole] = hangTab(M, p.hang, (b.min[0] + b.max[0]) / 2, b.max[1]);
      k(ring);
      k(hole);
      // a aba fica na altura da base (1ª cor), com o furo passando
      solid = k(k(solid.add(k(ring.extrude(base)))).subtract(k(k(hole.extrude(top + 2)).translate([0, 0, -1]))));
    }
    if (p.magnet) {
      const b = outline.bounds();
      const hole = k(k(M.CrossSection.circle((magnetD + MAGNET_PLAY) / 2, 64)).translate([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]));
      if (k(hole.intersect(outline)).area() < hole.area() * 0.99) warnings.push("O ímã não cabe inteiro no centro do quadro: use um ímã menor ou um quadro maior.");
      const z0 = snap(MAGNET_FLOOR, lh), z1 = snap(MAGNET_FLOOR + magnetH + MAGNET_PLAY_H, lh);
      if (p.magnetHole !== false) solid = k(solid.subtract(k(k(hole.extrude(z1 - z0)).translate([0, 0, z0]))));
      magnetZ = snap(z1 + lh, lh);
    }
    const whole = toMesh(solid);
    const parts = colors
      .map((color, i) => {
        const above = k(solid.trimByPlane([0, 0, 1], cuts[i]));
        const slab = k(above.trimByPlane([0, 0, -1], -cuts[i + 1]));
        return slab.isEmpty() ? null : { name: `Cor ${i + 1}`, color, mesh: toMesh(slab) };
      })
      .filter((x) => x !== null);
    return { whole, parts };
  });
  // a prévia mostra sempre as faixas nas cores reais; o arquivo segue `split`
  const preview = { name: "Quadro", parts };
  const model = p.split ? preview : { name: "Quadro", parts: [{ name: "Quadro", color: colors[0], mesh: whole }] };
  return { model, preview, swaps, magnetZ, warnings };
}
