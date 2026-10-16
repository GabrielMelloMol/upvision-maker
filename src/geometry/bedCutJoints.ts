import { planPins } from "./cutPins";
import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { DEPTH_FACTOR, EXTRA_DEPTH, pinCs, type K } from "./planeCut";

/**
 * Cortar peça grande para a mesa (#218), parte 2: os encaixes de uma junta, no sistema local do plano de corte
 * (u, v no plano; w ao longo do eixo do corte, w < 0 na parte de baixo e w > 0 na de cima). O encaixe é sempre um furo
 * em cada parte e uma peça solta (pino ou chave), ou só os furos do ímã.
 */
export type JointKind = "round" | "square" | "dovetail" | "magnet" | "none";
export type Magnet = { d: number; h: number };
export type Joint = {
  /** Vazios a subtrair de baixo (w < 0) e de cima (w > 0). */
  holeBelow: Solid;
  holeAbove: Solid;
  /** Peça solta (pino ou chave), na posição de montada; null quando é só o furo do ímã. */
  key: Solid | null;
  /** A marca do encaixe vista de cima, para o número não cair em cima dele. */
  footprint: CS;
  size: number;
  depth: number;
};

const MAGNET_SLACK = 0.3; // folga do furo do ímã
const KEY_SHRINK = 0.6; // a chave é um pouco mais curta que a ranhura, para deslizar
const DOVETAIL_FLARE = 1.5; // a ponta da chave é 1,5× a cintura
const DOVETAIL_MAX = 12;
const MIN_DEPTH = 1.5;

type Pt = [number, number];

/** Ranhura em ampulheta (rabo de andorinha duplo): cintura `a` no plano, `b` nas pontas, extrudada `len` ao longo do eixo `along`. */
function hourglass(M: ManifoldToplevel, k: K, a: number, b: number, depth: number, len: number, across: "u" | "v", center: Pt): Solid {
  const hex: Pt[] = [[-a / 2, 0], [-b / 2, -depth], [b / 2, -depth], [a / 2, 0], [b / 2, depth], [-b / 2, depth]];
  const prism = k(new M.CrossSection([hex], "NonZero").extrude(len)); // perfil em (x = largura, y = w), comprimento em z
  const m = across === "u" ? ([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const) : ([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1] as const);
  const placed = k(prism.translate([0, 0, -len / 2]).transform([...m] as Parameters<Solid["transform"]>[0]));
  return placed.translate([center[0], center[1], 0]);
}

/** Monta o encaixe numa junta; `sec` é a seção do corte (só a região entre as duas peças). Null se o encaixe não cabe. */
export function buildJoint(M: ManifoldToplevel, k: K, kind: Exclude<JointKind, "none">, sec: CS, o: { size: number; clearance: number; magnet: Magnet; room: number }): Joint | null {
  if (kind === "dovetail") return dovetail(M, k, sec, o);
  const magnet = kind === "magnet";
  const plan = planPins(M, k, sec, magnet ? o.magnet.d + MAGNET_SLACK : o.size);
  if (plan.warning || !plan.spots.length) return null;
  const { size, spots } = plan;
  const depth = magnet ? o.magnet.h + MAGNET_SLACK : Math.min(size * DEPTH_FACTOR, o.room);
  if (depth < MIN_DEPTH) return null;
  const shape = kind === "square" ? "square" : "round";
  const spread = (cs: CS) => k(M.CrossSection.union(spots.map((p) => k(cs.translate(p)))));
  const bore = spread(magnet ? k(M.CrossSection.circle(size / 2, 48)) : k(k(pinCs(M, shape, size)).offset(o.clearance, "Miter")));
  const h = depth + (magnet ? 0 : EXTRA_DEPTH);
  const hole = (z0: number) => k(k(bore.extrude(h)).translate([0, 0, z0]));
  const key = magnet ? null : k(k(spread(k(pinCs(M, shape, size))).extrude(2 * depth + EXTRA_DEPTH / 2)).translate([0, 0, -depth]));
  return { holeBelow: hole(-h), holeAbove: hole(0), key, footprint: bore, size, depth };
}

function dovetail(M: ManifoldToplevel, k: K, sec: CS, o: { size: number; clearance: number; room: number }): Joint | null {
  const b = sec.bounds();
  const [wu, wv] = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
  const along: "u" | "v" = wu >= wv ? "u" : "v";
  const across: "u" | "v" = along === "u" ? "v" : "u";
  const [extent, span] = along === "u" ? [wu, wv] : [wv, wu];
  const a = o.size > 0 ? o.size : Math.min(DOVETAIL_MAX, span * 0.2);
  const depth = Math.min(a * 1.2, o.room);
  if (a < 3 || depth < MIN_DEPTH || extent < a * 2) return null;
  const center: Pt = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
  const flare = a * DOVETAIL_FLARE;
  // a ranhura vara o corte de ponta a ponta (a chave entra deslizando pela lateral) e a chave é um pouco mais curta e mais fina
  const slot = hourglass(M, k, a + 2 * o.clearance, flare + 2 * o.clearance, depth + EXTRA_DEPTH, extent + 2, across, center);
  const key = hourglass(M, k, a, flare, depth, extent - KEY_SHRINK, across, center);
  const half = (down: boolean) => k(down ? slot.intersect(k(M.Manifold.cube([1e4, 1e4, depth + EXTRA_DEPTH], false).translate([-5e3, -5e3, -(depth + EXTRA_DEPTH)]))) : slot.intersect(k(M.Manifold.cube([1e4, 1e4, depth + EXTRA_DEPTH], false).translate([-5e3, -5e3, 0]))));
  const strip = k(M.CrossSection.square(along === "u" ? [extent, a + 2 * o.clearance] : [a + 2 * o.clearance, extent], true).translate(center));
  return { holeBelow: half(true), holeAbove: half(false), key, footprint: strip, size: a, depth };
}

const SPOT_STEPS = 12;

/** Onde cabe o número da junta: o ponto mais folgado da seção, longe do encaixe. Null se não houver lugar. */
export function numberSpot(k: K, sec: CS, footprint: CS, textR: number): Pt | null {
  const free = k(k(sec.offset(-(textR + 0.8), "Round")).subtract(k(footprint.offset(textR + 0.8, "Round"))));
  if (free.isEmpty()) return null;
  const b = free.bounds();
  let lo = 0;
  let hi = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2;
  for (let i = 0; i < SPOT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (k(free.offset(-mid, "Round")).isEmpty()) hi = mid;
    else lo = mid;
  }
  // qualquer ponto do contorno do núcleo está à mesma distância (lo) da borda: serve de centro (o centro da caixa pode cair no buraco do encaixe)
  const core = k(free.offset(-lo, "Round"));
  const poly = (core.isEmpty() ? free : core).toPolygons()[0];
  return poly?.length ? (poly[0] as Pt) : null;
}
