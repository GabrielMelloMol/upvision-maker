import type { CS, ManifoldToplevel } from "../../manifold";
import type { Env } from "./bicho";

/**
 * Baú (kit card): caixa com tampa que abre por dobradiça de pino. Funções puras de região 2D em mm; a base do KitTemplate
 * cuida do cartão, dos números e da prévia montada. Cada painel é dado no próprio plano: u na largura (centrado) e v para cima.
 *
 * Caixa: frente e fundo ficam ENTRE as laterais e atravessam a espessura delas com abas; o piso entra por abas nas 4 paredes.
 * Tampa: a mesma construção de cabeça para baixo, em volta da caixa (folga `LID_GAP`), com o topo no lugar do piso.
 * A tampa não tem parede de trás: o eixo do pino fica 2 mm atrás do fundo da caixa, numa orelha de cada lateral (caixa e tampa), e a tampa
 * gira para trás sem encostar no fundo. O pino cruza a orelha da tampa e a da caixa.
 */
export type BauParams = { width: number; depth: number; height: number; pin: number };
export const DEFAULT_BAU: BauParams = { width: 56, depth: 38, height: 26, pin: 3 };
export const BAU_SIZES = {
  small: { width: 44, depth: 30, height: 22 },
  medium: { width: 56, depth: 38, height: 26 },
  large: { width: 64, depth: 42, height: 28 },
} as const;
/** Limites do que cabe no maior cartão (240 × 160); a base avisa se passar. */
export const BAU_LIMITS = { width: [36, 68], depth: [26, 46], height: [18, 32] } as const;

const LID_GAP = 0.3; // folga da tampa em volta da caixa, por lado
export const FLOOR_Z = 2; // altura do piso (e do topo da tampa) em relação à borda: a fenda fica fechada
const TAB_MIN = 6;
const TAB_MAX = 12;
const TAB_FRAC = 0.22;
const PLATE_TAB_W = 10;
const EAR_BELOW_TOP = 0.5; // a orelha do pino termina um pouco abaixo da borda de cima da caixa
const HINGE_BEHIND = 2; // eixo atrás da face de fora do fundo da caixa
const LUG_WALL = 3.2; // material em volta do furo do pino
const LID_MIN_H = 14;
const LID_FRAC = 0.32;

const rect = (M: ManifoldToplevel, x0: number, y0: number, x1: number, y1: number): CS => M.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);

export type BauDims = {
  W: number; D: number; H: number; Do: number; hl: number;
  /** pino: raio, comprimento e raio da orelha */
  pr: number; pinLen: number; lug: number;
  /** eixo na lateral: posição ao longo da profundidade (u, a partir do centro) e altura (v) na caixa e na tampa */
  hingeU: number; hingeV: number; lidHingeV: number;
  lid: { W: number; D: number };
};

export function bauDims(p: BauParams, env: Pick<Env, "t" | "fit">): BauDims {
  const { t } = env;
  const { width: W, depth: D, height: H } = p;
  const hl = Math.max(LID_MIN_H, LID_FRAC * H);
  const Do = D + 2 * t;
  const pr = p.pin / 2;
  const overlap = hl - FLOOR_Z - t; // quanto as laterais da tampa descem sobre a caixa
  const lug = pr + LUG_WALL;
  const pinFromTop = lug + EAR_BELOW_TOP; // eixo abaixo da borda de cima da caixa
  return {
    W, D, H, Do, hl, pr, lug,
    pinLen: 2 * t + LID_GAP + 0.6,
    hingeU: Do / 2 + HINGE_BEHIND, hingeV: H - pinFromTop, lidHingeV: overlap - pinFromTop,
    lid: { W: W + 2 * t + 2 * LID_GAP, D: D + 2 * t + 2 * LID_GAP },
  };
}

type Panels = { front: CS; back: CS | null; side: CS; plate: CS };
type Hole = { u: number; v: number; r: number; lug: number };
/** Uma parede de frente ou de fundo: altura, e as abas das bordas (alturas do centro e tamanho). */
type Wall = { top: number; vs: number[]; tabH: number };

const wallFor = (H: number): Wall => {
  const tabH = Math.min(TAB_MAX, Math.max(TAB_MIN, TAB_FRAC * H));
  return { top: H, vs: H >= 26 ? [0.28 * H, 0.74 * H] : [0.55 * H], tabH };
};

/** Os painéis de uma caixa W × D × H (dimensões internas), piso a `FLOOR_Z`. `hole` é o furo do pino, na orelha de trás das laterais. `rear: false` tira a parede de trás (tampa). */
function boxPanels(env: Env, W: number, D: number, H: number, hole: Hole, rear: boolean): Panels {
  const { M, k, t, fit } = env;
  const Do = D + 2 * t;
  const w = wallFor(H);
  const tol = fit / 2;
  const plateSlotV: [number, number] = [FLOOR_Z - tol, FLOOR_Z + t + tol];
  const tw = PLATE_TAB_W;
  const cut = (parts: CS[], cuts: CS[]): CS => k(M.CrossSection.union(parts)).subtract(k(M.CrossSection.union(cuts)));
  const plateSlots = (span: number, only?: number) => [-1, 1].filter((sd) => only === undefined || sd === only).map((sd) => k(rect(M, (sd * span) / 4 - (tw + fit) / 2, plateSlotV[0], (sd * span) / 4 + (tw + fit) / 2, plateSlotV[1])));

  // frente e fundo: abas nas duas bordas verticais e fendas para as abas do piso
  const tabs = w.vs.flatMap((v) => [rect(M, -W / 2 - t, v - w.tabH / 2, -W / 2, v + w.tabH / 2), rect(M, W / 2, v - w.tabH / 2, W / 2 + t, v + w.tabH / 2)].map(k));
  const wallPanel = (): CS => cut([k(rect(M, -W / 2, 0, W / 2, H)), ...tabs], plateSlots(W));
  // laterais: fenda das abas da frente (u < 0) e do fundo (u > 0, só na caixa), fendas do piso e o furo do pino na orelha de trás
  const tabSlots = (sd: number) => w.vs.map((v) => k(rect(M, sd * (D / 2 + t / 2) - (t + fit) / 2, v - w.tabH / 2 - tol, sd * (D / 2 + t / 2) + (t + fit) / 2, v + w.tabH / 2 + tol)));
  const lugShape = k(M.CrossSection.hull([k(rect(M, Do / 2 - 2, hole.v - hole.lug, Do / 2, hole.v + hole.lug)), k(M.CrossSection.circle(hole.lug, 40).translate([hole.u, hole.v]))]));
  const holeCs = k(M.CrossSection.circle(hole.r, 32).translate([hole.u, hole.v]));
  const side = cut([k(rect(M, -Do / 2, 0, Do / 2, H)), lugShape], [...tabSlots(-1), ...(rear ? tabSlots(1) : []), ...plateSlots(D), holeCs]);

  // piso (ou topo): o retângulo interno e as abas que atravessam as paredes (sem as de trás na tampa)
  const tabsX = [-1, 1].flatMap((sd) => [-1, 1].map((sy) => k(rect(M, sd < 0 ? -W / 2 - t : W / 2, (sy * D) / 4 - tw / 2, sd < 0 ? -W / 2 : W / 2 + t, (sy * D) / 4 + tw / 2))));
  const tabsY = [-1, 1].filter((sy) => rear || sy < 0).flatMap((sy) => [-1, 1].map((sx) => k(rect(M, (sx * W) / 4 - tw / 2, sy < 0 ? -D / 2 - t : D / 2, (sx * W) / 4 + tw / 2, sy < 0 ? -D / 2 : D / 2 + t))));
  const plate = M.CrossSection.union([k(rect(M, -W / 2, -D / 2, W / 2, D / 2)), ...tabsX, ...tabsY]);
  return { front: wallPanel(), back: rear ? wallPanel() : null, side, plate };
}

export type BauParts = { box: Panels; lid: Panels };

/** Painéis da caixa e da tampa. Os da tampa vêm virados (topo no lugar do piso), sem a parede de trás. */
export function bauPanels(env: Env, p: BauParams): BauParts {
  const { k } = env;
  const d = bauDims(p, env);
  const box = boxPanels(env, d.W, d.D, d.H, { u: d.hingeU, v: d.hingeV, r: d.pr + env.fit / 2, lug: d.lug }, true);
  // tampa: gerada como caixa e virada de cabeça para baixo (v → altura − v), então o furo vai na altura espelhada
  const raw = boxPanels(env, d.lid.W, d.lid.D, d.hl, { u: d.hingeU, v: d.hl - d.lidHingeV, r: d.pr + env.fit / 2, lug: d.lug }, false);
  const flip = (cs: CS): CS => k(cs.mirror([0, 1])).translate([0, d.hl]);
  return { box, lid: { front: flip(raw.front), back: null, side: flip(raw.side), plate: raw.plate } };
}
