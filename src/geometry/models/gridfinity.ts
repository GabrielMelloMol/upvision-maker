import type { ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { moveModel, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

/*
 * Gridfinity (#93): geometria nossa, a partir das medidas públicas da especificação aberta.
 * Grade de 42 mm, altura em unidades de 7 mm; a caixinha tem 0,5 mm de folga (41,5 mm por unidade).
 */
export const GRID = 42;
export const HEIGHT_UNIT = 7;
const BIN_GAP = 0.5;
const BIN_R = 3.75; // canto da caixinha
const BASE_R = 4; // canto da base
// perfil do pé (de baixo para cima): chanfro 0,8 · reto 1,8 · chanfro 2,15 = 4,75 mm
const FOOT = [0.8, 1.8, 2.15] as const;
export const FOOT_H = FOOT[0] + FOOT[1] + FOOT[2];
// perfil da base (de baixo para cima): chanfro 0,7 · reto 1,8 · chanfro 2,15 = 4,65 mm
const PLATE = [0.7, 1.8, 2.15] as const;
export const PLATE_H = PLATE[0] + PLATE[1] + PLATE[2];
// borda empilhável (de baixo para cima): chanfro 1,9 · reto 1,8 · chanfro 0,7 = 4,4 mm
const LIP = [1.9, 1.8, 0.7] as const;
export const LIP_H = LIP[0] + LIP[1] + LIP[2];
const MAGNET_D = 6.5;
const MAGNET_H = 2.4;
const SCREW_D = 3;
const HOLE_OFFSET = 13; // furos a ±13 mm do centro de cada casa
const EPS = 0.01;
const LABEL_W = 13; // aba da etiqueta
const BED_MM = 256;

export type GridBinParams = {
  unitsX: number;
  unitsY: number;
  unitsZ: number;
  dividersX: number; // compartimentos no sentido X (1 = sem divisória)
  dividersY: number;
  wall: number;
  floor: number;
  lip: boolean; // borda empilhável
  labelTab: boolean;
  scoop: boolean; // rampa na frente para pegar peças pequenas
  magnets: boolean;
  screws: boolean;
  label: string; // etiqueta impressa à parte (vazio = sem)
  binColor: string;
  labelColor: string;
  textColor: string;
};

export const DEFAULT_GRID_BIN: GridBinParams = {
  unitsX: 2,
  unitsY: 1,
  unitsZ: 3,
  dividersX: 2,
  dividersY: 1,
  wall: 1.2,
  floor: 1.2,
  lip: true,
  labelTab: true,
  scoop: true,
  magnets: false,
  screws: false,
  label: "Parafusos",
  binColor: "#2563eb",
  labelColor: "#f8f8f6",
  textColor: "#1c1c1e",
};

export type GridBaseParams = { unitsX: number; unitsY: number; magnets: boolean; color: string };
export const DEFAULT_GRID_BASE: GridBaseParams = { unitsX: 4, unitsY: 3, magnets: false, color: "#1c1c1e" };

type K = <D extends { delete(): void }>(o: D) => D;

/** Retângulo arredondado de lados `w`×`h` encolhido `inset` em cada lado (raio encolhe junto), numa fatia fina em `z`. */
function layer(M: ManifoldToplevel, k: K, w: number, h: number, r: number, inset: number, z: number): Solid {
  const cs = k(roundedRect(M, w - 2 * inset, h - 2 * inset, Math.max(0.1, r - inset)));
  return k(k(cs.extrude(EPS)).translate([0, 0, z]));
}

/**
 * Sólido com perfil em degraus: lista de [z, inset] de baixo para cima; entre dois níveis é o casco (chanfro reto
 * quando o inset muda, parede reta quando não muda).
 */
function profileSolid(M: ManifoldToplevel, k: K, w: number, h: number, r: number, levels: [number, number][]): Solid {
  const segs: Solid[] = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const [z0, i0] = levels[i], [z1, i1] = levels[i + 1];
    segs.push(k(M.Manifold.hull([layer(M, k, w, h, r, i0, z0), layer(M, k, w, h, r, i1, z1 - EPS)])));
  }
  return k(M.Manifold.union(segs));
}

/** Pé de uma casa (41,5 mm), centrado na origem. */
function foot(M: ManifoldToplevel, k: K): Solid {
  const s = GRID - BIN_GAP;
  const [c1, v, c2] = FOOT;
  return profileSolid(M, k, s, s, BIN_R, [
    [0, c1 + c2],
    [c1, c2],
    [c1 + v, c2],
    [FOOT_H + EPS, 0],
  ]);
}

/** Centros das casas de uma grade nx×ny centrada na origem. */
export function cellCenters(nx: number, ny: number): [number, number][] {
  return Array.from({ length: nx * ny }, (_, i) => [(i % nx - (nx - 1) / 2) * GRID, (Math.floor(i / nx) - (ny - 1) / 2) * GRID]);
}

/**
 * Caixinha Gridfinity: pés por casa (com furos de ímã/parafuso opcionais), corpo oco com parede e fundo, divisórias,
 * aba de etiqueta, rampa de pegar e borda empilhável. Etiqueta com texto sai como peça à parte (2 cores).
 */
export function buildGridBin({ M, text }: ModelCtx, p: GridBinParams): ModelOutput {
  return scoped((k) => {
    const nx = Math.round(p.unitsX), ny = Math.round(p.unitsY);
    const W = nx * GRID - BIN_GAP, D = ny * GRID - BIN_GAP;
    const H = Math.round(p.unitsZ) * HEIGHT_UNIT; // altura do topo da parede (a borda empilhável sobe além)
    const warnings: string[] = [];
    let feet = k(M.Manifold.union(cellCenters(nx, ny).map(([x, y]) => k(foot(M, k).translate([x, y, 0])))));
    if (p.magnets || p.screws) {
      const holes: Solid[] = [];
      for (const [cx, cy] of cellCenters(nx, ny))
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const at: [number, number, number] = [cx + dx * HOLE_OFFSET, cy + dy * HOLE_OFFSET, -EPS];
          if (p.magnets) holes.push(k(k(M.Manifold.cylinder(MAGNET_H + EPS, MAGNET_D / 2, MAGNET_D / 2, 32)).translate(at)));
          if (p.screws) holes.push(k(k(M.Manifold.cylinder(FOOT_H, SCREW_D / 2, SCREW_D / 2, 24)).translate(at)));
        }
      feet = k(feet.subtract(k(M.Manifold.union(holes))));
    }
    const outer = k(roundedRect(M, W, D, BIN_R));
    const inner = k(outer.offset(-p.wall, "Round"));
    if (H <= FOOT_H + p.floor) throw new Error("Altura pequena demais: use pelo menos 2 unidades.");
    let body = k(k(k(outer.extrude(H - FOOT_H)).translate([0, 0, FOOT_H])).subtract(k(k(inner.extrude(H)).translate([0, 0, FOOT_H + p.floor]))));
    const floorZ = FOOT_H + p.floor;
    const iw = W - 2 * p.wall, id = D - 2 * p.wall;
    // divisórias: paredes finas cheias até o topo da parede
    const cuts: Solid[] = [];
    for (let i = 1; i < Math.round(p.dividersX); i++) cuts.push(k(k(M.Manifold.cube([p.wall, id, H - floorZ])).translate([-iw / 2 + (iw * i) / p.dividersX - p.wall / 2, -id / 2, floorZ])));
    for (let j = 1; j < Math.round(p.dividersY); j++) cuts.push(k(k(M.Manifold.cube([iw, p.wall, H - floorZ])).translate([-iw / 2, -id / 2 + (id * j) / p.dividersY - p.wall / 2, floorZ])));
    if (cuts.length) body = k(body.add(k(M.Manifold.union(cuts))));
    if (p.labelTab) {
      // aba na parede de trás, topo reto na altura da parede e 45° por baixo (imprime sem suporte).
      // perfil desenhado em (y, z) e extrudado ao longo de X: rotate([90, 0, 90]) leva x→Y, y→Z, z→X
      const tab = k(new M.CrossSection([[[0, 0], [0, -LABEL_W], [-LABEL_W, 0]]], "NonZero"));
      body = k(body.add(k(k(k(tab.extrude(iw)).rotate([90, 0, 90])).translate([-iw / 2, id / 2, H]))));
    }
    if (p.scoop) {
      // rampa de raio ~ 1/3 da altura no pé da parede da frente
      const r = Math.min((H - floorZ) / 3, id / 3);
      const sq = k(M.CrossSection.square([r, r]));
      const round = k(sq.subtract(k(k(M.CrossSection.circle(r, 48)).translate([r, r]))));
      body = k(body.add(k(k(k(round.extrude(iw)).rotate([90, 0, 90])).translate([-iw / 2, -id / 2, floorZ]))));
    }
    if (p.lip) {
      // borda empilhável: o pé de outra caixinha encaixa por cima
      const [c1, v, c2] = LIP;
      const shell = k(k(outer.extrude(LIP_H)).translate([0, 0, H]));
      const cavity = profileSolid(M, k, W, D, BIN_R, [
        [H - EPS, c1 + c2 + 0.001],
        [H + c1, c2],
        [H + c1 + v, c2],
        [H + LIP_H + EPS, 0],
      ]);
      body = k(body.add(k(shell.subtract(cavity))));
      if (c1 + c2 < p.wall) warnings.push("Parede mais grossa que a borda empilhável: a borda fica com degrau por dentro.");
    }
    const bin = k(feet.add(body));
    const models: Model[] = [{ name: "Caixinha", parts: [{ name: "Caixinha", color: p.binColor, mesh: solidMesh(bin) }] }];
    const raw = p.label.trim() ? text(p.label, 6) : null;
    if (raw) {
      // etiqueta: plaquinha na largura de um compartimento, com o texto em relevo noutra cor
      const lw = Math.min(iw / Math.max(1, Math.round(p.dividersX)) - 2, 80), lh = LABEL_W - 2;
      const plate = k(roundedRect(M, lw, lh, 1.5));
      const t = k(fitInto(k(raw), lw - 3, lh - 3, 0));
      const parts: Part[] = [
        { name: "Etiqueta", color: p.labelColor, mesh: slab(plate, 1) },
        { name: "Texto", color: p.textColor, mesh: slab(t, 0.6, 1) },
      ];
      models.push(moveModel({ name: `Etiqueta ${p.label.trim()}`, parts }, 0, -D / 2 - 8 - lh / 2));
    }
    if (Math.max(W, D) > BED_MM) warnings.push(`A caixinha tem ${Math.round(Math.max(W, D))} mm: passa da mesa de ${BED_MM} mm.`);
    return { models, warnings };
  });
}

/** Quantas casas cabem por pedaço da base na mesa. */
const cellsPerPiece = Math.floor((BED_MM - 6) / GRID);

/**
 * Base Gridfinity: placa com um encaixe por casa (perfil da especificação), aberta embaixo, ou com fundo e furos
 * de ímã. Maior que a mesa, sai em pedaços cortados nas divisas das casas.
 */
export function buildGridBase({ M }: ModelCtx, p: GridBaseParams): ModelOutput {
  return scoped((k) => {
    const nx = Math.round(p.unitsX), ny = Math.round(p.unitsY);
    const [c1, v, c2] = PLATE;
    const floor = p.magnets ? MAGNET_H + 0.8 : 0;
    const pocket = profileSolid(M, k, GRID, GRID, BASE_R, [
      [floor - EPS, c1 + c2],
      [floor + c1, c2],
      [floor + c1 + v, c2],
      [floor + PLATE_H + EPS, 0],
    ]);
    const pieces: Model[] = [];
    // pedaços de até `cellsPerPiece` casas por lado, cortados nas divisas
    const sx = Math.ceil(nx / cellsPerPiece), sy = Math.ceil(ny / cellsPerPiece);
    const splitCounts = (n: number, s: number) => Array.from({ length: s }, (_, i) => Math.floor((n * (i + 1)) / s) - Math.floor((n * i) / s));
    const xs = splitCounts(nx, sx), ys = splitCounts(ny, sy);
    let oy = 0;
    ys.forEach((cy) => {
      let ox = 0;
      xs.forEach((cx) => {
        const w = cx * GRID, d = cy * GRID;
        let plate = k(k(roundedRect(M, w, d, BASE_R)).extrude(floor + PLATE_H));
        const holes = cellCenters(cx, cy).map(([x, y]) => k(pocket.translate([x, y, 0])));
        plate = k(plate.subtract(k(M.Manifold.union(holes))));
        if (p.magnets) {
          const mags = cellCenters(cx, cy).flatMap(([x, y]) =>
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => k(k(M.Manifold.cylinder(MAGNET_H + EPS, MAGNET_D / 2, MAGNET_D / 2, 32)).translate([x + a * HOLE_OFFSET, y + b * HOLE_OFFSET, floor - MAGNET_H]))),
          );
          plate = k(plate.subtract(k(M.Manifold.union(mags))));
        }
        const name = sx * sy > 1 ? `Base ${pieces.length + 1}` : "Base";
        // pedaços lado a lado com 10 mm entre eles (cada um cabe na mesa)
        pieces.push(moveModel({ name, parts: [{ name: "Base", color: p.color, mesh: solidMesh(plate) }] }, ox + w / 2, -(oy + d / 2)));
        ox += w + 10;
      });
      oy += cy * GRID + 10;
    });
    const warnings = sx * sy > 1 ? [`Base de ${nx}×${ny} casas não cabe inteira na mesa: saiu em ${sx * sy} pedaços cortados nas divisas das casas.`] : [];
    return { models: pieces, warnings };
  });
}

