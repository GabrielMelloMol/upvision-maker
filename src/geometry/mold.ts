import type { Mat4 } from "manifold-3d";
import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { solidFromMesh } from "./cutSolid";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Mesh, Model } from "./types";

/*
 * Molde bipartido a partir de um STL (#239): uma caixa em volta da peça, cortada num plano de partição (a peça fica
 * metade em cada lado), com pinos e furos de alinhamento nos cantos, um canal de vazamento com funil e respiros. As
 * duas metades saem com a face de partição para cima, sem suporte. Serve para resina, silicone, sabonete, vela, gesso
 * e chocolate (em PETG/PLA próprio para alimento, forrado: confira o material). Tudo é calculado com o eixo do plano
 * virado para Z, e as metades já saem na posição de impressão.
 */
export type MoldAxis = "x" | "y" | "z";
export type MoldSide = "+x" | "-x" | "+y" | "-y";

export type MoldParams = {
  axis: MoldAxis; // normal do plano de partição
  offset: number; // posição do plano ao longo desse eixo, em mm, nas coordenadas da peça
  wall: number; // parede em volta da peça
  pinR: number; // raio dos pinos de alinhamento
  clearance: number; // folga do furo do pino
  sprue: MoldSide | "none"; // lado do canal de vazamento (no plano)
  sprueR: number;
  vents: number; // respiros nos outros lados (0 a 3)
  ventR: number;
  shrink: number; // % a mais na cavidade, para compensar o encolhimento do material
  colorLow: string;
  colorHigh: string;
};

export const DEFAULT_MOLD: MoldParams = { axis: "z", offset: 0, wall: 11, pinR: 3, clearance: 0.3, sprue: "+y", sprueR: 4, vents: 1, ventR: 0.9, shrink: 0, colorLow: "#2563eb", colorHigh: "#7c3aed" };

export type MoldReport = {
  volumeMl: number; // quanto material cabe na cavidade (sem o canal)
  undercutLow: number; // fração da superfície da metade de baixo que prende na desmoldagem
  undercutHigh: number;
  size: [number, number, number]; // caixa do molde, no eixo do plano em Z
};
export type MoldOutput = { models: Model[]; warnings: string[]; report: MoldReport };

export const MIN_PIN_WALL = 4; // sobra de parede em volta do pino
const PIN_H = 7;
const FUNNEL = 14; // comprimento do funil na face de fora
const FUNNEL_FACTOR = 2.4;
const SEG = 40;
const PRINT_GAP = 14;
const DRAFT = 0.05; // inclinação (seno) que ainda sai sem prender: ~3°
const SCAN_STEPS = 25;
const SCAN_FROM = 0.15;

/** Gira a peça para o eixo do plano virar Z. */
const TO_Z: Record<MoldAxis, Mat4 | null> = {
  z: null,
  x: [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1], // x → z, y fica, z → −x
  y: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1], // y → z, z → −y
};
const AXIS_INDEX: Record<MoldAxis, number> = { x: 0, y: 1, z: 2 };

const dirOf = (s: MoldSide): [number, number] => (s === "+x" ? [1, 0] : s === "-x" ? [-1, 0] : s === "+y" ? [0, 1] : [0, -1]);
const turnToDir = (s: MoldSide): [number, number, number] => (s === "+x" ? [0, 90, 0] : s === "-x" ? [0, -90, 0] : s === "+y" ? [-90, 0, 0] : [90, 0, 0]);

/**
 * Parte da superfície da peça que prende na desmoldagem ao cortar no plano `offset`: faces voltadas para o lado errado
 * (acima do plano olhando para baixo, abaixo olhando para cima), além da inclinação de saída de ~3°.
 */
export function undercuts(mesh: Mesh, axis: MoldAxis, offset: number): { low: number; high: number } {
  const a = AXIS_INDEX[axis];
  const p = mesh.positions, ix = mesh.indices;
  let lowBad = 0, lowAll = 0, highBad = 0, highAll = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const [i, j, k] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
    const ux = p[j] - p[i], uy = p[j + 1] - p[i + 1], uz = p[j + 2] - p[i + 2];
    const vx = p[k] - p[i], vy = p[k + 1] - p[i + 1], vz = p[k + 2] - p[i + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const area = Math.hypot(n[0], n[1], n[2]) / 2;
    if (area <= 0) continue;
    const na = n[a] / (2 * area);
    const c = (p[i + a] + p[j + a] + p[k + a]) / 3;
    if (c > offset) {
      highAll += area;
      if (na < -DRAFT) highBad += area;
    } else {
      lowAll += area;
      if (na > DRAFT) lowBad += area;
    }
  }
  return { low: lowAll ? lowBad / lowAll : 0, high: highAll ? highBad / highAll : 0 };
}

/** O plano que menos prende a peça (entre 15% e 85% da altura); em empate fica o mais perto do meio. */
export function bestPlane(mesh: Mesh, axis: MoldAxis): number {
  const a = AXIS_INDEX[axis];
  let lo = Infinity, hi = -Infinity;
  for (let i = a; i < mesh.positions.length; i += 3) {
    lo = Math.min(lo, mesh.positions[i]);
    hi = Math.max(hi, mesh.positions[i]);
  }
  const mid = (lo + hi) / 2;
  let best = mid, bestScore = Infinity;
  for (let s = 0; s <= SCAN_STEPS; s++) {
    const off = lo + (hi - lo) * (SCAN_FROM + ((1 - 2 * SCAN_FROM) * s) / SCAN_STEPS);
    const u = undercuts(mesh, axis, off);
    const score = u.low + u.high + 1e-4 * Math.abs(off - mid);
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = off;
    }
  }
  return best;
}

/** Ponto da seção (no plano) mais longe na direção `d`; null se a seção está vazia. */
function extreme(section: CS, d: [number, number]): [number, number] | null {
  let best: [number, number] | null = null, bestDot = -Infinity;
  for (const poly of section.toPolygons())
    for (const [x, y] of poly) {
      const v = x * d[0] + y * d[1];
      if (v > bestDot) {
        bestDot = v;
        best = [x, y];
      }
    }
  return best;
}

/** Canal cilíndrico de `from` até a face de fora, no sentido `side`, no plano z = zc; `flare` abre um funil na ponta. */
function channel(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D, from: [number, number], side: MoldSide, outer: number, zc: number, r: number, flare: boolean): Solid {
  const d = dirOf(side);
  const reach = Math.abs(outer - (d[0] ? from[0] : from[1])) + 1;
  const turn = turnToDir(side);
  const place = (s: Solid, along: number) => k(k(s.rotate(turn)).translate([from[0] + d[0] * along, from[1] + d[1] * along, zc]));
  const parts: Solid[] = [place(k(M.Manifold.cylinder(reach + 1, r, r, SEG)), -1)];
  if (flare) {
    const len = Math.min(FUNNEL, reach);
    parts.push(place(k(M.Manifold.cylinder(len + 1, r, r * FUNNEL_FACTOR, SEG)), reach - len));
  }
  return M.Manifold.union(parts);
}

export type MoldHalves = { lower: Solid; upper: Solid; size: [number, number, number]; volumeMl: number; warnings: string[] };

/**
 * As duas metades do molde na posição montada (plano em z = `offset`, a peça girada para o eixo ficar em Z). Quem chama
 * dá delete() nas duas.
 */
export function moldHalves(M: ManifoldToplevel, solid: Solid, p: MoldParams): MoldHalves {
  return scoped((k) => {
    const warnings: string[] = [];
    const wall = Math.max(p.wall, 2 * (p.pinR + p.clearance) + MIN_PIN_WALL);
    if (wall > p.wall) warnings.push(`A parede subiu para ${wall.toFixed(1).replace(".", ",")} mm para caber o pino de alinhamento.`);
    const turned = TO_Z[p.axis] ? k(solid.transform(TO_Z[p.axis]!)) : solid;
    // encolhimento: cresce a partir do ponto do plano, que não sai do lugar
    const b0 = turned.boundingBox();
    const cx = (b0.min[0] + b0.max[0]) / 2, cy = (b0.min[1] + b0.max[1]) / 2;
    const s = 1 + p.shrink / 100;
    const obj = s === 1 ? turned : k(k(k(turned.translate([-cx, -cy, -p.offset])).scale([s, s, s])).translate([cx, cy, p.offset]));
    const b = obj.boundingBox();
    if (p.offset <= b.min[2] + 0.5 || p.offset >= b.max[2] - 0.5) throw new Error("O plano de partição está fora da peça: escolha uma posição entre a base e o topo.");
    const lo = [b.min[0] - wall, b.min[1] - wall, b.min[2] - wall];
    const hi = [b.max[0] + wall, b.max[1] + wall, b.max[2] + wall];
    const size: [number, number, number] = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    let mold: Solid = k(k(M.Manifold.cube(size, false)).translate(lo as [number, number, number]));
    mold = k(mold.subtract(obj));
    const section = k(obj.slice(p.offset));
    // canal de vazamento e respiros, no plano: metade em cada lado
    const sides: MoldSide[] = ["+y", "-y", "+x", "-x"];
    const outerOf = (s: MoldSide) => (s === "+x" ? hi[0] : s === "-x" ? lo[0] : s === "+y" ? hi[1] : lo[1]);
    const cuts: Solid[] = [];
    const add = (side: MoldSide, r: number, flare: boolean) => {
      const dd = dirOf(side);
      const pt = extreme(section, dd);
      if (!pt) return false;
      cuts.push(k(channel(M, k, [pt[0] - dd[0], pt[1] - dd[1]], side, outerOf(side), p.offset, r, flare)));
      return true;
    };
    if (p.sprue !== "none" && !add(p.sprue, p.sprueR, true)) warnings.push("O plano não corta a peça: sem canal de vazamento.");
    if (p.sprue !== "none") {
      const d0 = dirOf(p.sprue);
      const others = sides.filter((x) => x !== p.sprue).sort((a, c) => dirOf(a)[0] * d0[0] + dirOf(a)[1] * d0[1] - (dirOf(c)[0] * d0[0] + dirOf(c)[1] * d0[1]));
      for (const side of others.slice(0, Math.max(0, Math.min(3, p.vents)))) add(side, p.ventR, false);
    }
    if (cuts.length) mold = k(mold.subtract(k(M.Manifold.union(cuts))));
    // pinos nos 4 cantos, na parede (sempre fora da cavidade pelo cálculo da parede)
    const px = (size[0] - wall) / 2, py = (size[1] - wall) / 2;
    const cxm = (lo[0] + hi[0]) / 2, cym = (lo[1] + hi[1]) / 2;
    const corners = ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([sx, sy]) => [cxm + sx * px, cym + sy * py] as [number, number]);
    const pin = (r: number, h: number, tip: boolean) => {
      const body = k(M.Manifold.cylinder(h - (tip ? r : 0), r, r, 32));
      return tip ? k(M.Manifold.union([body, k(k(M.Manifold.cylinder(r * 0.8, r, r * 0.35, 32)).translate([0, 0, h - r - 0.001]))])) : body;
    };
    const pins = corners.map(([x, y]) => k(pin(p.pinR, PIN_H, true).translate([x, y, p.offset])));
    const sockets = corners.map(([x, y]) => k(pin(p.pinR + p.clearance, PIN_H + 0.6, false).translate([x, y, p.offset - 0.001])));
    const below = k(k(M.Manifold.cube([size[0] + 2, size[1] + 2, p.offset - lo[2] + 1], false)).translate([lo[0] - 1, lo[1] - 1, lo[2] - 1]));
    const above = k(k(M.Manifold.cube([size[0] + 2, size[1] + 2, hi[2] - p.offset + 1], false)).translate([lo[0] - 1, lo[1] - 1, p.offset]));
    const lower = k(k(mold.intersect(below)).add(k(M.Manifold.union(pins))));
    const upper = k(k(mold.intersect(above)).subtract(k(M.Manifold.union(sockets))));
    return { lower: lower.translate([0, 0, 0]), upper: upper.translate([0, 0, 0]), size, volumeMl: obj.volume() / 1000, warnings }; // cópias: as do k somem ao sair
  });
}

/**
 * Monta o molde. `solid` é a peça fechada, em mm, nas coordenadas originais; `source` é a malha dela (para achar o que
 * prende). Devolve as duas metades prontas para imprimir (face de partição para cima), o volume e as contra-saídas.
 */
export function buildMold(M: ManifoldToplevel, solid: Solid, source: Mesh, p: MoldParams): MoldOutput {
  const h = moldHalves(M, solid, p);
  return scoped((k) => {
    k(h.lower);
    k(h.upper);
    const warnings = [...h.warnings];
    const lb = h.lower.boundingBox();
    const lowerPrint = k(h.lower.translate([-lb.min[0], -lb.min[1], -lb.min[2]]));
    // a de cima vira de cabeça para baixo (partição para cima) e fica ao lado
    const flipped = k(h.upper.rotate([180, 0, 0]));
    const fb = flipped.boundingBox();
    const upperPrint = k(flipped.translate([h.size[0] + PRINT_GAP - fb.min[0], -fb.min[1], -fb.min[2]]));
    const u = undercuts(source, p.axis, p.offset);
    if (u.low > 0.05 || u.high > 0.05) warnings.push(`Parte da peça prende na desmoldagem (${Math.round(Math.max(u.low, u.high) * 100)}% da superfície de uma das metades): mude a posição do plano ou use silicone flexível.`);
    const models: Model[] = [
      { name: "Metade de baixo", parts: [{ name: "Metade de baixo", color: p.colorLow, mesh: toMesh(lowerPrint) }] },
      { name: "Metade de cima", parts: [{ name: "Metade de cima", color: p.colorHigh, mesh: toMesh(upperPrint) }] },
    ];
    return { models, warnings, report: { volumeMl: h.volumeMl, undercutLow: u.low, undercutHigh: u.high, size: h.size } };
  });
}

/** Todas as partes do modelo numa malha só (para achar o que prende). */
export function mergedMesh(model: Model): Mesh {
  const parts = model.parts.map((x) => x.mesh);
  const positions = new Float32Array(parts.reduce((n, m) => n + m.positions.length, 0));
  const indices = new Uint32Array(parts.reduce((n, m) => n + m.indices.length, 0));
  let po = 0, io = 0;
  for (const m of parts) {
    positions.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + po / 3;
    po += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
}

/** O modelo inteiro como um sólido só (partes unidas); `holes` conta os furos que o reparo fechou. */
export function modelSolid(M: ManifoldToplevel, model: Model): { solid: Solid; holes: number } {
  return scoped((k) => {
    let holes = 0;
    const solids = model.parts.map((x) => {
      const r = solidFromMesh(M, x.mesh);
      holes += r.holes;
      return k(r.solid);
    });
    return { solid: solids.length === 1 ? solids[0].translate([0, 0, 0]) : M.Manifold.union(solids), holes };
  });
}

/** O eixo e o plano que menos prendem a peça (a escolha automática ao abrir o arquivo); em empate, o eixo Z. */
export function bestSetup(mesh: Mesh): { axis: MoldAxis; offset: number; score: number } {
  let best: { axis: MoldAxis; offset: number; score: number } | null = null;
  for (const axis of ["z", "x", "y"] as const) {
    const offset = bestPlane(mesh, axis);
    const u = undercuts(mesh, axis, offset);
    const score = u.low + u.high;
    if (!best || score < best.score - 0.005) best = { axis, offset, score };
  }
  return best!;
}
