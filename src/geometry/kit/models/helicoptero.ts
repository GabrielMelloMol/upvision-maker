import type { CS } from "../../manifold";
import { disc, poly, rect, tabWindow } from "../joints";
import type { KitEnv, KitPair, KitPart, KitTemplate } from "../types";
import { LOCK_GAP, PIN_R, bulkhead, lockPart, place, rotorShape, sc, spinOf } from "./shared";

/*
 * Helicóptero de kit card: 2 laterais com janelas, piso e teto que se prendem nas laterais por abas, 2 anteparos (o de trás
 * leva a janela da cauda), cauda, 2 esquis, rotor principal e rotor de cauda, que giram em pinos presos por travas.
 * Projeto em docs/design/kitcard-aviao-helicoptero.md. Eixos do montado: x = nariz, y = lado, z = para cima.
 */

const SIDE_Y = 11; // as laterais ficam em y = ±11
const CABIN_H = 30; // altura da cabine (da base da lateral ao teto)
const FLOOR_Z = 12; // face de baixo do piso (os esquis terminam aqui)
const SKID_Y = 6; // esquis em y = ±6
const SKID_STRUTS = [-8, 14];
const SIDE_TABS = [-14, 6]; // abas das laterais que atravessam o piso e o teto
const TAB_W = 9;
const STRUT_TAB = 4;
const FRONT_X = 20;
const REAR_X = -19;
const BULK_C = 15; // altura do centro das janelas dos anteparos
const BULK_TAB_H = 9;
const BOOM_TAB_H = 8;
const MAST_X = 2;
const TAIL_X = -66;
const TAIL_Z = 27;
const ROTOR_GAP = 0.8; // vão entre a peça que gira e a que a segura (passa as pontas das abas, que sobram 0,5 mm)

const CABIN: [number, number][] = [[-22, 0], [24, 0], [28, 8], [28, 20], [20, 30], [-22, 30]];
const WINDOWS: [number, number, number, number][] = [[-1, 12, 15, 24], [-15, 12, -4, 24]]; // u0, v0, u1, v1
// a primeira coordenada do encosto (REAR_X) é trocada pela face de trás do anteparo
const BOOM: [number, number][] = [[REAR_X, 8], [-70, 14], [-72, 38], [-64, 38], [-52, 22], [REAR_X, 22]];

/** Altura da base das laterais: sobre o piso, com 0,02 mm de vão. */
const baseZ = (t: number) => FLOOR_Z + t + 0.02;
/** Comprimento do pino que atravessa a peça de `t`, com o vão de cima e o da trava. */
const pinLen = (t: number) => ROTOR_GAP + t + LOCK_GAP + t;

function side(e: KitEnv): KitPart {
  const { M, k, t, fit, scale: s } = e;
  const body = poly(M, k, sc(CABIN, s));
  const down = SIDE_TABS.map((x) => rect(M, k, x * s - TAB_W / 2, -(t + 0.5), x * s + TAB_W / 2, 0.02));
  const up = SIDE_TABS.map((x) => rect(M, k, x * s - TAB_W / 2, CABIN_H * s - 0.02, x * s + TAB_W / 2, CABIN_H * s + t + 0.5));
  const outline = k(M.CrossSection.union([body, ...down, ...up]));
  const glass = WINDOWS.map(([u0, v0, u1, v1]) => rect(M, k, u0 * s, v0 * s, u1 * s, v1 * s));
  const slots = [FRONT_X, REAR_X].map((x) => tabWindow(M, k, { cx: x * s, cy: BULK_C * s, tabW: BULK_TAB_H, t, fit, vertical: true }));
  return { id: "lateral", label: "Lateral", count: 2, layers: [{ cs: k(outline.subtract(k(M.CrossSection.union([...glass, ...slots])))), color: "body" }] };
}

function deck(e: KitEnv, id: "piso" | "teto"): KitPart {
  const { M, k, t, fit, scale: s } = e;
  const half = SIDE_Y * s + 2.5;
  const holes: CS[] = [];
  for (const sg of [-1, 1]) {
    for (const x of SIDE_TABS) holes.push(tabWindow(M, k, { cx: x * s, cy: sg * SIDE_Y * s, tabW: TAB_W, t, fit, vertical: false }));
    if (id === "piso") for (const x of SKID_STRUTS) holes.push(tabWindow(M, k, { cx: x * s, cy: sg * SKID_Y * s, tabW: STRUT_TAB, t, fit, vertical: false }));
  }
  if (id === "teto") holes.push(disc(M, k, MAST_X * s, 0, PIN_R + spinOf(e) / 2));
  const [u0, u1] = id === "piso" ? [-22, 24] : [-22, 20];
  const cs = k(rect(M, k, u0 * s, -half, u1 * s, half).subtract(k(M.CrossSection.union(holes))));
  return { id, label: id === "piso" ? "Piso" : "Teto", layers: [{ cs, color: "body" }] };
}

function bulk(e: KitEnv, id: "anteparo-frente" | "anteparo-tras"): KitPart {
  const { M, k, t, fit, scale: s } = e;
  const half = SIDE_Y * s - t / 2 - 0.05;
  const boomSlot = id === "anteparo-tras" ? [tabWindow(M, k, { cx: 0, cy: BULK_C * s, tabW: BOOM_TAB_H, t, fit, vertical: true })] : [];
  const cs = bulkhead(e, { half, v0: 4 * s, v1: 26 * s, tabC: BULK_C * s, tabH: BULK_TAB_H, holes: boomSlot });
  return { id, label: id === "anteparo-frente" ? "Anteparo da frente" : "Anteparo de trás", layers: [{ cs, color: "body" }] };
}

function boom(e: KitEnv): KitPart {
  const { M, k, t, scale: s } = e;
  const rootX = REAR_X * s - t / 2; // face de trás do anteparo
  const body = poly(M, k, BOOM.map(([u, v]): [number, number] => [u === REAR_X ? rootX : u * s, v * s]));
  const tab = rect(M, k, rootX, BULK_C * s - BOOM_TAB_H / 2, rootX + t + 0.6, BULK_C * s + BOOM_TAB_H / 2);
  const hole = disc(M, k, TAIL_X * s, TAIL_Z * s, PIN_R + spinOf(e) / 2);
  return { id: "cauda", label: "Cauda", layers: [{ cs: k(k(M.CrossSection.union([body, tab])).subtract(hole)), color: "tail" }] };
}

function skid(e: KitEnv): KitPart {
  const { M, k, t, scale: s } = e;
  const runner = poly(M, k, sc([[-26, 0], [24, 0], [30, 7], [27, 9], [22, 3], [-26, 3]], s));
  const struts = SKID_STRUTS.flatMap((x) => [rect(M, k, x * s - 3, 0, x * s + 3, FLOOR_Z), rect(M, k, x * s - STRUT_TAB / 2, FLOOR_Z - 0.01, x * s + STRUT_TAB / 2, FLOOR_Z + t + 0.5)]);
  return { id: "esqui", label: "Esqui", count: 2, layers: [{ cs: k(M.CrossSection.union([runner, ...struts])), color: "skid" }] };
}

export const HELICOPTERO: KitTemplate = {
  id: "kitHelicoptero",
  label: "Helicóptero",
  blurb: "Helicóptero de montar: cabine com janelas, esquis, cauda e rotores que giram.",
  palette: [{ key: "body", label: "Cabine", default: "#f4f4f2" }, { key: "tail", label: "Cauda", default: "#d94a3a" }, { key: "skid", label: "Esquis", default: "#1c1c1e" }, { key: "rotor", label: "Rotores", default: "#f0b429" }],
  artTargets: [["lateral", "Lateral da cabine"], ["cauda", "Cauda"]],
  defaults: { rotorBlades: 2 },
  sections: [{ title: "Helicóptero", fields: [{ k: "rotorBlades", kind: "choice", label: "Pás do rotor principal", options: [["2", "2 pás"], ["3", "3 pás"]] }] }],
  build: (e) => {
    const { k, t, pinFit, scale: s } = e;
    const spin = spinOf(e);
    const n = Number(e.p.rotorBlades) === 3 ? 3 : 2;
    const main: KitPart = { id: "rotor", label: "Rotor principal", layers: [{ cs: k(rotorShape(e, { n, len: (n === 3 ? 36 : 50) * s, halfW: 3 * s, hub: 5 * s }).rotate(90)), color: "rotor" }], pins: [{ x: 0, y: 0, r: PIN_R, len: pinLen(t) }] };
    const tail: KitPart = { id: "rotor-cauda", label: "Rotor de cauda", layers: [{ cs: rotorShape(e, { n: 4, len: 9, halfW: 1.6, hub: 2.5 }), color: "rotor" }], pins: [{ x: 0, y: 0, r: PIN_R, len: pinLen(t) }] };
    const parts: KitPart[] = [side(e), deck(e, "piso"), deck(e, "teto"), bulk(e, "anteparo-frente"), bulk(e, "anteparo-tras"), boom(e), main, tail, skid(e), lockPart(e, { id: "trava", label: "Trava do rotor", color: "rotor", count: 2 })];

    const zb = baseZ(t);
    const roofBottom = zb + CABIN_H * s + 0.02;
    const roofTop = roofBottom + t;
    const lockZ = roofBottom - LOCK_GAP; // face de cima da trava de baixo do teto
    const assembly = [
      place("piso", [0, 0, FLOOR_Z]),
      place("lateral", [0, SIDE_Y * s + t / 2, zb], [90, 0, 0], 1),
      place("lateral", [0, -SIDE_Y * s + t / 2, zb], [90, 0, 0], 2),
      place("anteparo-frente", [FRONT_X * s - t / 2, 0, zb], [90, 0, 90]),
      place("anteparo-tras", [REAR_X * s - t / 2, 0, zb], [90, 0, 90]),
      place("teto", [0, 0, roofBottom]),
      place("cauda", [0, t / 2, zb], [90, 0, 0]),
      place("esqui", [0, SKID_Y * s + t / 2, 0], [90, 0, 0], 1),
      place("esqui", [0, -SKID_Y * s + t / 2, 0], [90, 0, 0], 2),
      place("rotor", [MAST_X * s, 0, roofTop + ROTOR_GAP + t], [180, 0, 0]),
      place("trava", [MAST_X * s, 0, lockZ], [180, 0, 0], 1),
      place("rotor-cauda", [TAIL_X * s, ROTOR_GAP + t + t / 2, zb + TAIL_Z * s], [90, 0, 0]),
      place("trava", [TAIL_X * s, -t / 2 - LOCK_GAP, zb + TAIL_Z * s], [90, 0, 0], 2),
    ];
    const pairs: KitPair[] = [
      { a: "lateral", b: "piso", kind: "tab-window" },
      { a: "lateral", b: "teto", kind: "tab-window" },
      { a: "lateral", b: "anteparo-frente", kind: "tab-window" },
      { a: "lateral", b: "anteparo-tras", kind: "tab-window" },
      { a: "cauda", b: "anteparo-tras", kind: "tab-window" },
      { a: "esqui", b: "piso", kind: "tab-window" },
      { a: "rotor", b: "teto", kind: "pin-hole", gap: spin / 2 },
      { a: "rotor", b: "trava#1", kind: "pin-hole", gap: pinFit },
      { a: "rotor-cauda", b: "cauda", kind: "pin-hole", gap: spin / 2 },
      { a: "rotor-cauda", b: "trava#2", kind: "pin-hole", gap: pinFit },
    ];
    const steps = [
      "Encaixe o piso {piso} nas abas de baixo das laterais {lateral} e os anteparos {anteparo-frente} e {anteparo-tras} nas janelas delas.",
      "Passe a cauda {cauda} pela janela do anteparo de trás.",
      "Ponha o teto {teto} nas abas de cima das laterais e os esquis {esqui} nas janelas do piso.",
      "Passe o pino do rotor {rotor} pelo furo do teto e prenda a trava {trava} por baixo.",
      "Passe o pino do rotor de cauda {rotor-cauda} pelo furo da cauda e prenda a outra trava do outro lado: os dois rotores têm que girar soltos.",
    ];
    return { parts, assembly, steps, pairs };
  },
};
