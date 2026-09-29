import type { ColorLayer2D } from "./extrude";
import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { medalOutline, type MedalShape } from "./medal";
import { medalRim, medalTexture, type RimStyle, type Texture } from "./medalDecor";
import { toMesh } from "./mesh";
import { backing, moveMesh } from "./models/common";
import { fitInto, scoped } from "./shape2d";
import type { ArcSide } from "./text";
import type { Model, Part } from "./types";

export type MedalTextField = "top" | "bottom" | "center" | "rank" | "date" | "back";
export type Hanger = "ribbon" | "hole" | "ring" | "none";
export type BackMount = "none" | "magnet" | "brooch";

export type MedalDesign = {
  shape: MedalShape | "free"; // free = contorno do desenho enviado
  diameter: number;
  thickness: number;
  rimStyle: RimStyle;
  rim: number;
  relief: number;
  engraved: boolean; // baixo relevo: detalhes embutidos rente à face (coloridos), em vez de saltados
  texture: Texture;
  top: string;
  topSize: number;
  bottom: string;
  bottomSize: number;
  arcInset: number; // distância dos textos em arco até a borda
  center: string;
  centerSize: number;
  rank: string;
  rankSize: number;
  date: string;
  dateSize: number;
  artScale: number; // fração da área interna
  artX: number;
  artY: number;
  artRotation: number;
  hanger: Hanger;
  ribbonWidth: number;
  backMount: BackMount;
  back: boolean; // verso separado, colado com 2 pinos
  backText: string; // linhas do verso
  backSize: number;
  baseColor: string;
  rimColor: string;
  textColor: string;
  artColor: string;
  bgColor: string;
};

export const DEFAULT_MEDAL_DESIGN: MedalDesign = {
  shape: "circle",
  diameter: 60,
  thickness: 3,
  rimStyle: "simple",
  rim: 3,
  relief: 1,
  engraved: false,
  texture: "none",
  top: "",
  topSize: 5,
  bottom: "",
  bottomSize: 4.5,
  arcInset: 1.5,
  center: "CAMPEÃ",
  centerSize: 7,
  rank: "",
  rankSize: 5,
  date: "",
  dateSize: 4,
  artScale: 0.45,
  artX: 0,
  artY: 0,
  artRotation: 0,
  hanger: "ribbon",
  ribbonWidth: 25,
  backMount: "none",
  back: false,
  backText: "",
  backSize: 5,
  baseColor: "#f5c542",
  rimColor: "#b8860b",
  textColor: "#1c1c1e",
  artColor: "#1c1c1e",
  bgColor: "#e0b12f",
};

export type MedalCtx = {
  M: ManifoldToplevel;
  text: (s: string, h: number, field: MedalTextField) => CS | null;
  arc: (s: string, h: number, radius: number, side: ArcSide, field: MedalTextField) => CS | null;
  art: CS | null;
  artLayers?: ColorLayer2D[] | null;
};

const TAB_H = 12;
const SLOT_H = 3.5;
const HOLE_R = 2.5;
const RING_OUT = 5.5;
const RING_IN = 3.2;
const MAGNET: [number, number] = [10.2, 3.1]; // ímã de neodímio 10 × 3 + folga
const BROOCH: [number, number, number] = [26, 6, 1.4]; // base de broche 25 mm + folga
const PIN_R = 1.5;
const PIN_FIT = 0.15;
const PIN_DEPTH = 2.5;
const BACK_T = 2;
const TEXTURE_H = 0.4;
const CLEAR = 0.8; // textura se afasta dos textos e da imagem
const GAP = 8;
const FREE_BORDER = 3;

type K = <D extends { delete(): void }>(o: D) => D;

/** Arte → escala na caixa `size`, gira em torno do centro e desloca (mesma conta para as camadas de cor). */
function placeArt(k: K, src: CS, ref: CS, size: number, cy: number, p: MedalDesign): CS {
  const b = ref.bounds();
  const s = size / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
  const c: [number, number] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
  return k(k(k(k(src.translate([-c[0], -c[1]])).scale(s)).rotate(p.artRotation)).translate([p.artX, cy + p.artY]));
}

/** Ponto mais alto do contorno perto do eixo vertical (onde entra a alça). */
function topAt(M: ManifoldToplevel, k: K, outline: CS, w: number): number {
  return k(outline.intersect(k(M.CrossSection.square([w, 1e4], true)))).bounds().max[1];
}

/** Texto das linhas retas (centro, colocação, data) empilhadas a partir de y = 0 para baixo. */
function straightLines(ctx: MedalCtx, k: K, p: MedalDesign, maxW: number): { cs: CS[]; top: number } {
  const lines: [string, number, MedalTextField][] = [
    [p.center, p.centerSize, "center"],
    [p.rank, p.rankSize, "rank"],
    [p.date, p.dateSize, "date"],
  ];
  const cs: CS[] = [];
  let y = 0;
  let top = 0;
  lines.forEach(([s, h, f]) => {
    const raw = s.trim() ? ctx.text(s, h, f) : null;
    if (!raw) return;
    if (!cs.length) top = h / 2;
    const cy = cs.length ? y - h / 2 : 0;
    cs.push(k(fitInto(k(raw), maxW, h, cy)));
    y = cy - h / 2 - Math.max(1.2, h * 0.25);
  });
  return { cs, top };
}

/**
 * Medalha completa (#19): formato (ou contorno livre), borda decorada, fundo com textura, textos em arco e retos,
 * imagem posicionável (multicor), alto ou baixo relevo, alça/furo/argola, ímã ou broche no verso e verso separado.
 */
export function buildMedalDesign(ctx: MedalCtx, p: MedalDesign): Model[] {
  const { M } = ctx;
  return scoped((k) => {
    const outline = p.shape === "free" ? freeOutline(ctx, k, p) : k(medalOutline(M, p.shape, p.diameter));
    const inner = k(outline.offset(-(p.rim + 1), "Round"));
    if (inner.isEmpty()) throw new Error("Borda larga demais para esse tamanho.");
    const ib = inner.bounds();
    const iw = ib.max[0] - ib.min[0], ih = ib.max[1] - ib.min[1];
    const rIn = Math.min(iw, ih) / 2;

    // textos
    const arcs = [
      p.top.trim() ? ctx.arc(p.top, p.topSize, rIn - p.arcInset - p.topSize, "top", "top") : null,
      p.bottom.trim() ? ctx.arc(p.bottom, p.bottomSize, rIn - p.arcInset, "bottom", "bottom") : null,
    ].map((c) => c && k(c));
    const lines = straightLines(ctx, k, p, iw * 0.78);
    // imagem: acima das linhas (ou no centro, se não há linhas)
    let art: CS | null = null;
    let artLayers: { name: string; color: string; cs: CS }[] = [];
    if (ctx.art && !ctx.art.isEmpty()) {
      const size = p.artScale * Math.min(iw, ih);
      const cy = lines.cs.length ? lines.top + 1.5 + size / 2 : 0;
      art = k(placeArt(k, ctx.art, ctx.art, size, cy, p).intersect(inner));
      if (ctx.artLayers && ctx.artLayers.length > 1)
        artLayers = ctx.artLayers.map((l, i) => ({ name: `Imagem ${i + 1}`, color: l.color, cs: k(placeArt(k, l.cs, ctx.art!, size, cy, p).intersect(art!)) }));
    }
    // bloco central (linhas + imagem) centrado na vertical, longe dos arcos
    const block = [...lines.cs, ...(art ? [art] : [])];
    if (block.length) {
      const all = k(M.CrossSection.union(block));
      const bb = all.bounds();
      const dy = -(bb.min[1] + bb.max[1]) / 2;
      const shift = (c: CS) => k(c.translate([0, dy]));
      lines.cs = lines.cs.map(shift);
      if (art) art = k(shift(art).intersect(inner));
      artLayers = artLayers.map((l) => ({ ...l, cs: k(shift(l.cs).intersect(inner)) }));
    }
    const texts = [...arcs.filter((c): c is CS => !!c), ...lines.cs].map((c) => k(c.intersect(inner)));
    const textCs = texts.length ? k(M.CrossSection.union(texts)) : null;
    const rim = medalRim(M, outline, p.rim, p.rimStyle);
    if (rim) k(rim);
    let texture = medalTexture(M, inner, p.texture);
    if (texture) {
      k(texture);
      const keep = [textCs, art].filter((c): c is CS => !!c).map((c) => k(c.offset(CLEAR, "Round")));
      if (keep.length) texture = k(texture.subtract(k(M.CrossSection.union(keep))));
    }

    // corpo: contorno + alça, menos furos
    let body2d = outline;
    const holes: CS[] = [];
    if (p.hanger === "ribbon") {
      const tabW = p.ribbonWidth + 8;
      const top = topAt(M, k, outline, tabW * 0.6);
      const tab = k(k(k(M.CrossSection.square([tabW - 4, TAB_H - 1], true)).offset(2, "Round")).translate([0, top + TAB_H / 2 - 3]));
      body2d = k(body2d.add(tab));
      holes.push(k(k(M.CrossSection.square([p.ribbonWidth + 1, SLOT_H], true)).translate([0, top + TAB_H / 2 - 1.5])));
    } else if (p.hanger === "ring") {
      const top = topAt(M, k, outline, RING_OUT);
      const c: [number, number] = [0, top + RING_OUT - 1.5];
      body2d = k(body2d.add(k(k(M.CrossSection.circle(RING_OUT, 48)).translate(c))));
      holes.push(k(k(M.CrossSection.circle(RING_IN, 32)).translate(c)));
    } else if (p.hanger === "hole") {
      const top = topAt(M, k, outline, HOLE_R * 4);
      holes.push(k(k(M.CrossSection.circle(HOLE_R, 32)).translate([0, top - p.rim - HOLE_R - 1.5])));
    }
    const holeCs = holes.length ? k(M.CrossSection.union(holes)) : null;
    const cut = (cs: CS | null) => (cs && holeCs ? k(cs.subtract(holeCs)) : cs);
    const face2d = cut(body2d)!;

    // relevo: alto (em cima da face) ou baixo (embutido rente, cada detalhe na sua cor)
    const features = [rim, texture, textCs, art].filter((c): c is CS => !!c);
    const zTop = p.thickness;
    const z0 = p.engraved ? zTop - p.relief : zTop;
    let body: Solid = k(face2d.extrude(p.thickness));
    if (p.engraved && features.length) body = k(body.subtract(k(k(k(M.CrossSection.union(features)).extrude(p.relief + 0.01)).translate([0, 0, z0]))));
    body = mountCut(M, k, body, p);
    const slab = (cs: CS | null, h: number) => (cs && !cs.isEmpty() ? toMesh(k(k(cut(cs)!.extrude(h)).translate([0, 0, z0]))) : null);
    const parts: Part[] = [{ name: "Base", color: p.baseColor, mesh: toMesh(body) }];
    const add = (name: string, color: string, cs: CS | null, h: number) => {
      const mesh = slab(cs, h);
      if (mesh) parts.push({ name, color, mesh });
    };
    add("Borda", p.rimColor, rim, p.relief);
    add("Fundo", p.bgColor, texture, p.engraved ? p.relief : Math.min(TEXTURE_H, p.relief));
    add("Textos", p.textColor, textCs, p.relief);
    if (artLayers.length) artLayers.forEach((l) => add(l.name, l.color, l.cs, p.relief));
    else add("Imagem", p.artColor, art, p.relief);

    const models: Model[] = [{ name: p.center.trim() || "Medalha", parts }];
    if (p.back) models.push(...backPieces(ctx, k, outline, face2d, p));
    return models;
  });
}

function freeOutline(ctx: MedalCtx, k: K, p: MedalDesign): CS {
  if (!ctx.art || ctx.art.isEmpty()) throw new Error("Formato livre usa o contorno do desenho: envie um desenho.");
  return k(backing(ctx.M, k(fitInto(ctx.art, p.diameter - 2 * FREE_BORDER, p.diameter - 2 * FREE_BORDER, 0)), FREE_BORDER));
}

/** Rebaixos no verso (face na mesa): ímã, broche e os furos dos pinos do verso separado. */
function mountCut(M: ManifoldToplevel, k: K, body: Solid, p: MedalDesign): Solid {
  const cuts: Solid[] = [];
  if (p.backMount === "magnet") {
    if (p.thickness < MAGNET[1] + 0.8) throw new Error("Para o ímã de 3 mm a medalha precisa de pelo menos 3,9 mm de espessura.");
    cuts.push(k(M.Manifold.cylinder(MAGNET[1], MAGNET[0] / 2, MAGNET[0] / 2, 48)));
  } else if (p.backMount === "brooch") {
    if (p.thickness < BROOCH[2] + 1) throw new Error("Para a base do broche a medalha precisa de pelo menos 2,4 mm de espessura.");
    cuts.push(k(k(M.Manifold.cube([BROOCH[0], BROOCH[1], BROOCH[2]], true)).translate([0, p.diameter * 0.12, BROOCH[2] / 2])));
  }
  if (p.back) for (const x of pinXs(p)) cuts.push(k(k(M.Manifold.cylinder(PIN_DEPTH, PIN_R + PIN_FIT, PIN_R + PIN_FIT, 24)).translate([x, 0, 0])));
  return cuts.length ? k(body.subtract(k(M.Manifold.union(cuts)))) : body;
}

const pinXs = (p: MedalDesign) => [-p.diameter * 0.22, p.diameter * 0.22];

/**
 * Verso: peça fina no mesmo contorno (espelhado, porque vira para colar), com as linhas de texto em relevo
 * e os furos dos pinos; mais os 2 pinos soltos.
 */
function backPieces(ctx: MedalCtx, k: K, outline: CS, face2d: CS, p: MedalDesign): Model[] {
  const { M } = ctx;
  const mirrored = k(face2d.scale([-1, 1]));
  const inner = k(k(outline.scale([-1, 1])).offset(-(p.rim + 1), "Round"));
  const iw = inner.bounds().max[0] - inner.bounds().min[0];
  const lines = p.backText.split("\n").map((l) => l.trim()).filter(Boolean);
  const gap = p.backSize * 0.45;
  const totalH = lines.length * p.backSize + (lines.length - 1) * gap;
  const cs = lines
    .map((l, i) => {
      const raw = ctx.text(l, p.backSize, "back");
      return raw ? k(k(fitInto(k(raw), iw * 0.8, p.backSize, totalH / 2 - p.backSize / 2 - i * (p.backSize + gap))).intersect(inner)) : null;
    })
    .filter((c): c is CS => !!c);
  let solid = k(mirrored.extrude(BACK_T));
  for (const x of pinXs(p)) solid = k(solid.subtract(k(k(M.Manifold.cylinder(Math.min(PIN_DEPTH, BACK_T - 0.6), PIN_R + PIN_FIT, PIN_R + PIN_FIT, 24)).translate([-x, 0, 0]))));
  const b = outline.bounds();
  const dx = b.max[0] - b.min[0] + GAP;
  const parts: Part[] = [{ name: "Verso", color: p.baseColor, mesh: moveMesh(toMesh(solid), dx, 0) }];
  if (cs.length) parts.push({ name: "Textos do verso", color: p.textColor, mesh: moveMesh(toMesh(k(k(k(M.CrossSection.union(cs)).extrude(p.relief)).translate([0, 0, BACK_T]))), dx, 0) });
  const pinLen = PIN_DEPTH + Math.min(PIN_DEPTH, BACK_T - 0.6) - 0.4;
  const pins = k(M.Manifold.union(pinXs(p).map((x) => k(k(M.Manifold.cylinder(pinLen, PIN_R - 0.05, PIN_R - 0.05, 24)).translate([x * 0.4, 0, 0])))));
  return [
    { name: "Verso", parts },
    { name: "Pinos", parts: [{ name: "Pinos", color: p.baseColor, mesh: moveMesh(toMesh(pins), 0, b.min[1] - GAP) }] },
  ];
}
