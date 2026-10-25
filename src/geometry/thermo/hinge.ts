import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { KIT_HINGE } from "../testKit/hingeLatch";
import { axisReach } from "./screen";

type K = <D extends { delete(): void }>(o: D) => D;

/*
 * Dobradiça e trava da caixinha (#273), como na Pokébola termoformada: cada casca é colada num aro firme pela borda sólida, e os
 * dois aros saem da impressora já unidos por uma dobradiça de pino impressa montada (a do Kit de testes, com a folga validada).
 * Quadro FECHADO: a emenda em z = 0, o aro de cima (A) em 0 ≤ z ≤ RIM_T e o de baixo (B) em -RIM_T ≤ z ≤ 0, a dobradiça no eixo
 * de simetria do lado pedido e a trava do lado oposto.
 *
 * Dobradiça: três nós (A | B | A) com o eixo na emenda, um pouco além da ponta do aro. Cada aro é recortado em volta do eixo onde
 * ficam os nós do outro (raio do nó + NC): girar não muda a distância ao eixo, então nada bate em nenhum ângulo.
 * Trava: B tem uma aba na frente; A tem um braço deitado por cima dela com uma perna que desce e um gancho que pega por baixo da
 * aba. O braço flexiona para cima e a perna se abre; a rampa do gancho faz isso sozinha ao fechar. Para abrir, puxe a perna.
 */

const { kr: KR, pinR: PIN_R, klen: KLEN, axGap: AX_GAP } = KIT_HINGE;
/** Espessura de cada aro: igual ao raio do nó, para os nós apoiarem na mesa com o aro deitado. */
export const RIM_T = KR;
const RIM_OUT = 3; // o aro passa da silhueta
const RIM_IN = 1.2; // o aro para antes do começo do domo (na base, a parede do domo abre uns 0,5 mm para fora)
const POCKET = 0.3; // folga lateral da borda da casca no rebaixo
const NC = 0.4; // folga entre o nó e o aro do outro lado
const AXIS_OUT = 1.5; // o eixo fica além da ponta do aro
const UNIT = 3 * KLEN + 2 * AX_GAP;
const LATCH = { tab: 10, armW: 8, armH: 1.2, armLen: 10, legT: 1.8, gap: 0.3, below: 0.15, hookT: 0.8 } as const;

export type RimOpts = { /** espessura da tela */ t: number; /** borda sólida da tela */ border: number; side: "top" | "bottom"; /** folga radial do pino (Kit) */ hinge: number; /** avanço do gancho (Kit) */ latch: number };

export type Rims = {
  /** Aro de cima (com o pino e a trava) e o de baixo, no quadro fechado. */
  a: Solid;
  b: Solid;
  /** Só a trava (braço, perna e gancho) e o aro de cima sem ela, para os testes. */
  latch: Solid;
  aNoLatch: Solid;
  axisY: number;
  /** Sinal do giro (graus em torno de +x) que abre o aro de baixo. */
  openSign: 1 | -1;
  /** A peça que imprime: os dois aros abertos, deitados, com o rebaixo para cima, já unidos pela dobradiça. */
  printA: Solid;
  printB: Solid;
};

const box = (M: ManifoldToplevel, k: K, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Solid =>
  k(k(M.Manifold.cube([x1 - x0, Math.abs(y1 - y0), z1 - z0])).translate([x0, Math.min(y0, y1), z0]));
const cylX = (M: ManifoldToplevel, k: K, r: number, x0: number, x1: number, y: number): Solid => k(k(k(M.Manifold.cylinder(x1 - x0, r, r, 48)).rotate([0, 90, 0])).translate([x0, y, 0]));
const prism = (k: K, cs: CS, z0: number, z1: number): Solid => k(k(cs.extrude(z1 - z0)).translate([0, 0, z0]));
/** Polígono em (v, z), com v para fora do lado `f` (y = f·v), extrudado em x de -w/2 a w/2. */
function profile(M: ManifoldToplevel, k: K, pts: [number, number][], f: 1 | -1, w: number): Solid {
  const cs = k(new M.CrossSection([pts.map(([v, z]) => [f * v, z] as [number, number])], "NonZero"));
  return k(k(k(cs.extrude(w)).rotate([90, 0, 90])).translate([-w / 2, 0, 0]));
}

/** Os dois aros, a dobradiça e a trava para a silhueta `sil` (simétrica, em mm). Quem chama apaga os sólidos. */
export function buildRims(M: ManifoldToplevel, k: K, sil: CS, o: RimOpts): Rims {
  const aroIn = k(sil.offset(-Math.max(0.8, o.border - RIM_IN), "Round"));
  const ring = k(k(sil.offset(RIM_OUT, "Round")).subtract(aroIn));
  const pocket = k(k(sil.offset(POCKET, "Round")).subtract(aroIn));
  const keepOut = prism(k, aroIn, -50, 50); // nada do aro entra no vão do domo

  // dobradiça
  const h = axisReach(M, sil, o.side, k);
  const s = h.s;
  const axisY = s * (h.reach + RIM_OUT + AXIS_OUT);
  const aSlots: [number, number][] = [[-UNIT / 2, -UNIT / 2 + KLEN], [UNIT / 2 - KLEN, UNIT / 2]];
  const bSlot: [number, number] = [-KLEN / 2, KLEN / 2];
  const neck = (x: [number, number], z0: number, z1: number) => box(M, k, x[0], x[1], s * (h.edge - 2), axisY, z0, z1);
  const knuckle = (x: [number, number]) => cylX(M, k, KR, x[0], x[1], axisY);
  const trim = (x: [number, number]) => cylX(M, k, KR + NC, x[0] - AX_GAP / 2, x[1] + AX_GAP / 2, axisY);

  // trava, do lado oposto (v = distância para fora)
  const fr = axisReach(M, sil, o.side === "top" ? "bottom" : "top", k);
  const f = fr.s;
  const vA = fr.reach + RIM_OUT, vB = vA + LATCH.armLen, vL = vB + LATCH.gap;
  const zc = -RIM_T - LATCH.below, zBot = zc - LATCH.hookT - o.latch;
  const bTab = profile(M, k, [[fr.edge - 2, -RIM_T], [vB, -RIM_T], [vB, 0], [fr.edge - 2, 0]], f, LATCH.tab);
  const aTab = profile(M, k, [[fr.edge - 2, 0], [vA, 0], [vA, RIM_T], [fr.edge - 2, RIM_T]], f, LATCH.armW + 2);
  const latch = k(
    M.Manifold.union([
      profile(M, k, [[vA - 2, RIM_T - LATCH.armH], [vL + LATCH.legT, RIM_T - LATCH.armH], [vL + LATCH.legT, RIM_T], [vA - 2, RIM_T]], f, LATCH.armW), // braço
      profile(M, k, [[vL, zBot], [vL + LATCH.legT, zBot], [vL + LATCH.legT, RIM_T], [vL, RIM_T]], f, LATCH.armW), // perna
      profile(M, k, [[vL + 0.01, zc], [vL - o.latch, zc], [vL - o.latch, zc - LATCH.hookT], [vL + 0.01, zBot]], f, LATCH.armW), // gancho com rampa
    ]),
  );

  const aBody = k(M.Manifold.union([prism(k, ring, 0, RIM_T), ...aSlots.map((x) => neck(x, 0, RIM_T)), aTab]));
  const aTrimmed = k(k(aBody.subtract(trim(bSlot))).subtract(keepOut));
  const pin = cylX(M, k, PIN_R, -UNIT / 2, UNIT / 2, axisY);
  const aNoLatch = k(k(M.Manifold.union([aTrimmed, ...aSlots.map(knuckle), pin])).subtract(prism(k, pocket, -1, o.t)));
  const a = k(M.Manifold.union([aNoLatch, latch]));

  const bBody = k(M.Manifold.union([prism(k, ring, -RIM_T, 0), neck(bSlot, -RIM_T, 0), bTab]));
  const bTrimmed = k(k(bBody.subtract(k(M.Manifold.union(aSlots.map(trim))))).subtract(keepOut));
  const b = k(k(k(M.Manifold.union([bTrimmed, knuckle(bSlot)])).subtract(cylX(M, k, PIN_R + o.hinge, -UNIT / 2 - 0.1, UNIT / 2 + 0.1, axisY))).subtract(prism(k, pocket, -o.t, 1)));

  // impressão: B aberto 180° em volta do eixo, e o conjunto virado para o rebaixo ficar para cima
  const openSign = s;
  const opened = k(k(k(b.translate([0, -axisY, 0])).rotate([180, 0, 0])).translate([0, axisY, 0]));
  const flip = (x: Solid) => k(k(x.rotate([180, 0, 0])).translate([0, 0, RIM_T]));
  return { a, b, latch, aNoLatch, axisY, openSign, printA: flip(a), printB: flip(opened) };
}
