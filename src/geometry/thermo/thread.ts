import type { ManifoldToplevel, Solid } from "../manifold";

type K = <D extends { delete(): void }>(o: D) => D;

/** Rosca de passo único (mão direita), de perfil trapezoidal com flancos de 60°: serve a pino e a tampa, e imprime sem suporte. */
export type ThreadSpec = { /** raio de fora do pino (crista) */ major: number; /** altura do filete */ depth: number; pitch: number; length: number };

export const DEFAULT_THREAD: ThreadSpec = { major: 4.5, depth: 1, pitch: 2.5, length: 10 };

const PROFILE_STEPS = 144; // pontos do contorno de uma volta: o filete sai liso
const TURN_DIVISIONS = 24; // cortes por volta na torção
const FLANK = Math.tan(Math.PI / 6); // 60° de ângulo incluído: avanço axial = profundidade × tan 30°
const CREST_MM = 0.5; // a crista do filete tem pelo menos a largura de uma linha do bico (0,4 mm): senão o fatiador a chama de parede fina

/** Raio da rosca na posição axial `s` (0 ≤ s < passo): raiz, flanco de subida, crista, flanco de descida. */
export function threadRadius(s: number, t: ThreadSpec): number {
  const run = t.depth * FLANK;
  const root = Math.max(0.05, t.pitch - CREST_MM - 2 * run);
  const x = ((s % t.pitch) + t.pitch) % t.pitch;
  const minor = t.major - t.depth;
  if (x < root) return minor;
  if (x < root + run) return minor + (t.depth * (x - root)) / run;
  if (x < root + run + CREST_MM) return t.major;
  return t.major - (t.depth * (x - root - run - CREST_MM)) / run;
}

/**
 * Pino rosqueado ao longo de +Z, a partir de z = 0. O contorno de uma seção tem um só "lóbulo" (o raio varia com o ângulo como o
 * perfil varia com o avanço) e a extrusão com torção de 360° por passo varre a hélice. `grow` aumenta o raio (folga da tampa).
 * Quem chama apaga o resultado.
 */
export function threadedRod(M: ManifoldToplevel, k: K, t: ThreadSpec, grow = 0): Solid {
  const pts: [number, number][] = Array.from({ length: PROFILE_STEPS }, (_, i) => {
    const a = (i / PROFILE_STEPS) * Math.PI * 2;
    const r = threadRadius((a / (Math.PI * 2)) * t.pitch, t) + grow;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  const section = k(new M.CrossSection([pts], "NonZero"));
  const turns = t.length / t.pitch;
  return M.Manifold.extrude(section, t.length, Math.max(1, Math.ceil(turns * TURN_DIVISIONS)), turns * 360);
}

const HALF_BIG = 200;

/**
 * Metade de um pino rosqueado, deitada (o plano de corte é a face de baixo, z = 0, que apoia na mesa): o eixo segue +Y a partir de
 * y = 0. As duas metades de duas placas coladas formam o pino inteiro. Quem chama apaga o resultado.
 */
export function halfPost(M: ManifoldToplevel, k: K, t: ThreadSpec): Solid {
  const rod = k(threadedRod(M, k, t));
  const lying = k(rod.rotate([-90, 0, 0])); // eixo +Z → +Y
  const keep = k(k(M.Manifold.cube([HALF_BIG, HALF_BIG, HALF_BIG], false)).translate([-HALF_BIG / 2, -HALF_BIG / 2, 0]));
  return lying.intersect(keep);
}

export type CapSpec = {
  thread: ThreadSpec;
  /** Folga da rosca interna sobre o pino. */
  clearance: number;
  /** Parede da tampa em volta da rosca e espessura do fundo. */
  wall: number;
  floor: number;
  /** Furo da alça para a fita e a largura de material em volta dele. */
  loopHole: number;
  loopRim: number;
};

export const DEFAULT_CAP: CapSpec = { thread: DEFAULT_THREAD, clearance: 0.3, wall: 2.4, floor: 1.6, loopHole: 4, loopRim: 2.2 };

const CAP_SEGMENTS = 48;
const LOOP_REACH = 1; // a alça entra um pouco no corpo da tampa

/**
 * Tampa rosqueada que vira pendurador: copo com a rosca por dentro (aberto para cima, o fundo na mesa) e, no fundo, uma alça
 * deitada com o furo para a fita. Quem chama apaga o resultado.
 */
export function capSolid(M: ManifoldToplevel, k: K, c: CapSpec): Solid {
  const t = c.thread;
  const outerR = t.major + c.clearance + c.wall;
  const height = c.floor + t.length + 0.6;
  const body = k(M.Manifold.cylinder(height, outerR, outerR, CAP_SEGMENTS));
  const bore = k(k(threadedRod(M, k, { ...t, length: t.length + 0.8 }, c.clearance)).translate([0, 0, c.floor]));
  const loopW = c.loopHole + 2 * c.loopRim;
  const loopLen = c.loopHole + 2 * c.loopRim + LOOP_REACH;
  const tabH = Math.min(c.floor + 0.8, 2.4);
  const tab = k(k(M.Manifold.cube([loopW, loopLen, tabH], false)).translate([-loopW / 2, outerR - LOOP_REACH, 0]));
  const round = k(k(M.Manifold.cylinder(tabH, loopW / 2, loopW / 2, CAP_SEGMENTS)).translate([0, outerR - LOOP_REACH + loopLen - loopW / 2, 0]));
  const loop = k(M.Manifold.union([tab, round]));
  const hole = k(k(M.Manifold.cylinder(tabH + 2, c.loopHole / 2, c.loopHole / 2, 32)).translate([0, outerR - LOOP_REACH + loopLen - loopW / 2, -1]));
  const cap = k(M.Manifold.union([body, loop]));
  return cap.subtract(k(M.Manifold.union([bore, hole])));
}

/** Contorno da base do pino visto de cima (largura do pino + folga) para a aba que o prende à placa. */
export const postWidth = (t: ThreadSpec) => 2 * t.major;
