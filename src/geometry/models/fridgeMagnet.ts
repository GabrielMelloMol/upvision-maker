import type { CS } from "../manifold";
import { fitInto, outerOnly, scoped } from "../shape2d";
import { artParts, backing, MissingInput, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { nfcLayout } from "./nfcKeychain";

export type FridgeMagnetParams = {
  text: string; // sem desenho, o ímã é do texto
  width: number; // largura da arte
  margin: number; // contorno do corpo em volta da arte
  relief: number;
  count: number; // 1 a 5 ímãs
  magnetDiameter: number;
  magnetHeight: number;
  layerHeight: number; // a mesma do fatiador: define a camada da pausa
  bodyColor: string;
  artColor: string;
};

export const DEFAULT_FRIDGE_MAGNET: FridgeMagnetParams = { text: "Ana", width: 60, margin: 4, relief: 1, count: 1, magnetDiameter: 10, magnetHeight: 2, layerHeight: 0.2, bodyColor: "#1c1c1e", artColor: "#f5c542" };

export const MAX_MAGNETS = 5;
const CLEARANCE = 0.4; // folga no diâmetro do ímã
const WALL = 1.6; // parede entre o bolso e a borda
const GAP = 2; // parede entre dois bolsos
const GRID_MM = 1;
const MAX_CANDIDATES = 8000;

type Pt = [number, number];

/** Dentro de um conjunto de contornos (par-ímpar: furos contam). */
function inside(rings: Pt[][], [x, y]: Pt): boolean {
  let hit = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  return hit;
}

/**
 * Onde pôr até `count` bolsos de raio `r` dentro de `fits` (região onde o centro do ímã pode ficar): o primeiro perto
 * do meio (ou, com vários, no ponto mais longe do meio) e os outros sempre no ponto mais longe dos já escolhidos,
 * respeitando a parede entre bolsos. Devolve menos centros que o pedido se não couberem.
 */
export function magnetSpots(fits: CS, r: number, count: number): Pt[] {
  const b = fits.bounds();
  const rings = fits.toPolygons() as Pt[][];
  const step = Math.max(GRID_MM, Math.sqrt(((b.max[0] - b.min[0]) * (b.max[1] - b.min[1])) / MAX_CANDIDATES));
  const cands: Pt[] = [];
  for (let x = b.min[0]; x <= b.max[0] + 1e-9; x += step) for (let y = b.min[1]; y <= b.max[1] + 1e-9; y += step) if (inside(rings, [x, y])) cands.push([x, y]);
  if (!cands.length) return [];
  const cx = cands.reduce((s, c) => s + c[0], 0) / cands.length, cy = cands.reduce((s, c) => s + c[1], 0) / cands.length;
  const dist = (a: Pt, c: Pt) => Math.hypot(a[0] - c[0], a[1] - c[1]);
  const mid: Pt = [cx, cy];
  const first = count === 1 ? cands.reduce((a, c) => (dist(c, mid) < dist(a, mid) ? c : a)) : cands.reduce((a, c) => (dist(c, mid) > dist(a, mid) ? c : a));
  const chosen: Pt[] = [first];
  while (chosen.length < count) {
    let best: Pt | null = null, bestD = -1;
    for (const c of cands) {
      const d = Math.min(...chosen.map((s) => dist(c, s)));
      if (d > bestD) [best, bestD] = [c, d];
    }
    if (!best || bestD < 2 * r + GAP) break;
    chosen.push(best);
  }
  return chosen;
}

/**
 * Ímã de geladeira (#186): corpo no contorno da arte ou do nome, com a arte em relevo e de 1 a 5 bolsos fechados para
 * ímãs de neodímio perto da face de trás; a impressora pausa para inserir os ímãs e as camadas seguintes cobrem.
 */
export function buildFridgeMagnet(ctx: ModelCtx, p: FridgeMagnetParams): ModelOutput {
  const { M, art, text } = ctx;
  const count = Math.min(Math.max(Math.round(p.count), 1), MAX_MAGNETS);
  const r = (p.magnetDiameter + CLEARANCE) / 2;
  const L = nfcLayout({ tagThickness: p.magnetHeight, layerHeight: p.layerHeight });
  return scoped((k) => {
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (!src || src.isEmpty()) throw new MissingInput("Digite o texto ou envie um desenho.");
    const placed = k(fitInto(src, p.width, 1e6, 0));
    const body = k(outerOnly(M, k(backing(M, placed, p.margin))));
    const fits = k(body.offset(-(WALL + r), "Round"));
    if (fits.isEmpty()) throw new Error(`O ímã de ${p.magnetDiameter} mm não cabe: aumente a largura ou o contorno, ou use um ímã menor.`);
    const spots = magnetSpots(fits, r, count);
    let solid = k(body.extrude(L.height));
    for (const [x, y] of spots) solid = k(solid.subtract(k(k(k(M.CrossSection.circle(r, 64)).translate([x, y])).extrude(L.top - L.bottom)).translate([0, 0, L.bottom])));
    const zs = L.pauseZ.toFixed(2).replace(".", ",");
    const warnings = [`Pausa em Z = ${zs} mm: coloque ${spots.length === 1 ? "o ímã no bolso" : `os ${spots.length} ímãs nos bolsos`}, todos com a mesma face para cima, e retome. Ímã de neodímio é forte e perigoso se engolido: longe de crianças.`];
    if (spots.length < count) warnings.unshift(`Só ${spots.length === 1 ? "cabe 1 ímã" : `cabem ${spots.length} ímãs`} de ${p.magnetDiameter} mm neste tamanho: aumente a largura ou o contorno, ou use ímãs menores.`);
    const parts = [{ name: "Corpo", color: p.bodyColor, mesh: solidMesh(solid) }, ...artParts(ctx, placed, p.artColor, "Arte", p.relief, L.height)];
    return { models: [{ name: "Ímã de geladeira", parts }], pauses: [L.pauseZ], warnings };
  });
}
