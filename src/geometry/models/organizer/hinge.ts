import type { CS, ManifoldToplevel, Solid } from "../../manifold";

/*
 * Dobradiça de pino impresso e trava da caixa organizadora (#204). Tudo na pose FECHADA: x para o lado, y para o fundo
 * (a dobradiça fica atrás), z para cima, caixa centrada em x/y e com a base em z = 0; a tampa assenta em z = Hb.
 *
 * Dobradiça: o eixo fica atrás da parede de trás (a `OFF` do plano dela) e à altura da borda mais o raio do nó (`RK`),
 * assim a tampa se levanta sem raspar na borda e os nós ficam fora da pegada da caixa. Cada dobradiça é um conjunto de
 * 3 casas lado a lado: orelha da caixa | nó da tampa | orelha da caixa, com `AX_GAP` entre elas. O pino (Ø3, folga radial
 * de 0,3) entra pela orelha de fora, que tem um rebaixo para a cabeça; a orelha de dentro fecha o furo (cego).
 * Batente: uma aleta em cada orelha, num ângulo que a borda de trás da tampa encosta aos `STOP_DEG`.
 *
 * Trava: lingueta flexível na frente da caixa, presa numa base da parede e subindo até um dente que fica por cima da
 * borda da tampa, a `latchClearance` dela. A face de cima do dente é uma rampa: a tampa, ao descer, empurra a lingueta
 * para fora e o dente salta de volta. Puxar o topo da lingueta solta.
 */
type K = <D extends { delete(): void }>(o: D) => D;

export const HINGE = {
  rk: 3.4, // raio do nó
  boreR: 1.8, // furo: pino de 1,5 mais a folga radial fixa de 0,3
  pinR: 1.5,
  slot: 5, // largura de cada casa (orelha, nó, orelha)
  axGap: 0.4, // folga entre as casas
  nc: 0.35, // folga da tampa em volta da orelha
  off: 4, // do plano da parede de trás ao eixo
  headR: 2.7,
  headH: 1.2,
  blind: 1, // o furo da orelha de dentro para antes da face de fora
  ribT: 2.4,
  ribR: 7,
  stopDeg: 100,
  edge: 2, // folga entre a dobradiça e o canto arredondado
} as const;

export const LATCH = { width: 16, strip: 1.4, gap: 0.8, hookReach: 1.2, tab: 4.5, ledge: 3, ledgeFrom: 14 } as const;

export const unitWidth = 3 * HINGE.slot + 2 * HINGE.axGap;
/** Centros (x) das dobradiças: duas se a caixa for larga, senão uma no meio. */
export const hingeCenters = (W: number, outerRadius: number): number[] => {
  const x = W / 2 - outerRadius - HINGE.edge - unitWidth / 2;
  return W >= 70 ? [-x, x] : [0];
};

type Slots = { ear1: [number, number]; lid: [number, number]; ear2: [number, number] };
export const slotsAt = (xc: number): Slots => {
  const a = xc - unitWidth / 2, { slot: s, axGap: g } = HINGE;
  return { ear1: [a, a + s], lid: [a + s + g, a + 2 * s + g], ear2: [a + 2 * s + 2 * g, a + 3 * s + 2 * g] };
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Ângulo (graus, a partir de +y para cima) da aleta de batente: a borda de trás da tampa nas orelhas encosta nela aos `stopDeg`. */
export function stopRibAngle(lidT: number): number {
  const { rk, off, nc, ribR, ribT, stopDeg } = HINGE;
  let best = Infinity;
  for (const dz of [-rk, -rk + lidT])
    for (let s = off + nc; s <= off + nc + ribR; s += 0.25) {
      const r = Math.hypot(s, dz);
      if (r > ribR - 0.3) break;
      const g0 = (Math.atan2(dz, -s) * 180) / Math.PI + 360; // ângulo da quina da tampa em relação ao eixo
      best = Math.min(best, g0 - (Math.asin(ribT / 2 / r) * 180) / Math.PI);
    }
  return best - stopDeg;
}

/** Polígono em (y, z) extrudado ao longo de x de x0 a x1. */
export function extrudeYZ(M: ManifoldToplevel, k: K, pts: [number, number][], x0: number, x1: number): Solid {
  const cs: CS = k(new M.CrossSection([pts], "NonZero"));
  return k(k(k(cs.extrude(x1 - x0)).rotate([90, 0, 90])).translate([x0, 0, 0]));
}

/** Cilindro com o eixo ao longo de x, de x0 a x1, centrado em (y, z). */
export function cylX(M: ManifoldToplevel, k: K, r: number, x0: number, x1: number, y: number, z: number): Solid {
  return k(k(k(M.Manifold.cylinder(x1 - x0, r, r, 48)).rotate([0, 90, 0])).translate([x0, y, z]));
}

const block = (M: ManifoldToplevel, k: K, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Solid =>
  k(k(M.Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));

export type Geo = { W: number; D: number; Hb: number; lidT: number; floor: number; outerRadius: number; latchClearance: number };
export type Hinge = {
  /** Orelhas com aletas e furos, e a trava: soma à caixa. */
  boxAdd: Solid;
  /** O que a tampa perde nas orelhas (para a tampa não raspar). */
  lidTrim: Solid;
  /** Nós da tampa com furo e pescoço: soma à tampa. */
  lidAdd: Solid;
  pins: Solid[];
  axis: { y: number; z: number };
  stopRibDeg: number;
};

export function buildHinge(M: ManifoldToplevel, k: K, g: Geo): Hinge {
  const { rk, boreR, pinR, off, headR, headH, blind, ribT, ribR, nc } = HINGE;
  const A = { y: g.D / 2 + off, z: g.Hb + rk };
  const rib = stopRibAngle(g.lidT);
  const centers = hingeCenters(g.W, g.outerRadius);
  const ears: Solid[] = [], necks: Solid[] = [], trims: Solid[] = [], bores: Solid[] = [], pins: Solid[] = [], lidBores: Solid[] = [];
  const ribPoly = (): [number, number][] => {
    const c = Math.cos(rad(rib)), s = Math.sin(rad(rib)), h = ribT / 2;
    const at = (r: number, d: number): [number, number] => [A.y + r * c - d * s, A.z + r * s + d * c];
    return [at(1.5, -h), at(ribR, -h), at(ribR, h), at(1.5, h)];
  };
  for (const xc of centers) {
    const { ear1, lid, ear2 } = slotsAt(xc);
    for (const [x0, x1] of [ear1, ear2]) {
      const web = block(M, k, x0, x1, g.D / 2 - 0.3, g.D / 2, g.Hb - 9, g.Hb);
      ears.push(k(M.Manifold.hull([cylX(M, k, rk, x0, x1, A.y, A.z), web])), extrudeYZ(M, k, ribPoly(), x0, x1));
    }
    // a tampa não chega às orelhas: recua `nc` do plano de trás, entre a casa do nó e o fim da dobradiça
    trims.push(block(M, k, ear1[0] - HINGE.axGap, ear1[1] + HINGE.axGap, g.D / 2 - nc, g.D / 2 + 20, g.Hb - 1, g.Hb + g.lidT + 1));
    trims.push(block(M, k, ear2[0] - HINGE.axGap, ear2[1] + HINGE.axGap, g.D / 2 - nc, g.D / 2 + 20, g.Hb - 1, g.Hb + g.lidT + 1));
    const neckBlock = block(M, k, lid[0], lid[1], g.D / 2 - 2, g.D / 2, g.Hb, g.Hb + g.lidT);
    necks.push(k(M.Manifold.hull([cylX(M, k, rk, lid[0], lid[1], A.y, A.z), neckBlock])));
    lidBores.push(cylX(M, k, boreR, lid[0] - 0.1, lid[1] + 0.1, A.y, A.z));
    // furo: cego na orelha de dentro (ear1), passante na de fora com o rebaixo da cabeça do pino
    bores.push(cylX(M, k, boreR, ear1[0] + blind, ear1[1] + 0.1, A.y, A.z), cylX(M, k, boreR, ear2[0] - 0.1, ear2[1] + 0.1, A.y, A.z), cylX(M, k, headR + 0.2, ear2[1] - headH - 0.2, ear2[1] + 0.1, A.y, A.z));
    const shaft = cylX(M, k, pinR, ear1[0] + blind + 0.3, ear2[1] - headH - 0.1, A.y, A.z);
    const head = cylX(M, k, headR, ear2[1] - headH - 0.2, ear2[1] - 0.1, A.y, A.z);
    pins.push(k(M.Manifold.union([shaft, head])));
  }
  const latch = latchSolid(M, k, g);
  const earsAll = k(M.Manifold.union(ears));
  const boxAdd = k(M.Manifold.union([k(earsAll.subtract(k(M.Manifold.union(bores)))), latch]));
  const lidAdd = k(k(M.Manifold.union(necks)).subtract(k(M.Manifold.union(lidBores))));
  return { boxAdd, lidTrim: k(M.Manifold.union(trims)), lidAdd, pins, axis: A, stopRibDeg: rib };
}

/** Lingueta da trava: polígono em (y, z) extrudado na largura `LATCH.width`, no meio da frente. */
export function latchSolid(M: ManifoldToplevel, k: K, g: Geo): Solid {
  const { width, strip, gap, hookReach, tab, ledge, ledgeFrom } = LATCH;
  const yf = -g.D / 2, yi = yf - gap, yo = yi - strip;
  const zb = Math.max(g.floor + 1, g.Hb - ledgeFrom), zl = zb + ledge;
  const zh = g.Hb + g.lidT + g.latchClearance; // face de baixo do dente
  const tip = yf + hookReach;
  const pts: [number, number][] = [
    [yf + 0.2, zb], [yo, zb], [yo, zh + tab], [yi, zh + tab], [yi, zh + 1.8], [tip, zh + 0.8], [tip, zh], [yi, zh], [yi, zl], [yf + 0.2, zl],
  ];
  return extrudeYZ(M, k, pts, -width / 2, width / 2);
}

/** Altura mínima da parede da frente para a trava caber (base + lingueta até o dente). */
export const latchMinBody = (lidT: number, floor: number) => floor + 1 + LATCH.ledge + lidT + 4;
