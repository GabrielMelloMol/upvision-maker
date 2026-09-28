import { heightfieldMesh } from "./heightfield";
import type { ManifoldToplevel } from "./manifold";
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
};

export const DEFAULT_LAYERED: LayeredParams = { base: 0.6, relief: 2.4, layerHeight: 0.12, colors: ["#1c1c1e", "#8e8e93", "#f8f8f6"], split: false };

/** Troca de filamento: pausa antes da camada `layer` (topo em `z`); a cor anterior termina em `z - altura de camada`. */
export type ColorSwap = { z: number; layer: number; color: string };

const lightness = (hex: string) => rgbToLab(...hexToRgb(hex))[0];
const snap = (z: number, lh: number) => Math.round(Math.round(z / lh) * lh * 1000) / 1000;

/**
 * Quadro por camadas (estilo HueForge): placa deitada em que o claro da foto é mais alto; os filamentos vão do
 * mais escuro (embaixo) ao mais claro (em cima) e trocam em alturas fixas. Devolve as trocas (pausas). Com `split`, cada faixa de altura sai como parte da sua cor (o fatiador troca sozinho no AMS).
 */
export function buildLayeredPicture(
  M: ManifoldToplevel,
  luma: Float32Array,
  cols: number,
  rows: number,
  cell: number,
  p: LayeredParams,
): { model: Model; preview: Model; swaps: ColorSwap[] } {
  if (p.colors.length < 2) throw new Error("Escolha pelo menos 2 filamentos.");
  const colors = [...p.colors].sort((a, b) => lightness(a) - lightness(b));
  const base = snap(p.base, p.layerHeight);
  const top = snap(base + p.relief, p.layerHeight);
  const t = luma.map((l) => Math.max(p.layerHeight, snap(base + l * (top - base), p.layerHeight)));
  // cor k começa acima do topo da faixa k-1: faixas iguais do relevo
  const band = (top - base) / colors.length;
  const bounds = colors.slice(1).map((_, i) => snap(base + band * (i + 1), p.layerHeight));
  const swaps = bounds.map((b, i) => {
    const z = snap(b + p.layerHeight, p.layerHeight);
    return { z, layer: Math.round(z / p.layerHeight), color: colors[i + 1] };
  });
  const mesh = heightfieldMesh(t, cols, rows, cell);
  const parts = scoped((k) => {
    const solid = k(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices })));
    const cuts = [0, ...bounds, top + 1];
    return colors
      .map((color, i) => {
        const above = k(solid.trimByPlane([0, 0, 1], cuts[i]));
        const slab = k(above.trimByPlane([0, 0, -1], -cuts[i + 1]));
        return slab.isEmpty() ? null : { name: `Cor ${i + 1}`, color, mesh: toMesh(slab) };
      })
      .filter((x) => x !== null);
  });
  // a prévia mostra sempre as faixas nas cores reais; o arquivo segue `split`
  const preview = { name: "Quadro", parts };
  return { model: p.split ? preview : { name: "Quadro", parts: [{ name: "Quadro", color: colors[0], mesh }] }, preview, swaps };
}
