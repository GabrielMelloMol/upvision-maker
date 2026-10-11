import type { CS } from "../../manifold";
import { disc, pinHole, rect, tabWindow } from "../joints";
import type { KitEnv, KitPair, KitPart, KitTemplate, Placement } from "../types";

/*
 * Trator de montar (projeto em docs/design/kitcard-foguete-trator.md): duas laterais idênticas ligadas por travessas com abas que
 * entram em janelas, rodas grandes atrás e pequenas na frente com pino no furo da lateral, cabine com para-brisa e teto.
 * Medidas em "u" = comprimento / 100, então o desenho escala junto.
 */

/** Comprimento máximo que ainda cabe no maior cartão (240 × 160) com as folgas e molduras no máximo; acima disso o app limita e avisa. */
export const TRACTOR_MAX_L = 90;
const WIDTH_U = 34; // largura interna entre as laterais
const WHEEL_GAP = 0.5; // a roda fica afastada da lateral para girar
const PIN_PAST = 0.6; // quanto o pino passa da face de dentro da lateral
const REAR = { x: 22, z: 22, r: 22 } as const;
const FRONT = { x: 84, z: 12, r: 12 } as const;
const BOSS_R = 5.5;
const MIN_TAB = 2.4; // aba mais estreita que isto não aguenta (mm)
const TAB_SHARE = 0.3; // largura máxima da aba, em fração do comprimento da travessa
const TAB_MARGIN = 0.4; // sobra entre a aba e a ponta da travessa (mm)
const GLASS = { x0: 34, z0: 28, x1: 46, z1: 42 } as const; // janela vazada da cabine
const LUG_COUNTS = { rear: 1, front: 0.66 } as const;

type Bar = { id: string; label: string; plane: "xy" | "yz"; at: number; z?: [number, number]; x?: [number, number]; tabs: number[]; color: string; /** largura própria das abas (padrão: a das travessas) */ tw?: number };

export const tractorKit: KitTemplate = {
  id: "kitTractor",
  label: "Trator",
  blurb: "Trator de montar: rodas grandes atrás, cabine com para-brisa e teto, capô e escapamento, rodas com pino.",
  palette: [
    { key: "body", label: "Carroceria", default: "#3a9d3f" },
    { key: "cabin", label: "Cabine", default: "#f4f4f2" },
    { key: "wheel", label: "Rodas e escapamento", default: "#1c1c1e" },
  ],
  artTargets: [["lateral", "Lateral"], ["capo", "Capô"]],
  defaults: { cardSize: "xlarge", length: 90, lugs: 12, wheelsSpin: false, chimney: true },
  sections: [
    {
      title: "Trator",
      fields: [
        { k: "length", kind: "num", label: "Comprimento do trator", min: 60, max: TRACTOR_MAX_L, step: 5, unit: "mm", hint: "Comprimento montado. As rodas de trás têm 44% disso de diâmetro. O maior cartão limita em 90 mm." },
        { k: "lugs", kind: "num", label: "Garras da roda de trás", min: 8, max: 18, step: 1, unit: "", hint: "Dentes da borda, para parecer pneu de trator." },
        { k: "wheelsSpin", kind: "bool", label: "Rodas giram (folga maior no furo)" },
        { k: "chimney", kind: "bool", label: "Escapamento no capô" },
      ],
    },
  ],
  build: (env: KitEnv) => {
    const { M, k, t, fit, pinFit, scale, p } = env;
    const want = Number(p.length) * scale;
    const u = Math.min(want, TRACTOR_MAX_L) / 100;
    const D = WIDTH_U * u;
    const tabW = Math.max(5, 8 * u);
    const holeFit = p.wheelsSpin ? Number(p.spin) : pinFit;
    const pinR = Math.max(1.5, 2 * u);
    const U = (...c: CS[]) => k(M.CrossSection.union(c));

    // lateral: longarina + cabine + capô + bossas dos eixos, com a janela da cabine vazada
    const side0 = U(rect(M, k, 8 * u, 14 * u, 97 * u, 24 * u), rect(M, k, 18 * u, 14 * u, 52 * u, 52 * u), rect(M, k, 52 * u, 14 * u, 97 * u, 34.5 * u), disc(M, k, REAR.x * u, REAR.z * u, BOSS_R * u), disc(M, k, FRONT.x * u, FRONT.z * u, BOSS_R * u));
    const rawBars: Bar[] = [
      { id: "piso", label: "Piso", plane: "xy", at: 19 * u, x: [31 * u, 50 * u], tabs: [35 * u, 46 * u], color: "body" },
      { id: "encosto", label: "Encosto do banco", plane: "yz", at: 28 * u, z: [22 * u, 44 * u], tabs: [27 * u, 40 * u], color: "cabin" },
      { id: "parabrisa", label: "Para-brisa", plane: "yz", at: 50 * u, z: [19 * u + t / 2 + 0.3, 48 * u - t / 2 - 0.2], tabs: [26 * u, 42 * u], color: "cabin" },
      { id: "teto", label: "Teto", plane: "xy", at: 48 * u, x: [20 * u, 50 * u], tabs: [26 * u, 44 * u], color: "cabin" },
      { id: "capo", label: "Capô", plane: "xy", at: 32 * u, x: [52 * u, 97 * u], tabs: [58 * u, 90 * u], color: "body" },
      { id: "grade", label: "Grade do radiador", plane: "yz", at: 94 * u, z: [15 * u, 32 * u - t / 2 - 0.3], tabs: [19 * u, 27 * u], color: "wheel", tw: Math.max(3, 4.5 * u) },
    ];
    // as abas ficam dentro da travessa e com largura proporcional a ela: com o modelo pequeno, abas de largura fixa passavam da
    // travessa e batiam nas abas das vizinhas (para-brisa × piso e teto, capô × grade)
    const bars = rawBars.map((b): Bar => {
      const [a0, a1] = b.plane === "xy" ? (b.x as [number, number]) : (b.z as [number, number]);
      const tw = Math.max(MIN_TAB, Math.min(b.tw ?? tabW, TAB_SHARE * (a1 - a0)));
      const lo = a0 + tw / 2 + TAB_MARGIN, hi = a1 - tw / 2 - TAB_MARGIN;
      return { ...b, tw, tabs: b.tabs.map((c) => Math.min(Math.max(c, lo), Math.max(lo, hi))) };
    });
    const windows = bars.flatMap((b) => b.tabs.map((c) => (b.plane === "xy" ? tabWindow(M, k, { cx: c, cy: b.at, tabW: b.tw ?? tabW, t, fit }) : tabWindow(M, k, { cx: b.at, cy: c, tabW: b.tw ?? tabW, t, fit, vertical: true }))));
    const holes = [pinHole(M, k, { x: REAR.x * u, y: REAR.z * u, r: pinR, fit: holeFit }), pinHole(M, k, { x: FRONT.x * u, y: FRONT.z * u, r: pinR, fit: holeFit })];
    const glass = rect(M, k, GLASS.x0 * u, GLASS.z0 * u, GLASS.x1 * u, GLASS.z1 * u);
    const lateral = k(side0.subtract(U(glass, ...windows, ...holes)));

    // travessas: corpo entre as laterais + 2 abas por lado, que atravessam a lateral
    const barPart = (b: Bar): KitPart => {
      const [a0, a1] = b.plane === "xy" ? (b.x as [number, number]) : (b.z as [number, number]);
      const across = (lo: number, hi: number, c0: number, c1: number) => (b.plane === "xy" ? rect(M, k, c0, lo, c1, hi) : rect(M, k, lo, c0, hi, c1)); // (eixo da travessa, eixo da aba)
      const bodyR = across(-D / 2, D / 2, a0, a1);
      const tabsR = b.tabs.flatMap((c) => [across(D / 2 - 0.01, D / 2 + t, c - (b.tw ?? tabW) / 2, c + (b.tw ?? tabW) / 2), across(-D / 2 - t, -D / 2 + 0.01, c - (b.tw ?? tabW) / 2, c + (b.tw ?? tabW) / 2)]);
      let cs = U(bodyR, ...tabsR);
      if (b.id === "capo" && p.chimney) cs = k(cs.subtract(tabWindow(M, k, { cx: 76 * u, cy: 0, tabW: Math.max(3, 3 * u), t, fit })));
      return { id: b.id, label: b.label, layers: [{ cs, color: b.color }] };
    };
    const parts: KitPart[] = [{ id: "lateral", label: "Lateral", count: 2, layers: [{ cs: lateral, color: "body" }] }, ...bars.map(barPart)];

    // escapamento: placa em pé sobre o capô, com aba que atravessa a janela do capô
    const chimneyTab = Math.max(3, 3 * u);
    if (p.chimney) {
      const zt = 32 * u + t / 2;
      parts.push({ id: "escapamento", label: "Escapamento", layers: [{ cs: U(rect(M, k, 76 * u - 2.5 * u, zt, 76 * u + 2.5 * u, zt + 14 * u), rect(M, k, 76 * u - chimneyTab / 2, zt - t, 76 * u + chimneyTab / 2, zt + 0.01)), color: "wheel" }] });
    }

    // rodas: disco com garras na borda e pino em pé
    const wheel = (id: string, label: string, r: number, lugs: number): KitPart => {
      const R = r * u;
      let cs: CS = disc(M, k, 0, 0, R, 64);
      const w = (Math.PI * 2 * R) / lugs / 2, dep = Math.max(1.2, 0.1 * R);
      for (let i = 0; i < lugs; i++) cs = k(cs.subtract(k(rect(M, k, -w / 2, R - dep, w / 2, R + 1).rotate((360 * i) / lugs))));
      return { id, label, count: 2, layers: [{ cs, color: "wheel" }], pins: [{ x: 0, y: 0, r: pinR, len: t + WHEEL_GAP + PIN_PAST }] };
    };
    parts.push(wheel("rodaTras", "Roda de trás", REAR.r, Math.round(Number(p.lugs))), wheel("rodaFrente", "Roda da frente", FRONT.r, Math.max(6, Math.round(Number(p.lugs) * LUG_COUNTS.front))));

    // montagem
    const assembly: Placement[] = [{ part: "lateral", rotate: [90, 0, 0], translate: [0, D / 2 + t, 0] }, { part: "lateral", rotate: [90, 0, 0], translate: [0, -D / 2, 0] }];
    for (const b of bars) assembly.push(b.plane === "xy" ? { part: b.id, translate: [0, 0, b.at - t / 2] } : { part: b.id, rotate: [90, 0, 90], translate: [b.at - t / 2, 0, 0] });
    if (p.chimney) assembly.push({ part: "escapamento", rotate: [90, 0, 0], translate: [0, t / 2, 0] });
    const outer = D / 2 + 2 * t + WHEEL_GAP;
    for (const [id, ax] of [["rodaTras", REAR], ["rodaFrente", FRONT]] as const) {
      assembly.push({ part: id, index: 1, rotate: [90, 0, 0], translate: [ax.x * u, outer, ax.z * u] }, { part: id, index: 2, rotate: [-90, 0, 0], translate: [ax.x * u, -outer, ax.z * u] });
    }

    const pairs: KitPair[] = [];
    for (const b of bars) for (const n of [1, 2]) pairs.push({ a: b.id, b: `lateral#${n}`, kind: "tab-window" });
    if (p.chimney) pairs.push({ a: "escapamento", b: "capo", kind: "tab-window" });
    for (const id of ["rodaTras", "rodaFrente"]) for (const n of [1, 2]) pairs.push({ a: `${id}#${n}`, b: `lateral#${n}`, kind: "pin-hole", gap: holeFit });

    const warnings: string[] = [];
    if (want > TRACTOR_MAX_L) warnings.push(`O trator de ${Math.round(want)} mm não cabe no maior cartão: limitei a ${TRACTOR_MAX_L} mm.`);
    if (u < 0.8) warnings.push("Trator pequeno: as janelas e as abas ficam apertadas. Aumente o comprimento ou a espessura se as travessas não encaixarem.");
    return {
      parts,
      assembly,
      pairs,
      warnings,
      steps: [
        "Prenda as rodas {rodaTras} e {rodaFrente} nos furos das laterais {lateral}, de fora para dentro (pino por dentro da lateral).",
        "Com as laterais de pé, passe as abas das travessas pelas janelas: {piso}, {encosto}, {parabrisa}, a grade do radiador {grade}, o {capo} e por último o {teto}.",
        ...(p.chimney ? ["Encaixe o escapamento {escapamento} no furo do capô."] : []),
      ],
    };
  },
};
