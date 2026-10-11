import type { CS, ManifoldToplevel } from "../../manifold";
import { roundedRect } from "../../models/common";

/**
 * Bicho de 4 patas (kit card): coluna (perfil lateral) + fatias encaixadas por meia-fenda + cabeça e cauda em rabo de andorinha.
 * Funções puras de região 2D em mm; a base do KitTemplate cuida do cartão, dos números e da prévia montada.
 * Coluna: x ao longo do comprimento, y para cima (0 = barriga). Fatia: x na largura (centrada), y para cima (0 = chão).
 */
export type K = <D extends { delete(): void }>(o: D) => D;
export type Env = { M: ManifoldToplevel; k: K; t: number; fit: number; nozzle: number };

/** `dino` é o nome antigo do saurópode (projetos salvos continuam abrindo). */
export type HeadStyle = "dog" | "cat" | "sauro" | "trex" | "dino";
export type TailStyle = "short" | "long" | "up" | "thick";
export type Species = "dog" | "cat" | "sauro" | "trex";
export const speciesOf = (h: HeadStyle): Species => (h === "dino" ? "sauro" : h);
export type Profile = "oval" | "boxy";
export type BichoParams = { length: number; slices: number; head: HeadStyle; tail: TailStyle; profile: Profile };
export const DEFAULT_BICHO: BichoParams = { length: 80, slices: 4, head: "dog", tail: "long", profile: "oval" };
export const BICHO_LIMITS = { length: [50, 120], slices: [2, 6] } as const;

const BODY_H = 0.4; // altura do corpo / comprimento
const BODY_W = 0.36; // largura do corpo / comprimento
const LEG_W_MIN = 6;
const LEG_W = 0.1;
const SPINE_LEG_AT = 0.04; // a perna da coluna (de perfil, vista de lado) começa a esta distância da ponta
const RIB_AFTER_LEG = 0.03; // a fatia de perna fica um pouco depois da perna da coluna, para a fenda não cortar a perna
/** Proporções por bicho, em fração do comprimento (peito e garupa: raio / altura do corpo). */
const SPECIES = {
  dog: { P: 0.22, legW: 0.13, chest: 0.5, rump: 0.46, rise: 0.08 },
  cat: { P: 0.22, legW: 0.13, chest: 0.5, rump: 0.46, rise: 0.08 },
  sauro: { P: 0.28, legW: 0.18, chest: 0.5, rump: 0.5, rise: 0.05 },
  trex: { P: 0.32, legW: 0.2, chest: 0.42, rump: 0.5, rise: 0.14 }, // pescoço alto: a cabeça fica acima do dorso
} as const;
const TREX_RIB_AT = 0.36; // a fatia de perna do T-rex, depois da coxa
const WALL_MIN = 3; // parede mínima em volta de um soquete
const SPIGOT_CLEARANCE = 0.75; // folga da espiga por lado = fit * isto

export type Dims = {
  L: number; H: number; W: number; P: number; pw: number; s: number; species: Species;
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
  const species = speciesOf(p.head);
  const sp = SPECIES[species];
  // fatias de perna logo depois das pernas da coluna (as da frente são o espelho das de trás); o T-rex só tem a de trás, e a coxa dele é larga
  const rear = (species === "trex" ? TREX_RIB_AT : SPINE_LEG_AT + sp.legW + RIB_AFTER_LEG) * L;
  const front = species === "trex" ? 0.82 * L : L - rear;
  const mids = Array.from({ length: Math.max(0, n - 2) }, (_, i) => rear + ((i + 1) * (front - rear)) / (n - 1));
  const ribs = [rear, ...mids, front].map((x, i, a) => ({ x, leg: i === 0 || (i === a.length - 1 && species !== "trex") }));
  const head: Sock = { mouth: Math.max(5, 0.08 * L), base: Math.max(6.5, 0.1 * L), depth: Math.max(6, 0.09 * L) };
  const tail: Sock = { mouth: Math.max(4, 0.05 * L), base: Math.max(5.5, 0.065 * L), depth: Math.max(5, 0.06 * L) };
  return { L, H: BODY_H * L, W: BODY_W * L, P: sp.P * L, pw: Math.max(LEG_W_MIN, LEG_W * L), s, species, ribs, headSock: head, tailSock: tail };
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
  const rise = SPECIES[d.species].rise * d.L;
  return { headW, tailW, rise, headX: d.L - headW / 2, headY: d.H + rise, tailX: tailW / 2, tailY: d.H + 0.5 * rise };
}

/** Coluna: cápsula do corpo, os dois blocos (pescoço na frente, apoio da cauda atrás) com os soquetes, e as fendas das fatias por baixo. */
export function bichoSpine(env: Env, p: BichoParams): CS {
  const { M, k } = env;
  const d = bichoDims(p, env);
  const a = bichoAnchors(p, env);
  const { L, H, s } = d;
  // corpo: do peito (fundo, redondo) à garupa, com a linha do dorso reta; as pernas de perfil descem da barriga
  const sp = SPECIES[d.species];
  const chest = k(M.CrossSection.circle(sp.chest * H, 48).translate([L - sp.chest * H, H - sp.chest * H]));
  const rump = k(M.CrossSection.circle(sp.rump * H, 48).translate([sp.rump * H, H - sp.rump * H]));
  const capsule = k(M.CrossSection.union([k(M.CrossSection.hull([chest, rump])), ...spineLegs(M, k, d)]));
  const neck = k(box(M, L - a.headW, H * 0.5, L, a.headY));
  const rear = k(box(M, 0, H * 0.5, a.tailW, a.tailY));
  let body = k(union(M, [capsule, neck, rear]));
  body = k(body.subtract(k(dovetail(M, d.headSock, 0, 1).translate([a.headX, a.headY]))));
  body = k(body.subtract(k(dovetail(M, d.tailSock, 0, 1).translate([a.tailX, a.tailY]))));
  const slots = d.ribs.map((r) => k(box(M, r.x - s / 2, -1, r.x + s / 2, H / 2)));
  return body.subtract(k(union(M, slots)));
}

/**
 * Pernas da coluna, vistas de perfil. Cachorro, gato e saurópode: uma em cada ponta (o saurópode, em colunas grossas). T-rex: a coxa de trás
 * com um pé comprido para a frente (é o que o segura em pé) e um bracinho no peito.
 */
function spineLegs(M: ManifoldToplevel, k: K, d: Dims): CS[] {
  const { L, H, P } = d;
  const lw = SPECIES[d.species].legW * L;
  if (d.species !== "trex") return [SPINE_LEG_AT * L + lw / 2, L - SPINE_LEG_AT * L - lw / 2].map((cx) => k(k(roundedFoot(M, cx, lw, P + 0.5 * H)).translate([0, -P])));
  const foot = 0.07 * L;
  const thigh = poly(M, [[0.1 * L, 0.5 * H], [0.3 * L, 0.5 * H], [0.3 * L, -P + foot], [0.55 * L, -P + foot], [0.57 * L, -P + foot / 2], [0.55 * L, -P], [0.1 * L, -P]]);
  const arm = poly(M, [[0.85 * L, 0.25 * H], [0.91 * L, 0.25 * H], [0.98 * L, -0.1 * L], [0.93 * L, -0.1 * L]]);
  return [k(thigh), k(arm)];
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

/** Cabeça (perfil de lado, virada para +x) com a espiga para baixo (y < 0). A cabeça apoia em y = 0; o fundo do crânio fica sobre a espiga em x = 0. */
export function bichoHead(env: Env, p: BichoParams): CS {
  const { M, k } = env;
  const L = p.length;
  const f = (v: number) => v * L;
  const species = speciesOf(p.head);
  const disc = (x: number, y: number, r: number) => k(k(M.CrossSection.circle(f(r), 40)).translate([f(x), f(y)]));
  const part = (w: number, h: number, r: number, x0: number, y0: number) => k(k(roundedRect(M, f(w), f(h), f(r))).translate([f(x0) + f(w) / 2, f(y0) + f(h) / 2]));
  const oval = (rx: number, ry: number, cx: number, cy: number, deg = 0) => k(k(k(M.CrossSection.circle(1, 40).scale([f(rx), f(ry)])).rotate(deg)).translate([f(cx), f(cy)]));
  const parts: CS[] = [];
  if (species === "dog") {
    parts.push(part(0.24, 0.22, 0.07, -0.07, 0)); // crânio
    parts.push(part(0.16, 0.12, 0.045, 0.1, 0.01)); // focinho, mais baixo que o crânio
    parts.push(oval(0.034, 0.088, -0.05, 0.102, 10)); // orelha caída, atrás (sem passar de y = 0: ali fica o pescoço da coluna)
    parts.push(k(M.CrossSection.circle(f(0.022), 24).translate([f(0.255), f(0.1)]))); // nariz
  } else if (species === "cat") {
    parts.push(part(0.26, 0.23, 0.1, -0.07, 0));
    parts.push(k(poly(M, [[f(-0.04), f(0.2)], [f(0.0), f(0.33)], [f(0.065), f(0.21)]])));
    parts.push(k(poly(M, [[f(0.1), f(0.21)], [f(0.15), f(0.33)], [f(0.19), f(0.2)]])));
  } else if (species === "sauro") {
    // saurópode: pescoço comprido subindo em diagonal, afinando, e uma cabeça pequena e baixa na ponta
    const chain: [number, number, number][] = [[0, 0.065, 0.065], [0.07, 0.22, 0.052], [0.15, 0.38, 0.042], [0.22, 0.52, 0.036], [0.27, 0.62, 0.032]];
    for (let i = 1; i < chain.length; i++) parts.push(k(M.CrossSection.hull([disc(...chain[i - 1]), disc(...chain[i])])));
    parts.push(oval(0.062, 0.032, 0.31, 0.65, -8));
  } else {
    // T-rex: cabeça enorme em cunha (crânio fundo e focinho largo) no alto de um pescoço curto e grosso
    parts.push(k(M.CrossSection.hull([disc(0.02, 0.12, 0.12), disc(0.19, 0.12, 0.115), disc(0.33, 0.085, 0.078)])));
    parts.push(k(poly(M, [[f(-0.02), f(0.22)], [f(0.06), f(0.3)], [f(0.14), f(0.21)]]))); // arcada acima do olho
  }
  return union(M, [...parts, k(spigot(env, bichoDims(p, env).headSock))]);
}

/** Cauda: da espiga (x = 0, y = 0) até a ponta, com a espiga para baixo. As de bicho são barras afiladas; a grossa (dinossauro) é uma sequência de círculos que afina. */
export function bichoTail(env: Env, p: BichoParams): CS {
  const { M, k } = env;
  const L = p.length;
  const f = (v: number) => v * L;
  if (p.tail === "thick") {
    const chain: [number, number, number][] =
      speciesOf(p.head) === "trex"
        ? [[0, 0.07, 0.07], [-0.2, 0.085, 0.055], [-0.4, 0.1, 0.03], [-0.52, 0.11, 0.012]] // contrapeso: reta e para o alto
        : [[0, 0.075, 0.075], [-0.18, 0.06, 0.055], [-0.38, 0.0, 0.033], [-0.56, -0.08, 0.012]]; // saurópode: cai de leve e afina em chicote
    const discs = chain.map(([x, y, r]) => k(k(M.CrossSection.circle(Math.max(1, f(r)), 32)).translate([f(x), f(y)])));
    const links = discs.slice(1).map((c, i) => k(M.CrossSection.hull([discs[i], c])));
    return union(M, [...links, k(spigot(env, bichoDims(p, env).tailSock))]);
  }
  const end: Record<"short" | "long" | "up", [number, number]> = { short: [-0.07, 0.09], long: [-0.2, 0.12], up: [-0.08, 0.2] };
  const [ex, ey] = end[p.tail];
  const w0 = Math.max(3.5, 0.05 * L), w1 = Math.max(2, 0.022 * L);
  const bar = k(M.CrossSection.hull([k(M.CrossSection.circle(w0, 24).translate([0, w0])), k(M.CrossSection.circle(w1, 24).translate([ex * L, ey * L]))]));
  return union(M, [bar, k(spigot(env, bichoDims(p, env).tailSock))]);
}
