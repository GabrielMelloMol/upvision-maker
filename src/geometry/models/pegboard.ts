import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { moveModel, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

/*
 * Painel perfurado (#214) e os ganchos para ele. O painel imprime de frente para baixo (os espaçadores de trás apontam
 * para cima, sem suporte) e, se passa da mesa, sai em ladrilhos cortados entre as colunas de furos (cada um com seus
 * parafusos). Os ganchos imprimem deitados, com o pino redondo no diâmetro do furo menos uma folga.
 */
export type PegboardParams = {
  width: number; // largura desejada do painel (vira um número inteiro de colunas)
  height: number;
  pitch: number; // distância entre os furos
  hole: number; // diâmetro dos furos
  thickness: number;
  standoff: number; // espaçador atrás dos parafusos, para os pinos dos ganchos passarem (0 = sem)
  screws: boolean; // furos de parafuso (com rebaixo) nos cantos de cada ladrilho
  color: string;
};

export const DEFAULT_PEGBOARD: PegboardParams = { width: 250, height: 200, pitch: 25, hole: 6, thickness: 5, standoff: 12, screws: true, color: "#f5f5f0" };

const CORNER = 3;
const SCREW_D = 4.5;
const CSK_D = 9;
const SPACER_D = 13;
const MIDDLE_EVERY = 8; // parafuso extra no meio das bordas compridas (a cada 8 colunas ou linhas)
const TILE_MARGIN = 6; // sobra da mesa
const TILE_GAP = 8;
const SEG = 40;

/** Número de colunas e linhas do painel (de furos), pelo tamanho pedido e o passo. */
export const gridOf = (p: Pick<PegboardParams, "width" | "height" | "pitch">) => ({ cols: Math.max(2, Math.round(p.width / p.pitch)), rows: Math.max(2, Math.round(p.height / p.pitch)) });

/** Quantas colunas e linhas cabem num ladrilho da mesa. */
export const tileMax = (pitch: number) => Math.max(2, Math.floor((bedMm() - TILE_MARGIN) / pitch));

/** Posições espaçadas por igual no meio de uma borda de `n` casas, uma a cada ~8. */
const middles = (n: number) => {
  const extra = Math.floor((n - 1) / MIDDLE_EVERY);
  return Array.from({ length: extra }, (_, i) => Math.round(((i + 1) * (n - 1)) / (extra + 1)));
};

/** Posições (coluna, linha) dos parafusos de um ladrilho: os 4 cantos e, em bordas longas, mais alguns no meio. */
export function screwCells(cols: number, rows: number): [number, number][] {
  const cs = new Set<string>();
  const xs = [0, cols - 1, ...middles(cols)];
  const ys = [0, rows - 1, ...middles(rows)];
  for (const x of xs) for (const y of [0, rows - 1]) cs.add(`${x},${y}`);
  for (const y of ys) for (const x of [0, cols - 1]) cs.add(`${x},${y}`);
  return [...cs].map((c) => c.split(",").map(Number) as [number, number]);
}

function tile(M: ManifoldToplevel, p: PegboardParams, cols: number, rows: number): Solid {
  return scoped((k) => {
    const W = cols * p.pitch, H = rows * p.pitch;
    const at = (c: number, r: number): [number, number] => [(c + 0.5) * p.pitch, (r + 0.5) * p.pitch];
    const screws = p.screws ? screwCells(cols, rows) : [];
    const isScrew = new Set(screws.map(([c, r]) => `${c},${r}`));
    const holes: CS[] = [];
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) if (!isScrew.has(`${c},${r}`)) holes.push(k(k(M.CrossSection.circle(p.hole / 2, SEG)).translate(at(c, r))));
    let body: Solid = k(k(k(roundedRect(M, W, H, CORNER)).extrude(p.thickness)).translate([W / 2, H / 2, 0]));
    if (holes.length) body = k(body.subtract(k(k(M.CrossSection.union(holes)).extrude(p.thickness + 2).translate([0, 0, -1]))));
    if (screws.length) {
      const pos = screws.map(([c, r]) => at(c, r));
      if (p.standoff > 0) {
        const spacers = pos.map(([x, y]) => k(k(M.Manifold.cylinder(p.standoff + 0.01, SPACER_D / 2, SPACER_D / 2, SEG)).translate([x, y, p.thickness - 0.01])));
        body = k(body.add(k(M.Manifold.union(spacers))));
      }
      const through = p.thickness + p.standoff + 2;
      const cuts = pos.flatMap(([x, y]) => [
        k(k(M.Manifold.cylinder(through, SCREW_D / 2, SCREW_D / 2, 24)).translate([x, y, -1])),
        // rebaixo cônico na face da frente (a que fica na mesa): o parafuso de cabeça chata assenta rente
        k(k(M.Manifold.cylinder(2.4, CSK_D / 2, SCREW_D / 2, 24)).translate([x, y, -0.01])),
      ]);
      body = k(body.subtract(k(M.Manifold.union(cuts))));
    }
    return body.translate([0, 0, 0]); // cópia: o `body` está no k e some ao sair
  });
}

/** Painel perfurado em ladrilhos que cabem na mesa (um só quando cabe). */
export function buildPegboard(ctx: ModelCtx, p: PegboardParams): ModelOutput {
  const { M } = ctx;
  const { cols, rows } = gridOf(p);
  const max = tileMax(p.pitch);
  const nx = Math.ceil(cols / max), ny = Math.ceil(rows / max);
  const colsOf = (i: number) => Math.floor(cols / nx) + (i < cols % nx ? 1 : 0);
  const rowsOf = (j: number) => Math.floor(rows / ny) + (j < rows % ny ? 1 : 0);
  const models: Model[] = [];
  let y = 0;
  for (let j = 0; j < ny; j++) {
    let x = 0;
    for (let i = 0; i < nx; i++) {
      const t = tile(M, p, colsOf(i), rowsOf(j));
      const m = moveModel({ name: nx * ny > 1 ? `Painel ${j * nx + i + 1} de ${nx * ny}` : "Painel", parts: [{ name: "Painel", color: p.color, mesh: solidMesh(t) }] }, x, y);
      t.delete();
      models.push(m);
      x += colsOf(i) * p.pitch + TILE_GAP;
    }
    y += rowsOf(j) * p.pitch + TILE_GAP;
  }
  const warnings: string[] = [];
  if (nx * ny > 1) warnings.push(`O painel passa da mesa e sai em ${nx * ny} ladrilhos cortados entre as colunas de furos. Parafuse todos na parede encostados uns nos outros.`);
  return { models, warnings };
}

export type HookKind = "j" | "double" | "rod";
export type PegHooksParams = {
  kind: HookKind;
  count: number;
  length: number; // comprimento do braço que sai do painel
  lip: number; // altura da ponta virada para cima (gancho em J)
  hole: number; // diâmetro do furo do painel
  pitch: number; // distância entre os furos (gancho duplo)
  thickness: number; // espessura do painel (o pino atravessa e sobra um pouco)
  color: string;
};

export const DEFAULT_PEG_HOOKS: PegHooksParams = { kind: "j", count: 6, length: 45, lip: 18, hole: 6, pitch: 25, thickness: 5, color: "#f97316" };

const PEG_CLEAR = 0.4; // folga do pino no furo
const PEG_PROUD = 5; // quanto o pino passa do outro lado do painel
const ARM_W = 9;
const ARM_T = 5.6;
const ROW_GAP = 6;

/** Um gancho deitado: pino redondo ao longo de x, braço para +x e, no J, a ponta para +y. */
function oneHook(M: ManifoldToplevel, p: PegHooksParams): Solid {
  return scoped((k) => {
    const r = (p.hole - PEG_CLEAR) / 2;
    const pegLen = p.thickness + PEG_PROUD;
    const parts: Solid[] = [];
    const peg = (y: number) => k(k(k(M.Manifold.cylinder(pegLen + 1, r, r, 32)).rotate([0, 90, 0])).translate([0, y, r]));
    const ys = p.kind === "double" ? [0, p.pitch] : [0];
    for (const y of ys) parts.push(peg(y));
    const armY = p.kind === "double" ? p.pitch / 2 : 0;
    const head = p.kind === "double" ? p.pitch + ARM_W : ARM_W;
    // cabeça: trava o pino na frente do painel
    parts.push(k(k(M.Manifold.cube([ARM_W, head, ARM_T], false)).translate([pegLen, ys[0] - ARM_W / 2, 0])));
    if (p.kind === "rod") {
      parts.push(k(k(k(M.Manifold.cylinder(p.length, r, r, 32)).rotate([0, 90, 0])).translate([pegLen, armY, r])));
      parts.push(k(k(M.Manifold.sphere(r * 1.15, 24)).translate([pegLen + p.length, armY, r * 1.15])));
    } else {
      parts.push(k(k(M.Manifold.cube([p.length, ARM_W, ARM_T], false)).translate([pegLen, armY - ARM_W / 2, 0])));
      parts.push(k(k(M.Manifold.cube([ARM_W, p.lip + ARM_W, ARM_T], false)).translate([pegLen + p.length - ARM_W, armY - ARM_W / 2, 0])));
    }
    return M.Manifold.union(parts);
  });
}

/** Ganchos para o painel: várias cópias do mesmo gancho, em fileiras na mesa. */
export function buildPegHooks(ctx: ModelCtx, p: PegHooksParams): ModelOutput {
  const { M } = ctx;
  const one = oneHook(M, p);
  const b = one.boundingBox();
  const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
  const usable = bedMm() - TILE_MARGIN;
  const perRow = Math.max(1, Math.floor((usable + ROW_GAP) / (w + ROW_GAP)));
  const copies: Solid[] = [];
  for (let i = 0; i < p.count; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    copies.push(one.translate([col * (w + ROW_GAP) - b.min[0], row * (h + ROW_GAP) - b.min[1], 0]));
  }
  const rowsUsed = Math.ceil(p.count / perRow);
  const perPlate = perRow * Math.max(1, Math.floor((usable + ROW_GAP) / (h + ROW_GAP)));
  const warnings = rowsUsed * (h + ROW_GAP) - ROW_GAP > usable ? [`Só cabem ${perPlate} ganchos por mesa: imprima ${Math.ceil(p.count / perPlate)} vezes ou peça menos.`] : [];
  const all = M.Manifold.union(copies);
  const mesh = solidMesh(all);
  for (const c of [one, ...copies, all]) c.delete();
  return { models: [{ name: "Ganchos", parts: [{ name: "Ganchos", color: p.color, mesh }] }], warnings };
}
