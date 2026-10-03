import { bedMm } from "../bed";
import type { ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { moveModel, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { BED_MARGIN, drawerPlan, GRID, HEIGHT_UNIT, planSummary, splitAxis, type DrawerAlign } from "./gridDrawer";

/*
 * Gridfinity (#93): geometria nossa, a partir das medidas públicas da especificação aberta.
 * Grade de 42 mm, altura em unidades de 7 mm; a caixinha tem 0,5 mm de folga (41,5 mm por unidade).
 */
export { GRID, HEIGHT_UNIT };
export const BIN_GAP = 0.5;
export const BIN_R = 3.75; // canto da caixinha
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
// o pé da caixinha de cima desce 0,35 abaixo do topo da parede: a aba fica 1 mm abaixo para não levantá-la (#140)
const TAB_DROP = 1;
const PIECE_GAP = 10; // entre os pedaços da base na mesa

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

export type GridBaseParams = {
  unitsX: number;
  unitsY: number;
  magnets: boolean;
  color: string;
  /** "drawer": casas e margem calculadas pelas medidas da gaveta (#140). */
  mode?: "cells" | "drawer";
  drawerW?: number;
  drawerD?: number;
  drawerH?: number;
  align?: DrawerAlign;
  /** Quanto a mesa perde nas bordas (saia/brim): 4 mm dá 6 casas por pedaço na A1. */
  bedMargin?: number;
  /** Afastamento entre os pedaços (0 = montada, como na gaveta). */
  pieceGap?: number;
};
export const DEFAULT_GRID_BASE: GridBaseParams = { unitsX: 4, unitsY: 3, magnets: false, color: "#1c1c1e", mode: "cells", drawerW: 500, drawerD: 420, drawerH: 80, align: "center", bedMargin: BED_MARGIN };

export type K = <D extends { delete(): void }>(o: D) => D;

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

/** Pés de uma grade nx×ny centrada na origem (z de 0 a FOOT_H), no escopo `k` de quem chama. */
export function gridFeet(M: ManifoldToplevel, k: K, nx: number, ny: number): Solid {
  return k(M.Manifold.union(cellCenters(nx, ny).map(([x, y]) => k(foot(M, k).translate([x, y, 0])))));
}

/**
 * Borda de empilhar (perfil da especificação) em cima de uma caixinha W×D com o topo da parede em H: o pé de outra
 * caixinha encaixa nela. `wall`: parede da caixinha (decide o apoio de 45° por baixo da borda).
 */
export function stackingLip(M: ManifoldToplevel, k: K, W: number, D: number, H: number, wall: number): Solid {
  const [c1, v, c2] = LIP;
  // apoio de 45° por baixo da borda (#140): sem ele a borda começa 1,4 mm para dentro da parede, no ar
  const support = Math.max(0, c1 + c2 - wall);
  const outer = k(roundedRect(M, W, D, BIN_R));
  const shell = k(k(outer.extrude(LIP_H + support)).translate([0, 0, H - support]));
  const cavity = profileSolid(M, k, W, D, BIN_R, [
    ...(support > 0 ? ([[H - support - EPS, wall]] as [number, number][]) : []),
    [H - (support > 0 ? 0 : EPS), c1 + c2 + 0.001],
    [H + c1, c2],
    [H + c1 + v, c2],
    [H + LIP_H + EPS, 0],
  ]);
  return k(shell.subtract(cavity));
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
    let feet = gridFeet(M, k, nx, ny);
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
      body = k(body.add(k(k(k(tab.extrude(iw)).rotate([90, 0, 90])).translate([-iw / 2, id / 2, H - TAB_DROP]))));
    }
    if (p.scoop) {
      // rampa de raio ~ 1/3 da altura no pé da parede da frente
      const r = Math.min((H - floorZ) / 3, id / 3);
      const sq = k(M.CrossSection.square([r, r]));
      const round = k(sq.subtract(k(k(M.CrossSection.circle(r, 48)).translate([r, r]))));
      body = k(body.add(k(k(k(round.extrude(iw)).rotate([90, 0, 90])).translate([-iw / 2, -id / 2, floorZ]))));
    }
    if (p.lip) {
      body = k(body.add(stackingLip(M, k, W, D, H, p.wall)));
      if (LIP[0] + LIP[2] < p.wall) warnings.push("Parede mais grossa que a borda empilhável: a borda fica com degrau por dentro.");
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
    if (Math.max(W, D) > bedMm()) warnings.push(`A caixinha tem ${Math.round(Math.max(W, D))} mm: passa da mesa de ${bedMm()} mm.`);
    return { models, warnings };
  });
}

const rect = (M: ManifoldToplevel, x0: number, y0: number, x1: number, y1: number) => M.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);

/**
 * Base Gridfinity: placa com um encaixe por casa (perfil da especificação), aberta embaixo, ou com fundo e furos
 * de ímã. Por casas ou pela medida da gaveta (casas + margem por lado, #140). Maior que a mesa, sai em pedaços
 * cortados nas divisas das casas, contando a margem no pedaço da ponta; os cantos arredondados ficam só por fora.
 */
export function buildGridBase({ M }: ModelCtx, p: GridBaseParams): ModelOutput {
  return scoped((k) => {
    const warnings: string[] = [];
    const drawer = p.mode === "drawer" ? drawerPlan({ width: p.drawerW ?? 0, depth: p.drawerD ?? 0, height: p.drawerH ?? 0, align: p.align, baseFloor: p.magnets ? MAGNET_H + 0.8 : 0, bedMargin: p.bedMargin }) : null;
    const nx = drawer ? drawer.nx : Math.round(p.unitsX), ny = drawer ? drawer.ny : Math.round(p.unitsY);
    if (!nx || !ny) throw new Error("A gaveta é menor que uma casa de 42 mm.");
    const mX: [number, number] = drawer ? drawer.marginX : [0, 0], mY: [number, number] = drawer ? drawer.marginY : [0, 0];
    const bedMargin = p.bedMargin ?? BED_MARGIN;
    const xs = splitAxis(nx, mX, bedMm(), bedMargin), ys = splitAxis(ny, mY, bedMm(), bedMargin);
    const totalW = nx * GRID + mX[0] + mX[1], totalD = ny * GRID + mY[0] + mY[1];
    const [c1, v, c2] = PLATE;
    const floor = p.magnets ? MAGNET_H + 0.8 : 0;
    const pocket = profileSolid(M, k, GRID, GRID, BASE_R, [
      [floor - EPS, c1 + c2],
      [floor + c1, c2],
      [floor + c1 + v, c2],
      [floor + PLATE_H + EPS, 0],
    ]);
    // contorno da base inteira (cantos redondos só aqui); cada pedaço é um recorte reto dele
    const outline = k(k(roundedRect(M, totalW, totalD, BASE_R)).translate([totalW / 2, totalD / 2]));
    const edges = (counts: number[], m: [number, number], total: number) => {
      let c = 0;
      return counts.map((n, i) => {
        const e = { from: c, n, a: i === 0 ? 0 : m[0] + c * GRID, b: i === counts.length - 1 ? total : m[0] + (c + n) * GRID };
        c += n;
        return e;
      });
    };
    const ex = edges(xs, mX, totalW), ey = edges(ys, mY, totalD);
    const many = xs.length * ys.length > 1;
    const pieces: Model[] = [];
    ey.forEach((y, iy) =>
      ex.forEach((x, ix) => {
        let plate = k(k(outline.intersect(k(rect(M, x.a, y.a, x.b, y.b)))).extrude(floor + PLATE_H));
        const centers: [number, number][] = [];
        for (let j = y.from; j < y.from + y.n; j++) for (let i = x.from; i < x.from + x.n; i++) centers.push([mX[0] + (i + 0.5) * GRID, mY[0] + (j + 0.5) * GRID]);
        plate = k(plate.subtract(k(M.Manifold.union(centers.map(([cx, cy]) => k(pocket.translate([cx, cy, 0])))))));
        if (p.magnets) {
          const mags = centers.flatMap(([cx, cy]) =>
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => k(k(M.Manifold.cylinder(MAGNET_H + EPS, MAGNET_D / 2, MAGNET_D / 2, 32)).translate([cx + a * HOLE_OFFSET, cy + b * HOLE_OFFSET, floor - MAGNET_H]))),
          );
          plate = k(plate.subtract(k(M.Manifold.union(mags))));
        }
        // pedaços na mesma ordem da gaveta, afastados 10 mm (cada um cabe na mesa)
        const gap = p.pieceGap ?? PIECE_GAP;
        const moved = k(plate.translate([ix * gap - totalW / 2, iy * gap - totalD / 2, 0]));
        pieces.push({ name: many ? `Base ${pieces.length + 1}` : "Base", parts: [{ name: "Base", color: p.color, mesh: solidMesh(moved) }] });
      }),
    );
    if (drawer) warnings.push(planSummary(drawer, true, floor), ...drawer.notes);
    if (many && !drawer) warnings.push(`Base de ${nx}×${ny} casas não cabe inteira na mesa: saiu em ${pieces.length} pedaços cortados nas divisas das casas.`);
    return { models: pieces, warnings };
  });
}

/** Peça de teste de encaixe: base 2×1 e caixinha 1×1 baixa, para conferir a folga antes da gaveta inteira (#140). */
export function buildGridTest(ctx: ModelCtx, p: { color: string }): ModelOutput {
  const base = buildGridBase(ctx, { ...DEFAULT_GRID_BASE, unitsX: 2, unitsY: 1, color: p.color }).models[0];
  const bin = buildGridBin(ctx, { ...DEFAULT_GRID_BIN, unitsX: 1, unitsY: 1, unitsZ: 2, dividersX: 1, dividersY: 1, lip: false, labelTab: false, scoop: false, label: "", binColor: p.color }).models[0];
  return {
    models: [
      { ...base, name: "Base de teste" },
      { ...moveModel(bin, GRID + PIECE_GAP + GRID / 2, 0), name: "Caixinha de teste" },
    ],
    warnings: ["A caixinha deve entrar e sair da base sem forçar e sem folga de lado. Frouxa: a impressora está extrudando demais; não entra: de menos. Calibre o fluxo antes de imprimir a gaveta."],
  };
}
