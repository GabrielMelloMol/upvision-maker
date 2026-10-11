import { nozzleMm } from "../../bed";
import type { KitBuild, KitPair, KitTemplate, Placement } from "../types";
import { BAU_LIMITS, DEFAULT_BAU, FLOOR_Z, bauDims, bauPanels, type BauParams } from "./bau";

/**
 * Kit "Baú": caixa de abas e fendas com tampa que abraça a caixa e abre por dobradiça de pino.
 * Montado: x na largura (centrado), y na profundidade (frente em -y, dobradiça atrás), z para cima (chão em 0).
 */
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

const asParams = (p: Record<string, string | number | boolean>, scale: number): BauParams => {
  const num = (k: string, d: number) => (Number.isFinite(Number(p[k])) ? Number(p[k]) : d);
  return {
    width: clamp(num("width", DEFAULT_BAU.width) * scale, BAU_LIMITS.width),
    depth: clamp(num("depth", DEFAULT_BAU.depth) * scale, BAU_LIMITS.depth),
    height: clamp(num("height", DEFAULT_BAU.height) * scale, BAU_LIMITS.height),
    pin: Number(p.pin) === 4 ? 4 : 3,
  };
};

export const bauTemplate: KitTemplate = {
  id: "kitBau",
  label: "Baú (kit)",
  blurb: "Um baú de encaixar: caixa com tampa que abre por dobradiça de pino. Escolha o tamanho.",
  palette: [
    { key: "body", label: "Caixa", default: "#9b6a3c" },
    { key: "lid", label: "Tampa", default: "#c58b4e" },
  ],
  artTargets: [["tampaTopo", "Topo da tampa"]],
  defaults: { width: DEFAULT_BAU.width, depth: DEFAULT_BAU.depth, height: DEFAULT_BAU.height, pin: String(DEFAULT_BAU.pin) },
  sections: [
    {
      title: "O baú (medidas de dentro)",
      fields: [
        { k: "width", kind: "num", label: "Largura", min: BAU_LIMITS.width[0], max: BAU_LIMITS.width[1], step: 1, unit: "mm" },
        { k: "depth", kind: "num", label: "Profundidade", min: BAU_LIMITS.depth[0], max: BAU_LIMITS.depth[1], step: 1, unit: "mm" },
        { k: "height", kind: "num", label: "Altura da caixa", min: BAU_LIMITS.height[0], max: BAU_LIMITS.height[1], step: 1, unit: "mm", hint: "A tampa sobe uns 4 mm além disso. Os limites vêm do que cabe no cartão." },
        { k: "pin", kind: "choice", label: "Diâmetro do pino da dobradiça", options: [["3", "3 mm"], ["4", "4 mm (bico de 0,6 ou mais)"]] },
      ],
    },
  ],
  build: ({ M, k, t, fit, pinFit, scale, p }): KitBuild => {
    const bp = asParams(p, scale);
    const env = { M, k, t, fit, nozzle: nozzleMm() };
    const d = bauDims(bp, env);
    const { box, lid } = bauPanels(env, bp);
    const zo = d.H - (d.hl - FLOOR_Z - t); // a tampa fechada: origem dela
    const headR = d.pr + 2.2;
    const pinPart = k(M.CrossSection.circle(headR, 40));
    const pinAxis: [number, number] = [d.hingeU, d.hingeV];
    const lidOuterX = d.lid.W / 2 + t;
    const parts: KitBuild["parts"] = [
      { id: "parede", label: "Frente e fundo", count: 2, layers: [{ cs: k(box.front), color: "body" }] },
      { id: "lateral", label: "Lateral", count: 2, layers: [{ cs: k(box.side), color: "body" }] },
      { id: "piso", label: "Piso", layers: [{ cs: k(box.plate), color: "body" }] },
      { id: "tampaTopo", label: "Topo da tampa", layers: [{ cs: k(lid.plate), color: "lid" }] },
      { id: "tampaFrente", label: "Frente da tampa", layers: [{ cs: k(lid.front), color: "lid" }] },
      { id: "tampaLateral", label: "Lateral da tampa", count: 2, layers: [{ cs: k(lid.side), color: "lid" }] },
      { id: "pino", label: "Pino da dobradiça", count: 2, layers: [{ cs: pinPart, color: "lid" }], pins: [{ x: 0, y: 0, r: d.pr, len: d.pinLen }] },
    ];
    const wall = (part: string, index: number, y: number, z: number): Placement => ({ part, index, rotate: [90, 0, 0], translate: [0, y, z] });
    const side = (part: string, index: number, x: number, z: number): Placement => ({ part, index, rotate: [90, 0, 90], translate: [x, 0, z] });
    const assembly: Placement[] = [
      wall("parede", 1, -d.D / 2, 0),
      wall("parede", 2, d.D / 2 + t, 0),
      side("lateral", 1, d.W / 2, 0),
      side("lateral", 2, -d.W / 2 - t, 0),
      { part: "piso", translate: [0, 0, FLOOR_Z] },
      { part: "tampaTopo", translate: [0, 0, d.H] },
      { part: "tampaFrente", rotate: [90, 0, 0], translate: [0, -d.lid.D / 2, zo] },
      side("tampaLateral", 1, d.lid.W / 2, zo),
      side("tampaLateral", 2, -d.lid.W / 2 - t, zo),
      { part: "pino", index: 1, rotate: [0, -90, 0], translate: [lidOuterX + t, pinAxis[0], pinAxis[1]] },
      { part: "pino", index: 2, rotate: [0, 90, 0], translate: [-(lidOuterX + t), pinAxis[0], pinAxis[1]] },
    ];
    const tw = (a: string, b: string): KitPair => ({ a, b, kind: "tab-window" });
    const pairs: KitPair[] = [
      ...[1, 2].flatMap((i) => [1, 2].map((j) => tw(`parede#${i}`, `lateral#${j}`))),
      ...[1, 2].flatMap((i) => [tw("piso", `parede#${i}`), tw("piso", `lateral#${i}`), tw("tampaTopo", `tampaLateral#${i}`), tw("tampaFrente", `tampaLateral#${i}`)]),
      tw("tampaTopo", "tampaFrente"),
      ...[1, 2].flatMap((i) => [
        { a: `pino#${i}`, b: `tampaLateral#${i}`, kind: "pin-hole", gap: pinFit } as KitPair,
        { a: `pino#${i}`, b: `lateral#${i}`, kind: "pin-hole", gap: pinFit } as KitPair,
        { a: "tampaTopo", b: `parede#${i}`, kind: "other", gap: 0 } as KitPair,
        { a: "tampaTopo", b: `lateral#${i}`, kind: "other", gap: 0 } as KitPair,
      ]),
    ];
    const steps = [
      "Corte os pontos de corte com alicate e lixe os cotos.",
      "Monte a caixa: encaixe a frente e o fundo {parede} nas laterais {lateral} pelas abas e ponha o piso {piso}.",
      "Monte a tampa com o topo {tampaTopo} para baixo: encaixe a frente {tampaFrente} e as laterais {tampaLateral}. A tampa não tem parede de trás.",
      "Pouse a tampa na caixa, alinhe os furos atrás e empurre um pino {pino} de cada lado.",
    ];
    return { parts, assembly, steps, pairs };
  },
};
