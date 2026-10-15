import type { Font } from "opentype.js";
import type { CS, ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import type { Mesh, Model } from "../types";
import { buildCard, DEFAULT_CARD, type CardParams, type CardText } from "./card";
import { buildEnvelope, DEFAULT_ENVELOPE, type EnvelopeParams, type FlapPose } from "./envelope";
import { DEFAULT_PIECES, buildPieces, type PiecesParams } from "./pieces";
import type { Pt } from "./motifs";

export type InviteColors = { frame: string; leaf: string; flower: string; plate: string; text: string; accent: string };
export type Palette = { id: string; label: string; colors: InviteColors };

const PLATE = "#e3f2fb";
export const PALETTES: Palette[] = [
  { id: "rosa", label: "Rosa", colors: { frame: "#b3245f", leaf: "#f4a6c0", flower: "#fbe6ee", plate: PLATE, text: "#ffffff", accent: "#e8739b" } },
  { id: "lilas", label: "Lilás", colors: { frame: "#6b3fa0", leaf: "#c3a6e8", flower: "#f1e9fb", plate: PLATE, text: "#ffffff", accent: "#a67fd6" } },
  { id: "azul", label: "Azul bebê", colors: { frame: "#2f6fa8", leaf: "#a9d2f2", flower: "#eef7fd", plate: PLATE, text: "#ffffff", accent: "#6fa8d8" } },
  { id: "salvia", label: "Verde sálvia", colors: { frame: "#4f7a5a", leaf: "#b4d1b9", flower: "#f1f7f2", plate: PLATE, text: "#ffffff", accent: "#86ae8e" } },
  { id: "dourado", label: "Dourado", colors: { frame: "#8a6a2f", leaf: "#dcbd72", flower: "#f7eed6", plate: PLATE, text: "#ffffff", accent: "#c79a3e" } },
  { id: "vinho", label: "Vinho", colors: { frame: "#6e1230", leaf: "#c9657f", flower: "#f6dfe5", plate: PLATE, text: "#ffffff", accent: "#a63a58" } },
  { id: "creme", label: "Creme", colors: { frame: "#8b8575", leaf: "#d9d3c3", flower: "#ffffff", plate: PLATE, text: "#ffffff", accent: "#b8b09c" } },
];
export const paletteOf = (id: string): Palette => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

const COLOR_OF: Record<string, keyof InviteColors> = {
  Moldura: "frame", Borboleta: "frame", Miolo: "frame", Folhas: "leaf", Detalhe: "leaf", Flores: "flower", Flor: "flower", "Cartão": "plate", Texto: "text", Destaque: "accent",
};

/** Pinta cada parte pelo nome com a paleta; com 2 tons as flores usam o tom das folhas. */
export function paint(models: Model[], c: InviteColors, tones: 2 | 3): Model[] {
  return models.map((m) => ({
    ...m,
    parts: m.parts.map((q) => {
      const key = COLOR_OF[q.name];
      const use = key === "flower" && tones === 2 ? "leaf" : key;
      return use ? { ...q, color: c[use] } : q;
    }),
  }));
}

/** Variações para as damas: o mesmo convite com outro nome e outra paleta (as paletas se repetem na ordem). */
export function variations(names: string[], paletteIds: string[]): { name: string; palette: Palette }[] {
  const ids = paletteIds.length ? paletteIds : [PALETTES[0].id];
  return names.map((name, i) => ({ name, palette: paletteOf(ids[i % ids.length]) }));
}

export type ButterflyMode = "none" | "relief" | "wings";

export type InviteParams = {
  env: EnvelopeParams;
  card: CardParams;
  pieces: PiecesParams;
  butterfly: ButterflyMode;
  tones: 2 | 3;
};

export const DEFAULT_INVITE: InviteParams = { env: DEFAULT_ENVELOPE, card: DEFAULT_CARD, pieces: DEFAULT_PIECES, butterfly: "relief", tones: 3 };

const CARD_CLEAR = 1; // folga do cartão até a moldura, de cada lado

export type InviteInfo = {
  /** Tamanho do envelope aberto (a cruz) e do cartão. */
  spread: { w: number; h: number };
  card: { w: number; h: number };
  height: number;
  tuleZ: number | null;
  pauseZ: number | null;
  /** Camada (contada de 1) depois da qual o tule entra. */
  tuleLayer: number | null;
  loose: number;
  bridged: number;
};

export type InviteOut = {
  envelope: Model;
  pieces: Model[];
  card: Model;
  pauses: number[];
  /** O envelope aberto (abas levantadas) e fechado (abas dobradas), com o cartão e as peças, só para a prévia. */
  open: Model[];
  closed: Model[];
  warnings: string[];
  info: InviteInfo;
};

/** Gira a malha em torno da dobradiça de uma aba (θ graus: 0 = plana, 180 = dobrada sobre o corpo), à altura `a`. */
export function foldMesh(mesh: Mesh, pose: FlapPose, deg: number, a: number): Mesh {
  const th = (deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const [o0, o1] = pose.out;
  const [h0, h1] = pose.hinge;
  const pos = new Float32Array(mesh.positions.length);
  for (let i = 0; i < pos.length; i += 3) {
    const rx = mesh.positions[i] - h0, ry = mesh.positions[i + 1] - h1, v = mesh.positions[i + 2] - a;
    const u = rx * o0 + ry * o1, t = -rx * o1 + ry * o0;
    const u2 = u * c - v * s, v2 = u * s + v * c;
    pos[i] = h0 + u2 * o0 - t * o1;
    pos[i + 1] = h1 + u2 * o1 + t * o0;
    pos[i + 2] = a + v2;
  }
  return { positions: pos, indices: mesh.indices };
}

const move = (m: Model, dx: number, dy: number, dz: number, name = m.name, previewOnly = true): Model => ({
  ...m, name, previewOnly,
  parts: m.parts.map((q) => ({ ...q, mesh: { ...q.mesh, positions: q.mesh.positions.map((v, i) => v + (i % 3 === 0 ? dx : i % 3 === 1 ? dy : dz)) } })),
});

const OPEN_DEG = 62;
const GLUE_Z = 0.05;

/** Só o cartão, no tamanho que cabe no envelope (para as variações: muda o nome e a paleta, o resto da geometria é o mesmo). */
export function buildInviteCard(M: ManifoldToplevel, p: InviteParams, colors: InviteColors, text: CardText, fonts: { name: Font; text: Font; emoji?: Font }): { card: Model; warnings: string[] } {
  return scoped((k) => {
    const cardP: CardParams = { ...p.card, w: p.env.w - 2 * (p.env.frame + CARD_CLEAR), h: p.env.h - 2 * (p.env.frame + CARD_CLEAR) };
    const out = buildCard(M, k, cardP, text, fonts, colors);
    return { card: paint([{ name: "Cartão", parts: out.parts }], colors, p.tones)[0], warnings: out.warnings };
  });
}

/** O convite inteiro: envelope em cruz (com a pausa do tule), cartão transparente e peças em relevo, mais as prévias. */
export function buildInvite(
  M: ManifoldToplevel,
  p: InviteParams,
  colors: InviteColors,
  text: CardText,
  fonts: { name: Font; text: Font; emoji?: Font },
  custom: CS | null,
): InviteOut {
  return scoped((k) => {
    const env: EnvelopeParams = { ...p.env, tones: p.tones, wings: p.butterfly === "wings" && p.env.tulle };
    const out = buildEnvelope(M, k, env, colors, custom);
    const warnings = [...out.warnings];
    if (p.butterfly === "wings" && !p.env.tulle) warnings.push("Asas levantadas precisam do tule (as asas soltas ficam presas nele): usei a borboleta em relevo, para colar.");
    const cardP: CardParams = { ...p.card, w: p.env.w - 2 * (p.env.frame + CARD_CLEAR), h: p.env.h - 2 * (p.env.frame + CARD_CLEAR) };
    const card = buildCard(M, k, cardP, text, fonts, colors);
    warnings.push(...card.warnings);
    const useRelief = p.butterfly === "relief" || (p.butterfly === "wings" && !p.env.tulle);
    const piecesP: PiecesParams = { ...p.pieces, butterflies: useRelief ? p.pieces.butterflies : 0 };
    const pieces = paint(buildPieces(M, k, piecesP), colors, p.tones);
    const envelope = paint([{ name: "Envelope", parts: out.parts }], colors, p.tones)[0];
    const cardModel = paint([{ name: "Cartão", parts: card.parts }], colors, p.tones)[0];

    // prévias: cada região separada, as abas giram na dobradiça
    const cardH = p.card.plate + (p.card.style === "relief" ? p.card.relief : 0);
    const a = out.height + cardH / 2 + 0.1;
    const regionsPainted = out.regions.map((r) => ({ id: r.id, model: paint([{ name: r.id, parts: r.parts }], colors, p.tones)[0] }));
    const fold = (deg: number): Model[] =>
      regionsPainted.map(({ id, model }) => {
        const pose = out.poses.find((q) => q.id === id);
        if (!pose) return { ...model, name: "Corpo", previewOnly: true };
        return { ...model, name: `Aba ${id}`, previewOnly: true, parts: model.parts.map((q) => ({ ...q, mesh: foldMesh(q.mesh, pose, deg, a) })) };
      });
    const seated = move(cardModel, 0, 0, out.height + GLUE_Z, "Cartão (não imprime)");
    const topZ = 2 * a + GLUE_Z;
    const stack: Pt[] = [[0, 0], [-0.3 * p.env.w, -0.22 * p.env.h], [0.3 * p.env.w, 0.24 * p.env.h], [-0.3 * p.env.w, 0.26 * p.env.h]];
    const centerOf = (m: Model): Pt => {
      const xs = m.parts.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 0));
      const ys = m.parts.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 1));
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    };
    // as peças saem lado a lado na mesa; na prévia cada uma vai para o seu lugar sobre o envelope fechado
    const onTop = (list: Model[]) => {
      let f = 0;
      return list.map((m) => {
        const at = m.name.startsWith("Borboleta") ? stack[0] : stack[1 + (f++ % 3)];
        const c = centerOf(m);
        return move(m, at[0] - c[0], at[1] - c[1], topZ, `${m.name} (não imprime)`);
      });
    };
    const open = [...fold(OPEN_DEG), seated];
    const closed = [...fold(180), seated, ...onTop(pieces)];

    const lh = p.env.layer;
    const info: InviteInfo = {
      spread: out.spread,
      card: { w: cardP.w, h: cardP.h },
      height: out.height,
      tuleZ: out.tuleZ,
      pauseZ: out.pauseZ,
      tuleLayer: out.tuleZ === null ? null : Math.round(out.tuleZ / lh),
      loose: out.loose,
      bridged: out.bridged,
    };
    return { envelope, pieces, card: cardModel, pauses: out.pauseZ === null ? [] : [out.pauseZ], open, closed, warnings, info };
  });
}
