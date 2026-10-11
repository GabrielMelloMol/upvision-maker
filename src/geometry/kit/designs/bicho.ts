import type { CS, ManifoldToplevel } from "../../manifold";
import { roundedRect } from "../../models/common";

/**
 * Bicho de 4 patas (kit card): coluna (perfil lateral) + fatias encaixadas por meia-fenda + cabeça e cauda em rabo de andorinha.
 * Funções puras de região 2D em mm; a base do KitTemplate cuida do cartão, dos números e da prévia montada.
 * Coluna: x ao longo do comprimento, y para cima (0 = barriga). Fatia: x na largura (centrada), y para cima (0 = chão).
 */
export type K = <D extends { delete(): void }>(o: D) => D;
export type Env = { M: ManifoldToplevel; k: K; t: number; fit: number; nozzle: number };

export type HeadStyle = "dog" | "cat" | "dino";
export type TailStyle = "short" | "long" | "up";
export type Profile = "oval" | "boxy";
export type BichoParams = { length: number; slices: number; head: HeadStyle; tail: TailStyle; profile: Profile };
export const DEFAULT_BICHO: BichoParams = { length: 80, slices: 4, head: "dog", tail: "long", profile: "oval" };
export const BICHO_LIMITS = { length: [50, 120], slices: [2, 6] } as const;

const BODY_H = 0.4; // altura do corpo / comprimento
const BODY_W = 0.36; // largura do corpo / comprimento
const LEG_H = 0.28; // altura das pernas / comprimento
const LEG_W_MIN = 6;
const LEG_W = 0.1;
const FRONT_LEG_AT = 0.18; // posição da fatia de perna da frente, em fração do comprimento (a de trás é o espelho)
const WALL_MIN = 3; // parede mínima em volta de um soquete
const SPIGOT_CLEARANCE = 0.75; // folga da espiga por lado = fit * isto
const NECK_RISE = 0.08;

export type Dims = {
  L: number; H: number; W: number; P: number; pw: number; s: number;
  /** x das fatias na coluna, da cauda para a cabeça; `leg` marca as de perna */
  ribs: { x: number; leg: boolean }[];
  headSock: Sock; tailSock: Sock;
};
/** Soquete de rabo de andorinha: boca no topo, mais largo no fundo. */
export type Sock = { mouth: number; base: number; depth: number };

export function bichoDims(p: BichoParams, env: Pick<Env, "t" | "fit">): Dims {
  const L = p.length;
  const n = Math.round(p.slices);
  const s = env.t + env.fit;
  const front = FRONT_LEG_AT * L, back = L - FRONT_LEG_AT * L;
  const mids = Array.from({ length: Math.max(0, n - 2) }, (_, i) => front + ((i + 1) * (back - front)) / (n - 1));
  const ribs = [front, ...mids, back].map((x, i, a) => ({ x, leg: i === 0 || i === a.length - 1 }));
  const head: Sock = { mouth: Math.max(5, 0.08 * L), base: Math.max(6.5, 0.1 * L), depth: Math.max(6, 0.09 * L) };
  const tail: Sock = { mouth: Math.max(4, 0.05 * L), base: Math.max(5.5, 0.065 * L), depth: Math.max(5, 0.06 * L) };
  return { L, H: BODY_H * L, W: BODY_W * L, P: LEG_H * L, pw: Math.max(LEG_W_MIN, LEG_W * L), s, ribs, headSock: head, tailSock: tail };
}

const poly = (M: ManifoldToplevel, pts: [number, number][]): CS => new M.CrossSection([pts], "NonZero");
const box = (M: ManifoldToplevel, x0: number, y0: number, x1: number, y1: number): CS => poly(M, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const union = (M: ManifoldToplevel, parts: CS[]): CS => M.CrossSection.union(parts);

/** Trapézio do rabo de andorinha com a boca em y = 0 e o fundo em y = -depth (largura `base`). Para a espiga, passe `grow` negativo. */
const dovetail = (M: ManifoldToplevel, sock: Sock, grow: number, extraTop = 0): CS => {
  const m = sock.mouth / 2 + grow, b = sock.base / 2 + grow, d = sock.depth + grow;
  return poly(M, [[-m, extraTop], [m, extraTop], [m, 0], [b, -d], [-b, -d], [-m, 0]]);
};

/** Onde ficam os soquetes na coluna (x do centro e y da boca) e a largura dos blocos que os seguram. */
export function bichoAnchors(p: BichoParams, env: Pick<Env, "t" | "fit" | "nozzle">) {
  const d = bichoDims(p, env);
  const wall = Math.max(WALL_MIN, 2.5 * env.nozzle);
  const headW = d.headSock.base + 2 * wall, tailW = d.tailSock.base + 2 * wall;
  const rise = NECK_RISE * d.L;
  return { headW, tailW, rise, headX: d.L - headW / 2, headY: d.H + rise, tailX: tailW / 2, tailY: d.H + 0.5 * rise };
}

/** Coluna: cápsula do corpo, os dois blocos (pescoço na frente, apoio da cauda atrás) com os soquetes, e as fendas das fatias por baixo. */
export function bichoSpine(env: Env, p: BichoParams): CS {
  const { M, k } = env;
  const d = bichoDims(p, env);
  const a = bichoAnchors(p, env);
  const { L, H, s } = d;
  const capsule = k(k(roundedRect(M, L, H, 0.4 * H)).translate([L / 2, H / 2]));
  const neck = k(box(M, L - a.headW, H * 0.5, L, a.headY));
  const rear = k(box(M, 0, H * 0.5, a.tailW, a.tailY));
  let body = k(union(M, [capsule, neck, rear]));
  body = k(body.subtract(k(dovetail(M, d.headSock, 0, 1).translate([a.headX, a.headY]))));
  body = k(body.subtract(k(dovetail(M, d.tailSock, 0, 1).translate([a.tailX, a.tailY]))));
  const slots = d.ribs.map((r) => k(box(M, r.x - s / 2, -1, r.x + s / 2, H / 2)));
  return body.subtract(k(union(M, slots)));
}

/** Fatia: seção oval (ou quase retangular) do corpo; as de perna ganham as duas pernas. Fenda por cima, metade da altura. */
export function bichoRib(env: Env, p: BichoParams, leg: boolean): CS {
  const { M, k } = env;
  const d = bichoDims(p, env);
  const { W, H, P, pw, s } = d;
  const section = k(
    p.profile === "oval"
      ? k(M.CrossSection.circle(1, 64)).scale([W / 2, H / 2])
      : roundedRect(M, W, H, 0.3 * Math.min(W, H)),
  ).translate([0, P + H / 2]);
  const legs = leg
    ? [-1, 1].map((sd) => k(roundedFoot(M, sd * (W / 2 - pw / 2), pw, P + H / 2)))
    : [];
  const slot = k(box(M, -s / 2, P + H / 2, s / 2, P + H + 1));
  return k(union(M, [k(section), ...legs])).subtract(slot);
}

/** Perna: retângulo de x = cx ± w/2 do chão (y = 0) até `top`, com os cantos de baixo arredondados. */
function roundedFoot(M: ManifoldToplevel, cx: number, w: number, top: number): CS {
  const r = Math.min(1.2, w / 4);
  return poly(M, [[cx - w / 2 + r, 0], [cx + w / 2 - r, 0], [cx + w / 2, r], [cx + w / 2, top], [cx - w / 2, top], [cx - w / 2, r]]);
}

/** Espiga que desce no soquete: mais fina que a boca por `fit * SPIGOT_CLEARANCE` de cada lado. */
const spigot = (env: Env, sock: Sock): CS => {
  const g = -env.fit * SPIGOT_CLEARANCE;
  const { M } = env;
  return dovetail(M, { ...sock, depth: sock.depth - 0.2 }, g, 0.2);
};

const HEAD_RECT = { x0: -0.06, x1: 0.22, h: 0.26 }; // frações do comprimento: o corpo da cabeça sobre a espiga (x = 0)

/** Cabeça (perfil de lado, virada para +x) com a espiga para baixo (y < 0). */
export function bichoHead(env: Env, p: BichoParams): CS {
  const { M, k } = env;
  const L = p.length;
  const f = (v: number) => v * L;
  const r = f(p.head === "cat" ? 0.1 : 0.06);
  const w = p.head === "dino" ? f(0.34) - f(HEAD_RECT.x0) : f(HEAD_RECT.x1 - HEAD_RECT.x0);
  const h = f(p.head === "dino" ? 0.2 : HEAD_RECT.h);
  const block = k(k(roundedRect(M, w, h, r)).translate([f(HEAD_RECT.x0) + w / 2, h / 2]));
  const extra: CS[] = [];
  if (p.head === "dog") {
    extra.push(k(box(M, f(0.18), f(0.02), f(0.3), f(0.14))));
    extra.push(k(poly(M, [[f(-0.06), f(0.22)], [f(-0.12), f(0.08)], [f(0.0), f(0.1)]])));
  } else if (p.head === "cat") {
    extra.push(k(poly(M, [[f(-0.02), f(0.22)], [f(0.02), f(0.34)], [f(0.07), f(0.22)]])));
    extra.push(k(poly(M, [[f(0.12), f(0.22)], [f(0.17), f(0.34)], [f(0.21), f(0.22)]])));
  } else {
    extra.push(k(poly(M, [[f(0.02), f(0.19)], [f(0.07), f(0.27)], [f(0.12), f(0.19)]])));
  }
  return union(M, [block, ...extra, k(spigot(env, bichoDims(p, env).headSock))]);
}

/** Cauda: barra afilada da espiga (x = 0, y = 0) até a ponta, com a espiga para baixo. */
export function bichoTail(env: Env, p: BichoParams): CS {
  const { M, k } = env;
  const L = p.length;
  const end: Record<TailStyle, [number, number]> = { short: [-0.06, 0.1], long: [-0.16, 0.22], up: [-0.02, 0.28] };
  const [ex, ey] = end[p.tail];
  const w0 = Math.max(3.5, 0.045 * L), w1 = Math.max(2, 0.025 * L);
  const bar = k(M.CrossSection.hull([k(M.CrossSection.circle(w0, 24).translate([0, w0])), k(M.CrossSection.circle(w1, 24).translate([ex * L, ey * L]))]));
  return union(M, [bar, k(spigot(env, bichoDims(p, env).tailSock))]);
}
