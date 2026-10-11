import type { CS } from "../../manifold";
import { disc, pinHole, poly, rect, tabWindow } from "../joints";
import type { KitEnv, KitPair, KitPart, KitTemplate, Placement } from "../types";
import { LOCK_GAP, LOCK_R, PIN_R, bulkhead, lockPart, place, rotorShape, sc, spinOf } from "./shared";

/*
 * Avião de kit card, de asa média como um treinador: 2 laterais da fuselagem, 4 cavernas, asa que atravessa as duas laterais por
 * uma fenda horizontal (travada por duas cavernas que passam por fendas na própria asa), tampa de cima presa por abas,
 * deriva única que passa por uma fenda na tampa e se apoia no estabilizador, trem com rodas e hélice que gira num pino.
 * Proporções (comprimento 110): envergadura 120 (1,1×), asa a 1/3 do nariz, estabilizador de 44, hélice de 32.
 * Eixos do montado: x = nariz, y = lado, z = para cima. Posição da asa: média (padrão), baixa ou alta.
 */

const SIDE_Y = 5.5; // as laterais ficam em y = ±5,5, sem escala: o eixo da hélice passa livre entre elas e a trava cabe
const ZF = 8; // altura da base da fuselagem
const TOP = 24; // altura da fuselagem (a tampa fica aqui)
const NOSE_GAP = 2.5; // a caverna do nariz fica 2,5 mm atrás da ponta (sem escala, para não sobrar uma lasca fina)
const noseX = (s: number) => 55 * s - NOSE_GAP;
const TAIL_RIB_X = -40;
const WING_RIBS = [27, 8.5]; // cavernas que travam a asa (passam por fendas nela)
const WING_X0 = 4.3; // corda da asa na raiz
const WING_X1 = 32.3;
const HALF_SPAN = 60;
const WING_V = { mid: 12, low: 6, high: 18 } as const;
const SV = 17; // altura da fenda do estabilizador nas laterais
const TOP_TABS = [-30, 0, 30]; // abas de cima das laterais, que atravessam a tampa
const TOP_TAB_W = 8;
const FIN_X0 = -52; // a deriva passa pela tampa entre FIN_X0 e FIN_X1
const FIN_X1 = -40;
const FIN_TABS = [-49, -43];
const FIN_H = 20; // quanto a deriva sobe acima da tampa
const LEG_Y = 20; // pernas do trem
const LEG_X = 18;
const LEG_Z = 1.5; // base da perna
const WHEEL_R = 4.5;
const AXLE_V = WHEEL_R - LEG_Z; // altura do furo do eixo na perna (a roda toca a mesa)
const WHEEL_GAP = 0.3; // vão entre a roda e a perna
const PROP_GAP = 0.4; // vão entre a hélice e o nariz
const SLIT_Y = 7; // as fendas da asa cobrem as abas das cavernas (até 6,8)

const FUSELAGE: [number, number][] = [[-25, 0], [48, 0], [55, 6], [55, 15], [40, TOP], [-55, TOP], [-55, 14]];
const wingV = (e: KitEnv) => WING_V[String(e.p.wingPos) as keyof typeof WING_V] ?? WING_V.mid;

type Rib = { id: string; label: string; x: number; v0: number; v1: number; tabC: number; tabH: number };
const ribs = (e: KitEnv): Rib[] => {
  const wv = wingV(e);
  return [
    { id: "caverna-nariz", label: "Caverna do nariz", x: noseX(e.scale) / e.scale, v0: 5.5, v1: 15.5, tabC: 10.5, tabH: 6 },
    { id: "caverna-frente", label: "Caverna da frente da asa", x: WING_RIBS[0], v0: 2, v1: 22, tabC: wv, tabH: 7 },
    { id: "caverna-tras", label: "Caverna de trás da asa", x: WING_RIBS[1], v0: 2, v1: 22, tabC: wv, tabH: 7 },
    { id: "caverna-cauda", label: "Caverna da cauda", x: TAIL_RIB_X, v0: 8, v1: 15, tabC: 11.5, tabH: 5 },
  ];
};

function side(e: KitEnv): KitPart {
  const { M, k, t, fit, scale: s } = e;
  const wv = wingV(e);
  const body = poly(M, k, sc(FUSELAGE, s));
  const tabs = TOP_TABS.map((x) => rect(M, k, x * s - TOP_TAB_W / 2, TOP * s - 0.02, x * s + TOP_TAB_W / 2, TOP * s + t + 0.5));
  const outline = k(M.CrossSection.union([body, ...tabs]));
  const windows = ribs(e).map((r) => tabWindow(M, k, { cx: r.x * s, cy: r.tabC * s, tabW: r.tabH, t, fit, vertical: true }));
  const wingSlot = rect(M, k, WING_X0 * s - fit / 2, wv * s - (t + fit) / 2, WING_X1 * s + fit / 2, wv * s + (t + fit) / 2);
  const stabSlot = rect(M, k, -60 * s, SV * s, -37 * s, SV * s + t + fit); // aberta por trás
  return { id: "lateral", label: "Lateral da fuselagem", count: 2, layers: [{ cs: k(outline.subtract(k(M.CrossSection.union([...windows, wingSlot, stabSlot])))), color: "body" }] };
}

function rib(e: KitEnv, r: Rib): KitPart {
  const { M, k, t, scale: s } = e;
  const half = SIDE_Y - t / 2 - 0.05;
  const holes = r.id === "caverna-nariz" ? [disc(M, k, 0, r.tabC * s, PIN_R + spinOf(e) / 2)] : [];
  return { id: r.id, label: r.label, layers: [{ cs: bulkhead(e, { half, v0: r.v0 * s, v1: r.v1 * s, tabC: r.tabC * s, tabH: r.tabH, holes }), color: "body" }] };
}

function wing(e: KitEnv): KitPart {
  const { M, k, t, fit, scale: s } = e;
  // (lado, corda): corda reta na raiz e afilando para a ponta
  const outline = poly(M, k, sc([[-HALF_SPAN, 11], [-HALF_SPAN, 22], [-16, WING_X1], [16, WING_X1], [HALF_SPAN, 22], [HALF_SPAN, 11], [16, WING_X0], [-16, WING_X0]], s));
  const slits = WING_RIBS.map((x) => rect(M, k, -SLIT_Y, x * s - (t + fit) / 2, SLIT_Y, x * s + (t + fit) / 2));
  const legs = [-1, 1].map((sg) => tabWindow(M, k, { cx: sg * LEG_Y, cy: LEG_X * s, tabW: 8, t, fit, vertical: true }));
  return { id: "asa", label: "Asa", layers: [{ cs: k(outline.subtract(k(M.CrossSection.union([...slits, ...legs])))), color: "wing" }] };
}

function cover(e: KitEnv): KitPart {
  const { M, k, t, fit, scale: s } = e;
  const half = SIDE_Y + t / 2 + 1.6;
  const holes: CS[] = [];
  for (const sg of [-1, 1]) for (const x of TOP_TABS) holes.push(tabWindow(M, k, { cx: x * s, cy: sg * SIDE_Y, tabW: TOP_TAB_W, t, fit, vertical: false }));
  holes.push(rect(M, k, FIN_X0 * s - fit / 2, -(t + fit) / 2, FIN_X1 * s + fit / 2, (t + fit) / 2));
  return { id: "tampa", label: "Tampa da fuselagem", layers: [{ cs: k(rect(M, k, -55 * s, -half, 38 * s, half).subtract(k(M.CrossSection.union(holes)))), color: "body" }] };
}

/** Altura (do montado, sem ZF) da face de cima do estabilizador e da face de cima da tampa. */
const stabTop = (e: KitEnv) => SV * e.scale + 0.1 + e.t;
const coverTop = (e: KitEnv) => TOP * e.scale + 0.02 + e.t;

function fin(e: KitEnv): KitPart {
  const { M, k, t, scale: s } = e;
  const [vb, vs] = [stabTop(e), coverTop(e)];
  const body = poly(M, k, [[FIN_X0 * s, vb], [FIN_X1 * s, vb], [FIN_X1 * s, vs], [-47 * s, vs + FIN_H * s], [-55 * s, vs + FIN_H * s], [-55 * s, vs], [FIN_X0 * s, vs]]);
  const tabs = FIN_TABS.map((x) => rect(M, k, x * s - 2 * s, vb - (t + 0.5), x * s + 2 * s, vb + 0.01));
  return { id: "deriva", label: "Deriva", layers: [{ cs: k(M.CrossSection.union([body, ...tabs])), color: "wing" }] };
}

function stabilizer(e: KitEnv): KitPart {
  const { M, k, t, fit, scale: s } = e;
  // (lado, corda): o miolo fica na fenda das laterais; a deriva se apoia nele por duas abas
  const outline = poly(M, k, sc([[-22, -54.5], [-22, -47], [-8, -37.5], [8, -37.5], [22, -47], [22, -54.5]], s));
  const windows = FIN_TABS.map((x) => tabWindow(M, k, { cx: 0, cy: x * s, tabW: 4 * s, t, fit, vertical: true }));
  return { id: "estabilizador", label: "Estabilizador", layers: [{ cs: k(outline.subtract(k(M.CrossSection.union(windows)))), color: "wing" }] };
}

/** Altura da perna: da base (LEG_Z) até a face de baixo da asa. */
const legH = (e: KitEnv) => ZF + wingV(e) * e.scale - e.t / 2 - LEG_Z;

function leg(e: KitEnv): KitPart {
  const { M, k, t, pinFit } = e;
  const h = legH(e);
  const body = poly(M, k, [[-6, h], [6, h], [4.5, 0], [-4.5, 0]]);
  const tab = rect(M, k, -4, h - 0.01, 4, h + t + 0.5);
  const cs = k(k(M.CrossSection.union([body, tab])).subtract(pinHole(M, k, { x: 0, y: AXLE_V, r: PIN_R, fit: pinFit })));
  return { id: "perna", label: "Perna do trem", count: 2, layers: [{ cs, color: "wheel" }] };
}

function wheel(e: KitEnv): KitPart {
  const { M, k, t } = e;
  return { id: "roda", label: "Roda", count: 2, layers: [{ cs: disc(M, k, 0, 0, WHEEL_R), color: "wheel" }], pins: [{ x: 0, y: 0, r: PIN_R, len: t + 1.3 }] };
}

function propeller(e: KitEnv): KitPart {
  const { t, scale: s } = e;
  const n = Number(e.p.blades) === 3 ? 3 : 2;
  const cs = rotorShape(e, { n, len: 16 * s, halfW: 2.6 * s, hub: 4.5 * s });
  return { id: "helice", label: "Hélice", layers: [{ cs, color: "prop" }], pins: [{ x: 0, y: 0, r: PIN_R, len: propPinLen(t, s) }] };
}

/** Pino da hélice: do corpo dela até o fundo da trava, atravessando a caverna do nariz. */
const propPinLen = (t: number, s: number) => 55 * s + PROP_GAP - (noseX(s) - 1.5 * t - LOCK_GAP);

export const AVIAO: KitTemplate = {
  id: "kitAviao",
  label: "Avião",
  blurb: "Kit card de avião de asa média: fuselagem de encaixe com tampa, asa que atravessa as laterais, deriva, trem de pouso e hélice que gira.",
  palette: [{ key: "body", label: "Fuselagem", default: "#f4f4f2" }, { key: "wing", label: "Asas e deriva", default: "#d94a3a" }, { key: "wheel", label: "Trem e rodas", default: "#1c1c1e" }, { key: "prop", label: "Hélice", default: "#f0b429" }],
  artTargets: [["lateral", "Lateral da fuselagem"], ["asa", "Asa"], ["tampa", "Tampa"]],
  defaults: { blades: 2, wingPos: "mid" },
  sections: [
    {
      title: "Avião",
      fields: [
        { k: "wingPos", kind: "choice", label: "Posição da asa", options: [["mid", "No meio (padrão)"], ["low", "Baixa"], ["high", "Alta"]] },
        { k: "blades", kind: "choice", label: "Pás da hélice", options: [["2", "2 pás"], ["3", "3 pás"]] },
      ],
    },
  ],
  build: (e) => {
    const { t, pinFit, scale: s } = e;
    const spin = spinOf(e);
    const rs = ribs(e);
    const lock = lockPart(e, { id: "trava", label: "Trava da hélice", color: "prop", r: Math.min(LOCK_R, SIDE_Y - t / 2 - 0.3) });
    const parts: KitPart[] = [side(e), ...rs.map((r) => rib(e, r)), wing(e), cover(e), fin(e), stabilizer(e), leg(e), wheel(e), propeller(e), lock];
    const assembly: Placement[] = [
      place("lateral", [0, SIDE_Y + t / 2, ZF], [90, 0, 0], 1),
      place("lateral", [0, -SIDE_Y + t / 2, ZF], [90, 0, 0], 2),
      ...rs.map((r) => place(r.id, [r.x * s - t / 2, 0, ZF], [90, 0, 90])),
      place("asa", [0, 0, ZF + wingV(e) * s - t / 2], [0, 0, -90]),
      place("tampa", [0, 0, ZF + TOP * s + 0.02]),
      place("deriva", [0, t / 2, ZF], [90, 0, 0]),
      place("estabilizador", [0, 0, ZF + SV * s + 0.1], [0, 0, -90]),
    ];
    const axleZ = LEG_Z + AXLE_V;
    const lockX = noseX(s) - t / 2 - LOCK_GAP;
    const noseZ = ZF + rs[0].tabC * s;
    for (const [i, sg] of [[1, 1], [2, -1]] as const) {
      const wheelY = sg * (LEG_Y + t / 2 + WHEEL_GAP) + (sg > 0 ? t : -t);
      assembly.push(
        place("perna", [LEG_X * s, sg * LEG_Y + t / 2, LEG_Z], [90, 0, 0], i),
        place("roda", [LEG_X * s, wheelY, axleZ], sg > 0 ? [90, 0, 0] : [-90, 0, 0], i),
      );
    }
    assembly.push(place("helice", [55 * s + PROP_GAP + t, 0, noseZ], [90, 0, -90]), place("trava", [lockX, 0, noseZ], [90, 0, -90]));
    const pairs: KitPair[] = [
      ...rs.map((r): KitPair => ({ a: "lateral", b: r.id, kind: "tab-window" })),
      { a: "lateral", b: "asa", kind: "tab-window" },
      { a: "lateral", b: "tampa", kind: "tab-window" },
      { a: "lateral", b: "estabilizador", kind: "tab-window" },
      { a: "caverna-frente", b: "asa", kind: "slot-slot" },
      { a: "caverna-tras", b: "asa", kind: "slot-slot" },
      { a: "deriva", b: "tampa", kind: "tab-window" },
      { a: "deriva", b: "estabilizador", kind: "tab-window" },
      { a: "perna", b: "asa", kind: "tab-window" },
      ...[1, 2].map((i): KitPair => ({ a: `roda#${i}`, b: `perna#${i}`, kind: "pin-hole", gap: pinFit })),
      { a: "helice", b: "caverna-nariz", kind: "pin-hole", gap: spin / 2 },
      { a: "helice", b: "trava", kind: "pin-hole", gap: pinFit },
    ];
    const steps = [
      "Passe a asa {asa} pela fenda das laterais {lateral}, de um lado ao outro.",
      "Encaixe as cavernas {caverna-frente} e {caverna-tras} (elas passam pelas fendas da asa e a travam) e as cavernas {caverna-nariz} e {caverna-cauda} nas janelas das laterais.",
      "Deslize o estabilizador {estabilizador} pela fenda de trás, até encostar.",
      "Ponha a tampa {tampa} nas abas de cima das laterais e passe a deriva {deriva} pela fenda da tampa, com as abas nas janelas do estabilizador.",
      "Encaixe as pernas {perna} nas janelas da asa e as rodas {roda} nos furos das pernas.",
      "Passe o pino da hélice {helice} pelo furo da caverna do nariz e prenda a trava {trava} na ponta do pino: a hélice tem que girar solta.",
    ];
    return { parts, assembly, steps, pairs };
  },
};
