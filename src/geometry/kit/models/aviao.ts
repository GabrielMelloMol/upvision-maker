import type { CS } from "../../manifold";
import { disc, pinHole, poly, rect, tabWindow } from "../joints";
import type { KitEnv, KitPair, KitPart, KitTemplate, Placement } from "../types";
import { LOCK_GAP, LOCK_R, PIN_R, bulkhead, lockPart, place, rotorShape, sc, spinOf } from "./shared";

/*
 * Avião de kit card: duas laterais da fuselagem, 3 cavernas (nariz, cabine, cauda) que atravessam as laterais por abas,
 * asa baixa, estabilizador que entra por uma fenda aberta atrás, 2 pernas do trem com rodas e a hélice, que gira num pino.
 * Projeto em docs/design/kitcard-aviao-helicoptero.md. Eixos do montado: x = nariz, y = lado, z = para cima.
 */

const SIDE_Y = 5.5; // as laterais ficam em y = ±5,5, sem escala: o eixo da hélice passa livre entre elas e a trava cabe
const LEG_Y = 17.6; // pernas do trem
const LEG_X = 9;
const ZF = 17; // altura da base da fuselagem
const NOSE_X = 52.5;
const CAB_X = 10;
const TAIL_X = -40;
const WING_TABS = [2, 16]; // abas das laterais que atravessam a asa
const SLIT_V = 22; // altura da fenda do estabilizador na lateral
const PROP_GAP = 0.4; // vão entre a hélice e o nariz
const LEG_H = 13.9; // altura do corpo da perna
const AXLE_V = 4; // altura do furo do eixo na perna
const WHEEL_GAP = 0.3; // vão entre a roda e a perna

const FUSELAGE: [number, number][] = [[-40, 0], [48, 0], [55, 6], [55, 16], [46, 22], [-28, 24], [-46, 38], [-55, 38], [-55, 12]];

type Rib = { id: string; label: string; x: number; v0: number; v1: number; tabC: number; tabH: number };
const RIBS: Rib[] = [
  { id: "caverna-nariz", label: "Caverna do nariz", x: NOSE_X, v0: 5.5, v1: 15.5, tabC: 10.5, tabH: 6 },
  { id: "caverna-cabine", label: "Caverna da cabine", x: CAB_X, v0: 2, v1: 24, tabC: 12, tabH: 9 },
  { id: "caverna-cauda", label: "Caverna da cauda", x: TAIL_X, v0: 4, v1: 20.5, tabC: 12, tabH: 9 },
];

function side(e: KitEnv): KitPart {
  const { M, k, t, fit, scale: s } = e;
  let cs = poly(M, k, sc(FUSELAGE, s));
  // abas de baixo que atravessam a asa
  const tabs = WING_TABS.map((x) => rect(M, k, (x - 3) * s, -(t + 0.5), (x + 3) * s, 0.02));
  cs = k(M.CrossSection.union([cs, ...tabs]));
  // janelas das cavernas
  const windows = RIBS.map((r) => tabWindow(M, k, { cx: r.x * s, cy: r.tabC * s, tabW: r.tabH, t, fit, vertical: true }));
  // fenda do estabilizador, aberta por trás
  const slit = rect(M, k, -60 * s, SLIT_V * s, -37 * s, SLIT_V * s + t + fit);
  return { id: "lateral", label: "Lateral da fuselagem", count: 2, layers: [{ cs: k(cs.subtract(k(M.CrossSection.union([...windows, slit])))), color: "body" }] };
}

function rib(e: KitEnv, r: Rib, withHole: boolean): KitPart {
  const { M, k, t, scale: s } = e;
  const half = SIDE_Y - t / 2 - 0.05;
  const holes = withHole ? [disc(M, k, 0, r.tabC * s, PIN_R + spinOf(e) / 2)] : [];
  return { id: r.id, label: r.label, layers: [{ cs: bulkhead(e, { half, v0: r.v0 * s, v1: r.v1 * s, tabC: r.tabC * s, tabH: r.tabH, holes }), color: "body" }] };
}

function wing(e: KitEnv): KitPart {
  const { M, k, t, fit, scale: s } = e;
  const outline = poly(M, k, sc([[-52, -12], [-52, -2], [-16, 22], [16, 22], [52, -2], [52, -12], [16, -6], [-16, -6]], s));
  const holes: CS[] = [];
  for (const sg of [-1, 1]) {
    for (const x of WING_TABS) holes.push(tabWindow(M, k, { cx: sg * SIDE_Y, cy: x * s, tabW: 6, t, fit, vertical: true }));
    holes.push(tabWindow(M, k, { cx: sg * LEG_Y, cy: LEG_X * s, tabW: 8, t, fit, vertical: true }));
  }
  return { id: "asa", label: "Asa", layers: [{ cs: k(outline.subtract(k(M.CrossSection.union(holes)))), color: "wing" }] };
}

function stabilizer(e: KitEnv): KitPart {
  const { M, k, scale: s } = e;
  // (lado, corda): o miolo fica na fenda das laterais, a ponta é mais curta e recuada
  const cs = poly(M, k, sc([[-26, -54.5], [-26, -48], [-8, -37.5], [8, -37.5], [26, -48], [26, -54.5]], s));
  return { id: "estabilizador", label: "Estabilizador", layers: [{ cs, color: "wing" }] };
}

function leg(e: KitEnv): KitPart {
  const { M, k, t, pinFit } = e;
  const body = poly(M, k, [[-6, LEG_H], [6, LEG_H], [4.5, 0], [-4.5, 0]]);
  const tab = rect(M, k, -4, LEG_H - 0.01, 4, LEG_H + t + 0.5);
  const cs = k(k(M.CrossSection.union([body, tab])).subtract(pinHole(M, k, { x: 0, y: AXLE_V, r: PIN_R, fit: pinFit })));
  return { id: "perna", label: "Perna do trem", count: 2, layers: [{ cs, color: "wheel" }] };
}

function wheel(e: KitEnv): KitPart {
  const { M, k, t } = e;
  return { id: "roda", label: "Roda", count: 2, layers: [{ cs: disc(M, k, 0, 0, 5.5), color: "wheel" }], pins: [{ x: 0, y: 0, r: PIN_R, len: t + 1.3 }] };
}

function propeller(e: KitEnv): KitPart {
  const { t, scale: s } = e;
  const n = Number(e.p.blades) === 3 ? 3 : 2;
  const cs = rotorShape(e, { n, len: 22 * s, halfW: 3 * s, hub: 4.5 * s });
  return { id: "helice", label: "Hélice", layers: [{ cs, color: "prop" }], pins: [{ x: 0, y: 0, r: PIN_R, len: propPinLen(t, s) }] };
}

/** Pino da hélice: do corpo dela até o fundo da trava, atravessando a caverna do nariz. */
const propPinLen = (t: number, s: number) => 55 * s + PROP_GAP - (NOSE_X * s - 1.5 * t - LOCK_GAP);

export const AVIAO: KitTemplate = {
  id: "kitAviao",
  label: "Avião",
  blurb: "Kit card de avião: fuselagem de encaixe, asa, trem de pouso e hélice que gira.",
  palette: [{ key: "body", label: "Fuselagem", default: "#f4f4f2" }, { key: "wing", label: "Asas", default: "#d94a3a" }, { key: "wheel", label: "Trem e rodas", default: "#1c1c1e" }, { key: "prop", label: "Hélice", default: "#f0b429" }],
  artTargets: [["lateral", "Lateral da fuselagem"], ["asa", "Asa"]],
  defaults: { blades: 2 },
  sections: [{ title: "Avião", fields: [{ k: "blades", kind: "choice", label: "Pás da hélice", options: [["2", "2 pás"], ["3", "3 pás"]] }] }],
  build: (e) => {
    const { t, pinFit, scale: s } = e;
    const spin = spinOf(e);
    const parts: KitPart[] = [side(e), rib(e, RIBS[0], true), rib(e, RIBS[1], false), rib(e, RIBS[2], false), wing(e), stabilizer(e), leg(e), wheel(e), propeller(e), lockPart(e, { id: "trava", label: "Trava da hélice", color: "prop", r: Math.min(LOCK_R, SIDE_Y - e.t / 2 - 0.3) })];
    const assembly: Placement[] = [
      place("lateral", [0, SIDE_Y + t / 2, ZF], [90, 0, 0], 1),
      place("lateral", [0, -SIDE_Y + t / 2, ZF], [90, 0, 0], 2),
      ...RIBS.map((r) => place(r.id, [r.x * s - t / 2, 0, ZF], [90, 0, 90])),
      place("asa", [0, 0, ZF - t - 0.02], [0, 0, -90]),
      place("estabilizador", [0, 0, ZF + SLIT_V * s + 0.1], [0, 0, -90]),
    ];
    const legZ = ZF - t - 0.02 - LEG_H;
    const axleZ = legZ + AXLE_V;
    const lockX = NOSE_X * s - t / 2 - LOCK_GAP;
    const noseZ = ZF + RIBS[0].tabC * s;
    for (const [i, sg] of [[1, 1], [2, -1]] as const) {
      const wheelY = sg * (LEG_Y + t / 2 + WHEEL_GAP) + (sg > 0 ? t : -t);
      assembly.push(
        place("perna", [LEG_X * s, sg * LEG_Y + t / 2, legZ], [90, 0, 0], i),
        place("roda", [LEG_X * s, wheelY, axleZ], sg > 0 ? [90, 0, 0] : [-90, 0, 0], i),
      );
    }
    assembly.push(place("helice", [55 * s + PROP_GAP + t, 0, noseZ], [90, 0, -90]), place("trava", [lockX, 0, noseZ], [90, 0, -90]));
    const pairs: KitPair[] = [
      ...RIBS.map((r): KitPair => ({ a: "lateral", b: r.id, kind: "tab-window" })),
      { a: "lateral", b: "asa", kind: "tab-window" },
      { a: "lateral", b: "estabilizador", kind: "tab-window" },
      { a: "perna", b: "asa", kind: "tab-window" },
      ...[1, 2].flatMap((i): KitPair[] => [{ a: `roda#${i}`, b: `perna#${i}`, kind: "pin-hole", gap: pinFit }]),
      { a: "helice", b: "caverna-nariz", kind: "pin-hole", gap: spin / 2 },
      { a: "helice", b: "trava", kind: "pin-hole", gap: pinFit },
    ];
    const steps = [
      "Encaixe as cavernas {caverna-nariz}, {caverna-cabine} e {caverna-cauda} nas janelas das laterais {lateral}.",
      "Ponha a asa {asa} por baixo, com as abas das laterais nas janelas.",
      "Deslize o estabilizador {estabilizador} pela fenda de trás, até encostar.",
      "Encaixe as pernas {perna} nas janelas da asa e as rodas {roda} nos furos das pernas.",
      "Passe o pino da hélice {helice} pelo furo da caverna do nariz e prenda a trava {trava} na ponta do pino: a hélice tem que girar solta.",
    ];
    return { parts, assembly, steps, pairs };
  },
};
