import type { CS, ManifoldToplevel } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { artParts, boxOf, MissingInput, offsetOf, plateStand, roundedRect, slab, solidMesh, type ElementBox, type ModelCtx, type ModelOutput } from "./common";

export type MusicMount = "none" | "stand" | "magnet";

export type MusicCardParams = {
  title: string;
  artist: string;
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  timeStart: string;
  timeEnd: string;
  progress: number; // 0 a 100 (%)
  showButtons: boolean;
  width: number;
  thickness: number;
  relief: number;
  artHeight: number; // quanto a foto/desenho enviado ocupa, em fração da largura útil (0 = sem espaço para foto)
  mount: MusicMount;
  plateColor: string;
  textColor: string;
  accentColor: string;
};

export const DEFAULT_MUSIC_CARD: MusicCardParams = {
  title: "Nossa canção",
  artist: "Ana e Beto",
  line1: "Todo dia ao seu lado",
  line2: "é a minha parte favorita",
  line3: "",
  line4: "",
  timeStart: "1:12",
  timeEnd: "3:45",
  progress: 35,
  showButtons: true,
  width: 90,
  thickness: 3.6,
  relief: 0.8,
  artHeight: 1,
  mount: "stand",
  plateColor: "#f5f1e6",
  textColor: "#1f2937",
  accentColor: "#e11d48",
};

const MARGIN = 0.07; // frações da largura
const GAP = 0.04;
const TITLE_H = 0.095;
const ARTIST_H = 0.062;
const LYRIC_H = 0.06;
const LYRIC_GAP = 0.4; // fração da altura da linha
const BAR_H = 0.02;
const KNOB_R = 0.034;
const TIME_H = 0.055;
const BUTTON_H = 0.115;
const MAGNET_D = 10.2;
const MAGNET_DEPTH = 2;
const MIN_FACE_MM = 1.2; // sobra da frente sobre o ímã

const poly = (M: ManifoldToplevel, pts: [number, number][]): CS => new M.CrossSection([pts], "NonZero");
const circle = (M: ManifoldToplevel, r: number): CS => M.CrossSection.circle(r, 48);

/** Triângulo de "tocar" apontando para a direita, centrado em (cx, cy), com altura h. */
const playTriangle = (M: ManifoldToplevel, cx: number, cy: number, h: number, dir: 1 | -1 = 1): CS =>
  poly(M, [[cx - (dir * h) / 3, cy - h / 2], [cx - (dir * h) / 3, cy + h / 2], [cx + (dir * (2 * h)) / 3, cy]]);

/** Botões genéricos de player: anterior, tocar e próxima. Devolve o desenho escuro e o destaque (círculo do tocar). */
function playerButtons(M: ManifoldToplevel, cy: number, h: number, k: (c: CS) => CS): { dark: CS; accent: CS } {
  const step = h * 1.7;
  const bar = (x: number) => k(k(M.CrossSection.square([h * 0.1, h * 0.42], true)).translate([x, cy]));
  const skip = (dir: 1 | -1) => {
    const x = dir * step;
    const tri = k(playTriangle(M, x + (dir * h * 0.06), cy, h * 0.42, dir === 1 ? 1 : -1));
    return k(M.CrossSection.union([tri, bar(x + dir * h * 0.3)]));
  };
  const disc = k(k(circle(M, h / 2)).translate([0, cy]));
  const accent = k(disc.subtract(k(playTriangle(M, h * 0.04, cy, h * 0.4))));
  return { dark: k(M.CrossSection.union([skip(-1), skip(1)])), accent };
}

/**
 * Cartão de música (#112): placa de mesa ou ímã com foto (opcional, a imagem enviada), título, artista, trecho da
 * letra, barra de progresso e botões de player de desenho próprio. Tudo em relevo sobre a placa, em 3 a 4 cores.
 */
export function buildMusicCard(ctx: ModelCtx, p: MusicCardParams): ModelOutput {
  const { M, text } = ctx;
  if (!p.title.trim() && !p.artist.trim() && !ctx.art) throw new MissingInput("Digite o título da música ou envie uma foto.");
  const W = p.width;
  const m = W * MARGIN, g = W * GAP, q = W - 2 * m;
  const lyrics = [p.line1, p.line2, p.line3, p.line4].map((l) => l.trim()).filter(Boolean);
  const photo = !!ctx.art && p.artHeight > 0;
  const photoH = photo ? q * p.artHeight : 0;
  const titleH = p.title.trim() ? W * TITLE_H : 0, artistH = p.artist.trim() ? W * ARTIST_H : 0;
  const lyricH = lyrics.length ? lyrics.length * W * LYRIC_H + (lyrics.length - 1) * W * LYRIC_H * LYRIC_GAP : 0;
  const timesH = p.timeStart.trim() || p.timeEnd.trim() ? W * TIME_H : 0;
  const barBlock = W * KNOB_R * 2 + (timesH && g * 0.4 + timesH);
  const buttonH = p.showButtons ? W * BUTTON_H : 0;
  const blocks = [photoH, titleH, artistH, lyricH, barBlock, buttonH].filter((h) => h > 0);
  const H = 2 * m + blocks.reduce((s, h) => s + h, 0) + (blocks.length - 1) * g;

  return scoped((k) => {
    let cursor = H / 2 - m; // topo do próximo bloco
    const take = (h: number) => {
      const mid = cursor - h / 2;
      cursor -= h + g;
      return mid;
    };
    const elements: ElementBox[] = [];
    const dark: CS[] = [];
    const accent: CS[] = [];
    const place = (id: string, label: string, cs: CS | null, into: CS[]) => {
      if (!cs) return;
      const moved = k(cs.translate(offsetOf(ctx, id)));
      elements.push({ id, label, box: boxOf(moved) });
      into.push(moved);
    };
    const line = (s: string, h: number, cy: number) => (s.trim() ? k(fitInto(k(text(s, h)!), q, h, cy)) : null);

    const parts: Part[] = [];
    if (photo) {
      const cy = take(photoH);
      const placed = k(fitInto(ctx.art!, q, photoH, cy));
      parts.push(...artParts(ctx, placed, p.textColor, "Foto", p.relief, p.thickness));
    }
    if (titleH) place("title", "Título", line(p.title, titleH, take(titleH)), dark);
    if (artistH) place("artist", "Artista", line(p.artist, artistH, take(artistH)), dark);
    if (lyrics.length) {
      const top = cursor, lh = W * LYRIC_H, step = lh * (1 + LYRIC_GAP);
      take(lyricH);
      lyrics.forEach((l, i) => place(`lyric${i + 1}`, `Letra ${i + 1}`, line(l, lh, top - lh / 2 - i * step), dark));
    }

    // barra de progresso: trilho escuro, trecho tocado e bolinha no destaque
    const barCy = take(barBlock) + barBlock / 2 - W * KNOB_R;
    const frac = Math.min(Math.max(p.progress, 0), 100) / 100;
    const bh = W * BAR_H, kr = W * KNOB_R;
    const track = k(k(roundedRect(M, q, bh, bh / 2)).translate([0, barCy]));
    const doneW = Math.max(q * frac, bh);
    const done = k(k(roundedRect(M, doneW, bh, bh / 2)).translate([-q / 2 + doneW / 2, barCy]));
    const knob = k(k(circle(M, kr)).translate([-q / 2 + q * frac, barCy]));
    place("bar", "Barra", k(track.subtract(k(M.CrossSection.union([done, knob])))), dark);
    place("progress", "Progresso", k(M.CrossSection.union([done, knob])), accent);
    if (timesH) {
      const ty = barCy - kr - g * 0.4 - timesH / 2;
      const edge = (s: string, side: -1 | 1) => {
        if (!s.trim()) return null;
        const t = k(text(s, timesH)!);
        const b = t.bounds();
        const x = side === -1 ? -q / 2 - b.min[0] : q / 2 - b.max[0];
        return k(t.translate([x, ty - (b.min[1] + b.max[1]) / 2]));
      };
      place("timeStart", "Tempo inicial", edge(p.timeStart, -1), dark);
      place("timeEnd", "Tempo final", edge(p.timeEnd, 1), dark);
    }
    if (buttonH) {
      const b = playerButtons(M, take(buttonH), buttonH, k);
      place("buttons", "Botões", b.dark, dark);
      accent.push(k(b.accent.translate(offsetOf(ctx, "buttons"))));
    }

    const outline = k(roundedRect(M, W, H, W * 0.06));
    let plateMesh;
    if (p.mount === "magnet") {
      const body = k(outline.extrude(p.thickness));
      const pocket = k(k(M.Manifold.cylinder(MAGNET_DEPTH + 0.01, MAGNET_D / 2, MAGNET_D / 2, 48, false)).translate([0, 0, -0.01]));
      plateMesh = solidMesh(k(body.subtract(pocket)));
    } else plateMesh = slab(outline, p.thickness);

    const textUnion = dark.length ? k(M.CrossSection.union(dark)) : null;
    parts.unshift({ name: "Placa", color: p.plateColor, mesh: plateMesh });
    if (textUnion) parts.push({ name: "Texto", color: p.textColor, mesh: slab(textUnion, p.relief, p.thickness) });
    if (accent.length) parts.push({ name: "Destaque", color: p.accentColor, mesh: slab(k(M.CrossSection.union(accent)), p.relief, p.thickness) });

    const warnings: string[] = [];
    if (p.mount === "magnet" && p.thickness - MAGNET_DEPTH < MIN_FACE_MM) warnings.push(`Com ímã, use espessura de ${MAGNET_DEPTH + MIN_FACE_MM} mm ou mais: a frente fina demais deixa o ímã marcar.`);
    if (p.mount === "magnet") warnings.push(`Encaixe um ímã de ${MAGNET_D - 0.2} mm por ${MAGNET_DEPTH} mm (disco de neodímio) na parte de trás, com cola.`);
    const models: Model[] = [{ name: "Cartão de música", parts }];
    if (p.mount === "stand") models.push(plateStand(M, W, p.thickness, p.plateColor, -H / 2 - 25));
    return { models, warnings, elements };
  });
}
