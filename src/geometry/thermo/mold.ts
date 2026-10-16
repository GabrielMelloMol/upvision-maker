import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { domeStack, insetAt, sliceCount, type DomeGeo } from "./dome";

type K = <D extends { delete(): void }>(o: D) => D;

export type MoldParams = {
  /** Largura da borda de apoio em volta da silhueta e espessura dela. */
  flange: number;
  flangeT: number;
  hollow: boolean;
  wall: number;
  top: number;
  ribPitch: number;
  ribT: number;
  /** Folga entre macho e fêmea, somada à espessura da tela (0,2 a 0,4 mm). */
  clearance: number;
  /** Parede em volta da tela no apoio do macho, que a centraliza na hora de prensar. */
  centerWall: number;
};

export const DEFAULT_MOLD: MoldParams = { flange: 6, flangeT: 2, hollow: true, wall: 1.6, top: 1.6, ribPitch: 12, ribT: 1.2, clearance: 0.3, centerWall: 1.2 };

const CENTER_GAP = 0.3; // folga da tela até a parede de centralização
export const CLEARANCE_RANGE = [0.2, 0.4] as const;

/** Folga total do molde em volta da tela já prensada: espessura da tela + folga. */
export const moldGap = (sheetT: number, m: Pick<MoldParams, "clearance">) => sheetT + m.clearance;

/** Grade de reforços (nervuras) cobrindo a caixa do desenho: a cavidade vira células de ~12 mm, que o fatiador faz sem suporte. */
function ribGrid(M: ManifoldToplevel, sil: CS, m: MoldParams, k: K): CS {
  const b = sil.bounds();
  const lines: CS[] = [];
  const x0 = Math.ceil(b.min[0] / m.ribPitch) * m.ribPitch, y0 = Math.ceil(b.min[1] / m.ribPitch) * m.ribPitch;
  for (let x = x0; x <= b.max[0]; x += m.ribPitch) lines.push(k(k(M.CrossSection.square([m.ribT, b.max[1] - b.min[1] + 2], false)).translate([x - m.ribT / 2, b.min[1] - 1])));
  for (let y = y0; y <= b.max[1]; y += m.ribPitch) lines.push(k(k(M.CrossSection.square([b.max[0] - b.min[0] + 2, m.ribT], false)).translate([b.min[0] - 1, y - m.ribT / 2])));
  return lines.length ? k(M.CrossSection.union(lines)) : k(M.CrossSection.square([0.001, 0.001]));
}

/**
 * Molde em domo: base plana com borda de apoio (`outline` + `flange`) e o domo por cima, a partir de `sil`. Oco por dentro (casca de `wall` mm + nervuras) para
 * gastar bem menos filamento; a cavidade não chega ao topo (fica `top` mm de teto). Quem chama apaga o resultado.
 */
export function buildMoldSolid(M: ManifoldToplevel, sil: CS, g: DomeGeo, m: MoldParams, k: K, outline: CS = sil, sheetT = 0): Solid {
  const base = k(k(outline.offset(m.flange, "Round")).extrude(m.flangeT));
  const dome = k(domeStack(M, sil, g, 0, k).translate([0, 0, m.flangeT - 0.01]));
  // parede baixa em volta da tela (da altura dela): centraliza a tela no apoio e a fêmea assenta em cima
  const wall = sheetT > 0 && m.centerWall > 0 ? k(k(k(k(outline.offset(CENTER_GAP + m.centerWall, "Round")).subtract(k(outline.offset(CENTER_GAP, "Round")))).extrude(sheetT + 0.01)).translate([0, 0, m.flangeT - 0.01])) : null;
  const solid = k(M.Manifold.union(wall ? [base, dome, wall] : [base, dome]));
  if (!m.hollow) return solid;
  const ribs = ribGrid(M, sil, m, k);
  const zMax = g.H - m.top;
  const n = sliceCount(zMax);
  const dz = zMax / n;
  const cells: Solid[] = [];
  for (let i = 0; i < n; i++) {
    const z0 = i * dz;
    const shape = k(sil.offset(-m.wall - insetAt(z0, g), "Round"));
    if (shape.isEmpty() || shape.area() < 1) break;
    const open = k(shape.subtract(ribs));
    if (open.isEmpty()) continue;
    cells.push(k(k(open.extrude(dz + 0.001)).translate([0, 0, m.flangeT + z0])));
  }
  if (!cells.length) return solid;
  return k(solid.subtract(k(M.Manifold.union(cells))));
}

/**
 * Molde fêmea, na posição de impressão (a abertura da cavidade para cima). A cavidade é o domo do macho afastado da folga
 * (espessura da tela + folga), e a borda assenta na parede de centralização do macho, a uma espessura de tela acima do apoio.
 * Ao prensar, vira de cabeça para baixo sobre a tela quente (`inPlace` devolve a fêmea já nessa posição, sobre o macho, para conferir a folga).
 * O resultado já está registrado no `k` de quem chama.
 */
export function buildFemaleSolid(M: ManifoldToplevel, sil: CS, g: DomeGeo, m: MoldParams, k: K, outline: CS, sheetT: number, inPlace = false): Solid {
  const e = moldGap(sheetT, m);
  const cavity = k(domeStack(M, sil, g, e, k).translate([0, 0, m.flangeT - 0.01]));
  const rim = m.flangeT + sheetT; // altura do plano de apoio da fêmea, nas coordenadas do macho
  const top = m.flangeT + g.H + e + m.top;
  const block = k(k(k(outline.offset(m.flange, "Round")).extrude(top - rim)).translate([0, 0, rim]));
  const solid = k(block.subtract(cavity));
  if (inPlace) return solid;
  return k(k(solid.mirror([0, 0, 1])).translate([0, 0, top]));
}
