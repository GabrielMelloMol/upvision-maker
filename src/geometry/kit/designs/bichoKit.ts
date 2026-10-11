import { nozzleMm } from "../../bed";
import type { KitBuild, KitPair, KitTemplate, Placement } from "../types";
import { BICHO_LIMITS, DEFAULT_BICHO, bichoAnchors, bichoDims, bichoHead, bichoRib, bichoSpine, bichoTail, type BichoParams, type HeadStyle, type Profile, type TailStyle } from "./bicho";

/**
 * Kit "Bicho de 4 patas": coluna lateral + fatias encaixadas por meia-fenda + cabeça e cauda em rabo de andorinha.
 * Montado: x ao longo do corpo (cauda em 0), y na largura (centrado), z para cima (chão em 0).
 */
const asParams = (p: Record<string, string | number | boolean>, scale: number): BichoParams => {
  const [lmin, lmax] = BICHO_LIMITS.length, [smin, smax] = BICHO_LIMITS.slices;
  const num = (k: string, d: number) => (Number.isFinite(Number(p[k])) ? Number(p[k]) : d);
  return {
    length: Math.min(lmax, Math.max(lmin, num("length", DEFAULT_BICHO.length) * scale)),
    slices: Math.min(smax, Math.max(smin, Math.round(num("slices", DEFAULT_BICHO.slices)))),
    head: (p.head as HeadStyle) || DEFAULT_BICHO.head,
    tail: (p.tail as TailStyle) || DEFAULT_BICHO.tail,
    profile: (p.profile as Profile) || DEFAULT_BICHO.profile,
  };
};

/** Quantas fatias cabem no maior cartão (240 × 160) para este comprimento (medido com a cabeça mais larga). */
const maxSlicesFor = (length: number) => (length <= 90 ? 6 : length <= 110 ? 5 : 4);

export const bichoTemplate: KitTemplate = {
  id: "kitBicho",
  label: "Bicho de 4 patas (kit)",
  blurb: "Um bichinho de 4 patas de encaixar: coluna de lado, fatias do corpo e das pernas, cabeça e cauda. Escolha o tipo de cabeça e de cauda.",
  palette: [
    { key: "body", label: "Corpo", default: "#c8a77d" },
    { key: "accent", label: "Cabeça e cauda", default: "#7a5a3a" },
  ],
  artTargets: [["coluna", "Coluna (a lateral do bicho)"]],
  scaleMax: 1.4,
  defaults: { ...DEFAULT_BICHO },
  sections: [
    {
      title: "O bicho",
      fields: [
        { k: "length", kind: "num", label: "Comprimento do corpo", min: BICHO_LIMITS.length[0], max: BICHO_LIMITS.length[1], step: 5, unit: "mm", hint: "Sem a cabeça e a cauda (o bicho todo fica uns 50% maior). Com mais fatias, diminua o comprimento: as peças precisam caber no cartão." },
        { k: "slices", kind: "num", label: "Fatias", min: BICHO_LIMITS.slices[0], max: BICHO_LIMITS.slices[1], step: 1, unit: "", hint: "2 são as de perna (frente e trás); as outras são do corpo." },
        { k: "head", kind: "choice", label: "Cabeça", options: [["dog", "Cachorro"], ["cat", "Gato"], ["dino", "Dinossauro"]] },
        { k: "tail", kind: "choice", label: "Cauda", options: [["short", "Curta"], ["long", "Longa"], ["up", "Erguida"]] },
        { k: "profile", kind: "choice", label: "Seção das fatias", options: [["oval", "Oval"], ["boxy", "Quase retangular"]] },
      ],
    },
  ],
  build: ({ M, k, t, fit, scale, p }): KitBuild => {
    const asked = asParams(p, scale);
    const fit_ = Math.min(asked.slices, maxSlicesFor(asked.length));
    const bp = { ...asked, slices: fit_ };
    const env = { M, k, t, fit, nozzle: nozzleMm() };
    const d = bichoDims(bp, env);
    const a = bichoAnchors(bp, env);
    const legs = d.ribs.filter((r) => r.leg), bodies = d.ribs.filter((r) => !r.leg);
    const parts: KitBuild["parts"] = [
      { id: "coluna", label: "Coluna", layers: [{ cs: k(bichoSpine(env, bp)), color: "body" }] },
      { id: "fatiaPerna", label: "Fatia de perna", count: legs.length, layers: [{ cs: k(bichoRib(env, bp, true)), color: "body" }] },
      ...(bodies.length ? [{ id: "fatiaCorpo", label: "Fatia de corpo", count: bodies.length, layers: [{ cs: k(bichoRib(env, bp, false)), color: "body" }] }] : []),
      { id: "cabeca", label: "Cabeça", layers: [{ cs: k(bichoHead(env, bp)), color: "accent" }] },
      { id: "cauda", label: "Cauda", layers: [{ cs: k(bichoTail(env, bp)), color: "accent" }] },
    ];
    const flat = (part: string, x: number, z: number, index?: number): Placement => ({ part, index, rotate: [90, 0, 0], translate: [x, t / 2, z] });
    const rib = (part: string, x: number, index: number): Placement => ({ part, index, rotate: [90, 0, 90], translate: [x - t / 2, 0, 0] });
    const assembly: Placement[] = [
      flat("coluna", 0, d.P),
      ...legs.map((r, i) => rib("fatiaPerna", r.x, i + 1)),
      ...bodies.map((r, i) => rib("fatiaCorpo", r.x, i + 1)),
      flat("cabeca", a.headX, d.P + a.headY),
      flat("cauda", a.tailX, d.P + a.tailY),
    ];
    const pairs: KitPair[] = [
      ...legs.map((_, i): KitPair => ({ a: "coluna", b: `fatiaPerna#${i + 1}`, kind: "slot-slot" })),
      ...bodies.map((_, i): KitPair => ({ a: "coluna", b: `fatiaCorpo#${i + 1}`, kind: "slot-slot" })),
      { a: "coluna", b: "cabeca", kind: "other" },
      { a: "coluna", b: "cauda", kind: "other" },
    ];
    const ribs = bodies.length ? "{fatiaPerna} e {fatiaCorpo}" : "{fatiaPerna}";
    const steps = [
      `Corte os pontos de corte com alicate e lixe os cotos.`,
      `Vire a coluna {coluna} de cabeça para baixo e encaixe as fatias ${ribs} pelas fendas, da frente para trás: as de perna são as das pontas.`,
      `Desvire: o bicho fica em pé nas 4 pernas. Desça a cabeça {cabeca} pelo soquete da frente e a cauda {cauda} pelo de trás.`,
    ];
    const warnings = fit_ < asked.slices ? [`Com ${Math.round(asked.length)} mm de comprimento só cabem ${fit_} fatias no cartão: usei ${fit_}. Diminua o comprimento para usar mais.`] : [];
    return { parts, assembly, steps, pairs, warnings };
  },
};
