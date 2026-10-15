import { bedMm } from "../bed";
import type { ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { moveMesh } from "../models/common";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import type { PotParams } from "./params";

/*
 * Pote do mosaico (#206): redondo (fatias de pizza) ou retangular (grade), com uma divisória para cada cor, e tampa
 * que entra por dentro da boca. O pote sai de pé; a tampa sai virada (face de fora na mesa, o aro para cima): sem suporte.
 */
const LID_THICK = 1.8;
const LID_SKIRT_H = 8;
const LID_SKIRT_WALL = 1.6;
const LID_GAP = 12;
const MIN_COMPARTMENT_MM = 22;

type K = <D extends { delete(): void }>(o: D) => D;

/** Casas do pote retangular: colunas × linhas com pelo menos `n` divisões, o mais quadradas que a largura e a profundidade deixam. */
export function rectGrid(n: number, w: number, d: number): [number, number] {
  let best: [number, number] = [n, 1], score = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = w / cols, ch = d / rows;
    const s = Math.abs(Math.log(cw / ch)) + (cols * rows - n) * 0.3;
    if (s < score) [best, score] = [[cols, rows], s];
  }
  return best;
}

/** Divisórias de dentro: paredes de espessura `t` que dividem a boca em `n` casas. */
function dividers(M: ManifoldToplevel, k: K, p: PotParams, n: number, h: number): Solid[] {
  const out: Solid[] = [];
  if (n < 2) return out;
  if (p.shape === "round") {
    const r = p.w / 2 - p.wall;
    for (let i = 0; i < n; i++) {
      const wall = k(M.Manifold.cube([r + 0.2, p.wall, h]));
      const turned = k(wall.translate([0, -p.wall / 2, 0]));
      out.push(k(turned.rotate([0, 0, (360 * i) / n])));
    }
    return out;
  }
  const [cols, rows] = rectGrid(n, p.w - 2 * p.wall, p.d - 2 * p.wall);
  const iw = p.w - 2 * p.wall, id = p.d - 2 * p.wall;
  for (let c = 1; c < cols; c++) out.push(k(k(M.Manifold.cube([p.wall, id + 0.2, h])).translate([-iw / 2 + (c * iw) / cols - p.wall / 2, -id / 2 - 0.1, 0])));
  for (let r = 1; r < rows; r++) out.push(k(k(M.Manifold.cube([iw + 0.2, p.wall, h])).translate([-iw / 2 - 0.1, -id / 2 + (r * id) / rows - p.wall / 2, 0])));
  return out;
}

const outer = (M: ManifoldToplevel, k: K, p: PotParams, grow: number, h: number): Solid =>
  p.shape === "round" ? M.Manifold.cylinder(h, p.w / 2 + grow, p.w / 2 + grow, 96) : k(M.Manifold.cube([p.w + 2 * grow, p.d + 2 * grow, h], true)).translate([0, 0, h / 2]);

/** Quantas divisórias de fato (a grade retangular pode ter casas a mais que cores). */
export const compartments = (p: PotParams, n: number): number => (p.shape === "round" ? Math.max(1, n) : (([c, r]) => c * r)(rectGrid(Math.max(1, n), p.w, p.d)));

/** Volume útil de cada divisória (mm³), para conferir se as peças cabem. */
export function compartmentVolume(p: PotParams, n: number): number {
  const area = p.shape === "round" ? Math.PI * (p.w / 2 - p.wall) ** 2 : (p.w - 2 * p.wall) * (p.d - 2 * p.wall);
  return (area * (p.height - p.floor)) / compartments(p, n);
}

/** Quanto a tampa foi deslocada em x para ficar ao lado do pote no arquivo. */
export const lidShift = (p: PotParams) => p.w + LID_GAP + p.lidClearance + LID_SKIRT_WALL;

export function buildPot(M: ManifoldToplevel, p: PotParams, n: number): { models: Model[]; warnings: string[] } {
  const warnings: string[] = [];
  const big = p.shape === "round" ? p.w : Math.max(p.w, p.d);
  if (big > bedMm()) warnings.push(`O pote tem ${Math.round(big)} mm e passa da mesa de ${bedMm()} mm: diminua o diâmetro ou a largura.`);
  const rim = Math.PI * (p.w - 2 * p.wall) / Math.max(1, n) - p.wall;
  if (p.shape === "round" && n > 1 && rim < MIN_COMPARTMENT_MM) warnings.push("Com tantas divisórias, cada uma fica estreita na borda: aumente o diâmetro.");
  const pot = scoped((k) => {
    const shell = k(outer(M, k, p, 0, p.height));
    const hollow = k(k(outer(M, k, { ...p, w: p.w - 2 * p.wall, d: p.d - 2 * p.wall }, 0, p.height)).translate([0, 0, p.floor]));
    const walls = dividers(M, k, p, n, p.height - p.floor).map((d) => k(d.translate([0, 0, p.floor])));
    const cup = k(shell.subtract(hollow));
    return toMesh(k(M.Manifold.union([cup, ...walls])));
  });
  const models: Model[] = [{ name: "Pote", parts: [{ name: "Pote", color: p.color, mesh: pot }] }];
  if (p.lid) {
    const skirtOut = p.lidClearance + LID_SKIRT_WALL;
    const lid = scoped((k) => {
      const plate = k(outer(M, k, p, skirtOut, LID_THICK));
      const ring = k(k(outer(M, k, p, skirtOut, LID_SKIRT_H)).subtract(k(outer(M, k, p, p.lidClearance, LID_SKIRT_H + 1))));
      return toMesh(k(M.Manifold.union([plate, k(ring.translate([0, 0, LID_THICK - 0.01]))])));
    });
    // a tampa fica ao lado do pote (os dois são objetos do mesmo arquivo)
    models.push({ name: "Tampa", parts: [{ name: "Tampa", color: p.lidColor, mesh: moveMesh(lid, lidShift(p), 0) }] });
    if (big + 2 * skirtOut > bedMm() && big <= bedMm()) warnings.push(`A tampa tem ${Math.round(big + 2 * skirtOut)} mm e passa da mesa de ${bedMm()} mm.`);
  }
  return { models, warnings };
}
