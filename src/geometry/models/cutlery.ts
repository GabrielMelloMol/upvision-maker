import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { moveModel, roundedRect, solidMesh } from "./common";
import { RAIL_WIDTH, type TrayPlan } from "./cutleryPlan";
import { pinHoles, splitToBed } from "./splitBed";

/*
 * Peças do organizador de talheres em 2 andares (#140): a bandeja (divisões com cantos redondos para limpar, rampa
 * para os dedos, alças) e os trilhos em que ela apoia ou desliza. Recomendado em PETG (água quente, detergente).
 */
const WALL = 2;
const FLOOR = 2;
const DIV = 1.6;
const CORNER = 6; // raio dos cantos internos
const SCOOP = 14; // rampa para os dedos na frente de cada divisão
const HANDLE_R = 16;
const RAIL = { post: 3, foot: 2, ledge: 2 };
const PIN_R = 0.95; // filamento de 1,75 como pino
const GAP = 10;

/** Bandeja com as divisões da plano, apoiada no chão (frente em −Y). */
export function buildTray(M: ManifoldToplevel, t: TrayPlan, depth: number, height: number, color: string): Model {
  return scoped((k) => {
    const W = t.width, D = depth;
    let s: Solid = k(k(k(roundedRect(M, W, D, CORNER)).extrude(height)).translate([W / 2, D / 2, 0]));
    // divisões: cada uma um bolso de cantos redondos, do fundo até em cima
    const inner = W - 2 * WALL - DIV * (t.lanes.length - 1);
    const total = t.lanes.reduce((a, l) => a + l.width, 0);
    let x = WALL;
    const pockets: Solid[] = [];
    const scoops: Solid[] = [];
    for (const l of t.lanes) {
      const w = (l.width / total) * inner;
      const pocket = k(roundedRect(M, w, D - 2 * WALL, Math.min(CORNER, w / 2 - 0.1)));
      pockets.push(k(k(pocket.extrude(height)).translate([x + w / 2, D / 2, FLOOR])));
      // rampa: quarto de cilindro no pé da parede da frente, ao longo da largura da divisão
      const r = Math.min(SCOOP, (height - FLOOR) / 2);
      const quarter = k(k(M.CrossSection.square([r, r])).subtract(k(k(M.CrossSection.circle(r, 48)).translate([r, r]))));
      scoops.push(k(k(k(quarter.extrude(w)).rotate([90, 0, 90])).translate([x, WALL, FLOOR])));
      x += w + DIV;
    }
    s = k(s.subtract(k(M.Manifold.union(pockets))));
    s = k(s.add(k(M.Manifold.union(scoops))));
    // alças: meia-lua no topo das paredes da frente e de trás, para puxar ou levantar
    const handle = k(k(k(M.CrossSection.circle(HANDLE_R, 48)).extrude(D + 2)).rotate([90, 0, 0]));
    s = k(s.subtract(k(handle.translate([W / 2, D + 1, height]))));
    return { name: "Bandeja", parts: [{ name: "Bandeja", color, mesh: solidMesh(s) }] };
  });
}

/** Perfil do trilho (em U), deitado na mesa sobre a face de fora: vão = altura do andar de baixo. */
export function railProfileAt(lowerHeight: number): { cs: (M: ManifoldToplevel) => CS; span: number } {
  return {
    span: lowerHeight,
    cs: (M) =>
      scoped((k) =>
        M.CrossSection.union([
          k(M.CrossSection.square([lowerHeight, RAIL.post])), // costas (encosta na lateral da gaveta), deitadas na mesa
          k(M.CrossSection.square([RAIL.foot, RAIL_WIDTH])), // pé, no chão da gaveta
          k(M.CrossSection.square([RAIL.ledge, RAIL_WIDTH]).translate([lowerHeight - RAIL.ledge, 0])), // apoio da bandeja
        ]),
      ),
  };
}

/** Um trilho do comprimento pedido, deitado, com o perfil ao longo de X. */
function railSolid(M: ManifoldToplevel, length: number, lowerHeight: number): Solid {
  return scoped((k) => {
    const prof = k(railProfileAt(lowerHeight).cs(M));
    // perfil no plano YZ (y = altura na gaveta, z = espessura na mesa), extrudado ao longo de X
    return k(k(prof.extrude(length)).rotate([90, 0, 90])).translate([0, 0, 0]);
  });
}

/**
 * Trilhos das duas laterais, do comprimento da gaveta (menos 2 mm), cortados em pedaços que cabem na mesa com
 * furos para um pedaço de filamento alinhar a emenda.
 */
export function buildRails(M: ManifoldToplevel, depth: number, lowerHeight: number, color: string): Model[] {
  return scoped((k) => {
    const length = depth - 2;
    let rail = k(railSolid(M, length, lowerHeight));
    rail = k(pinHoles(M, rail, bedMm(), PIN_R, RAIL.post / 2));
    const pieces = splitToBed(M, rail, bedMm()).map(k);
    const out: Model[] = [];
    let y = 0;
    for (const side of ["esquerdo", "direito"])
      pieces.forEach((p, i) => {
        const b = p.boundingBox();
        const m: Model = { name: `Trilho ${side} ${i + 1}`, parts: [{ name: "Trilho", color, mesh: solidMesh(p) }] };
        out.push(moveModel(m, -b.min[0], y - b.min[1]));
        y += RAIL_WIDTH + lowerHeight * 0 + (b.max[1] - b.min[1]) + GAP;
      });
    return out;
  });
}

/** Peça de teste: trilho curto e um canto de bandeja, para conferir a folga antes de imprimir tudo. */
export function buildRailTest(M: ManifoldToplevel, lowerHeight: number, color: string): Model[] {
  return scoped((k) => {
    const rail = k(railSolid(M, 40, lowerHeight));
    const corner = k(k(k(roundedRect(M, 40, 40, CORNER)).extrude(FLOOR + 4)).translate([20, 20, 0]));
    const hollow = k(corner.subtract(k(k(k(roundedRect(M, 40 - 2 * WALL, 40 - 2 * WALL, CORNER - WALL)).extrude(10)).translate([20, 20, FLOOR]))));
    const b = rail.boundingBox();
    return [
      { name: "Teste do trilho", parts: [{ name: "Trilho", color, mesh: solidMesh(rail) }] },
      moveModel({ name: "Canto da bandeja", parts: [{ name: "Bandeja", color, mesh: solidMesh(hollow) }] }, 0, b.max[1] + GAP),
    ];
  });
}

/**
 * Trilho em pé, como fica na gaveta (para a prévia montada): costas em x = 0 subindo até `lowerHeight`, pé e apoio
 * da bandeja para +X, ao longo de −Y a partir de y = 0.
 */
export function railUpright(M: ManifoldToplevel, length: number, lowerHeight: number): Solid {
  return scoped((k) => {
    const prof = k(
      M.CrossSection.union([
        k(M.CrossSection.square([RAIL.post, lowerHeight])),
        k(M.CrossSection.square([RAIL_WIDTH, RAIL.foot])),
        k(M.CrossSection.square([RAIL_WIDTH, RAIL.ledge]).translate([0, lowerHeight - RAIL.ledge])),
      ]),
    );
    // perfil em (x, y) → extrudado em z → girado 90° em X: (x, y, z) → (x, −z, y), então y vira a altura
    return k(prof.extrude(length)).rotate([90, 0, 0]);
  });
}
