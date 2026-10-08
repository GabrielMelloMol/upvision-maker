import { bedMm } from "../bed";
import { modelsBounds } from "../bounds";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Mesh, Model } from "../types";
import { DIE_KINDS, dieShape, faceFrame, faceNumbers, type DieKind, type DieShape } from "./diceFaces";
import { MissingInput, moveModel, requireArt, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type DiceStyle = "flush" | "engraved" | "raised";
export type DiceContent = "numbers" | "pips" | "custom" | "art";

export type DiceParams = {
  die: DieKind | "set"; // "set" = conjunto completo (d4 a d20) numa mesa
  size: number; // distância entre faces opostas (no d4, a altura)
  rounding: number; // 0 a 100: quanto a esfera come das arestas
  content: DiceContent;
  labels: string; // texto ou emoji de cada face, separados por vírgula (conteúdo "custom")
  d10Zero: boolean; // d10 de 0 a 9 (o jeito tradicional) em vez de 1 a 10
  underline: boolean; // sublinhado no 6 e no 9, para não confundir de cabeça para baixo
  style: DiceStyle;
  depth: number;
  bodyColor: string;
  faceColor: string;
};

export const DEFAULT_DICE: DiceParams = {
  die: "d20",
  size: 20,
  rounding: 35,
  content: "numbers",
  labels: "",
  d10Zero: true,
  underline: true,
  style: "flush",
  depth: 0.8,
  bodyColor: "#1e3a8a",
  faceColor: "#f8f8f6",
};

const SEGMENTS = 64;
const MARGIN = 0.6; // o molde do conteúdo passa um pouco do plano da face, para o corte ser limpo
const BOX = 1.3; // lado da caixa do conteúdo, em raios do círculo que cabe na face
const MIN_RADIUS = 1.2; // abaixo disso o conteúdo vira um borrão
const GAP = 6;
const SMALL_MM = 45; // abaixo disso o dado cabe na boca de criança pequena
const OVERHANG_DEG = 45;
const SPHERE_FLOOR = 1.12; // a esfera nunca fecha abaixo disto vezes o raio das faces
const SPHERE_FREE = 1.02; // sem arredondamento a esfera passa folgada dos vértices

/** Raio da esfera que arredonda as arestas: de "folgada" (0 %) até quase encostar nas faces (100 %). */
export function roundingRadius(shape: DieShape, rounding: number): number {
  const open = shape.circumradius * SPHERE_FREE;
  const closed = Math.min(open, shape.inradius * SPHERE_FLOOR);
  return open - (Math.min(Math.max(rounding, 0), 100) / 100) * (open - closed);
}

/** Bolinhas do d6: posições na grade de −1 a 1. */
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function pips(M: ManifoldToplevel, count: number, box: number): CS | null {
  const spots = PIPS[count];
  if (!spots) return null;
  return scoped((k) => M.CrossSection.union(spots.map(([x, y]) => k(k(M.CrossSection.circle(box * 0.11, 24)).translate([x * box * 0.3, y * box * 0.3])))));
}

/** O conteúdo de uma face (número, bolinhas, texto, emoji ou desenho), centrado na origem e dentro de uma caixa `box`. */
export function faceArt(ctx: ModelCtx, p: DiceParams, label: string, box: number): CS | null {
  const { M, text } = ctx;
  if (p.content === "art") return fitInto(ctx.art!, box, box, 0);
  if (p.content === "pips") return pips(M, Number(label), box);
  const raw = text(label, box);
  if (!raw) return null;
  return scoped((k) => {
    k(raw);
    if (!p.underline || !/^[69]$/.test(label.trim())) return fitInto(raw, box, box, 0);
    const b = raw.bounds();
    const w = b.max[0] - b.min[0];
    const h = b.max[1] - b.min[1];
    const bar = k(k(M.CrossSection.square([w * 0.9, h * 0.14], true)).translate([(b.min[0] + b.max[0]) / 2, b.min[1] - h * 0.2]));
    return fitInto(k(M.CrossSection.union([raw, bar])), box, box, 0);
  });
}

/** Cada face com o que vai nela, na ordem de leitura de `shape.faces`. */
function faceLabels(kind: DieKind, shape: DieShape, p: DiceParams): { labels: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const n = shape.faces.length;
  if (p.content === "custom") {
    const given = p.labels.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (!given.length) throw new MissingInput("Digite o que vai em cada face, separado por vírgula (texto ou emoji).");
    if (given.length < n) warnings.push(`${kind} tem ${n} faces e você escreveu ${given.length}: repeti os rótulos para completar.`);
    return { labels: Array.from({ length: n }, (_, i) => given[i % given.length]), warnings };
  }
  const nums = faceNumbers(shape.faces, kind === "d10" && p.d10Zero ? 0 : 1).map(String);
  return { labels: nums, warnings };
}

/** Parte da área da malha que desce além de `deg` graus da vertical (precisa de suporte), fora o chão. */
export function overhangShare(mesh: Mesh, zFloor: number, deg = OVERHANG_DEG): number {
  const lim = -Math.cos((deg * Math.PI) / 180);
  const P = mesh.positions;
  let bad = 0;
  let all = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i] * 3, mesh.indices[i + 1] * 3, mesh.indices[i + 2] * 3];
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const area = Math.hypot(nx, ny, nz) / 2;
    all += area;
    if (area > 0 && nz / (2 * area) < lim && (P[a + 2] + P[b + 2] + P[c + 2]) / 3 > zFloor + 0.3) bad += area; // o chão (face de baixo) não conta
  }
  return all ? bad / all : 0;
}

/** Um dado: corpo (casco dos pontos ∩ esfera) com o conteúdo de cada face gravado, rente ou em relevo. */
function buildDie(ctx: ModelCtx, kind: DieKind, p: DiceParams, setMode: boolean): { model: Model; warnings: string[] } {
  const { M } = ctx;
  const shape = dieShape(kind, p.size);
  const R = roundingRadius(shape, p.rounding);
  const content: DiceParams = setMode ? { ...p, content: "numbers" } : kind === "d6" || p.content !== "pips" ? p : { ...p, content: "numbers" };
  const { labels, warnings } = faceLabels(kind, shape, content);
  if (!setMode && p.content === "pips" && kind !== "d6") warnings.push(`Bolinhas só existem no d6: o ${kind} usa números.`);
  if (content.content === "art") requireArt(ctx.art);

  return scoped((k) => {
    const hull = k(M.Manifold.hull(shape.points));
    const body = p.rounding > 0 ? k(hull.intersect(k(M.Manifold.sphere(R, SEGMENTS)))) : hull;
    const patch = (d: number) => Math.sqrt(Math.max(R * R - d * d, 0)); // raio do círculo plano que sobra na face

    const pockets: Solid[] = [];
    const reliefs: Solid[] = [];
    let tooSmall = 0;
    shape.faces.forEach((face, i) => {
      const fr = faceFrame(face);
      const r = Math.min(fr.radius, patch(face.d) - Math.hypot(fr.pole[0], fr.pole[1]));
      if (r < MIN_RADIUS) {
        tooSmall++;
        return;
      }
      const cs = faceArt(ctx, content, labels[i], r * BOX);
      if (!cs) return;
      k(cs);
      const raised = p.style === "raised" && face.n[2] > -0.99; // a face de baixo apoia na mesa: lá o relevo vira rebaixo
      const [z0, h] = raised ? [0, p.depth] : [-p.depth, p.depth + MARGIN];
      const o = [0, 1, 2].map((a) => face.n[a] * face.d + fr.ex[a] * fr.pole[0] + fr.ey[a] * fr.pole[1]);
      const prism = k(k(cs.extrude(h)).translate([0, 0, z0]));
      const placed = k(prism.transform([fr.ex[0], fr.ex[1], fr.ex[2], 0, fr.ey[0], fr.ey[1], fr.ey[2], 0, fr.n[0], fr.n[1], fr.n[2], 0, o[0], o[1], o[2], 1]));
      (raised ? reliefs : pockets).push(placed);
    });

    let shell = body;
    let ink: Solid | null = null;
    if (pockets.length) {
      const inside = k(k(M.Manifold.union(pockets)).intersect(body));
      shell = k(body.subtract(inside));
      ink = inside;
    }
    if (reliefs.length) {
      const up = k(M.Manifold.union(reliefs));
      ink = ink ? k(M.Manifold.union([ink, up])) : up;
    }
    const lift = (s: Solid): Mesh => solidMesh(k(s.translate([0, 0, shape.bottom])));
    const shellMesh = lift(shell);
    const outer = lift(body);
    const parts = [{ name: "Dado", color: p.bodyColor, mesh: shellMesh }];
    if (ink && p.style !== "engraved") parts.push({ name: "Gravação", color: p.faceColor, mesh: lift(ink) });
    if (tooSmall) warnings.push(`${kind}: ${tooSmall} face(s) ficaram sem conteúdo por serem pequenas demais; aumente o dado ou diminua o arredondamento.`);
    if (overhangShare(outer, 0) > 0.005) warnings.push(`${kind}: tem partes inclinadas além de ${OVERHANG_DEG}°; ative o suporte em árvore no fatiador.`);
    return { model: { name: kind, parts }, warnings };
  });
}

/** Posiciona os dados em fileiras dentro da mesa, com o conjunto centrado na origem. */
function layout(models: Model[]): { models: Model[]; overflow: boolean } {
  const bed = bedMm();
  const sizes = models.map((m) => {
    const b = modelsBounds([m])!;
    return { b, w: b.max[0] - b.min[0], h: b.max[1] - b.min[1] };
  });
  let x = 0;
  let y = 0;
  let row = 0;
  let width = 0;
  const spots = sizes.map((s) => {
    if (x > 0 && x + s.w > bed) {
      x = 0;
      y += row + GAP;
      row = 0;
    }
    const at = { x, y };
    x += s.w + GAP;
    row = Math.max(row, s.h);
    width = Math.max(width, x - GAP);
    return at;
  });
  const height = y + row;
  const moved = models.map((m, i) => moveModel(m, spots[i].x - sizes[i].b.min[0] - width / 2, spots[i].y - sizes[i].b.min[1] - height / 2));
  return { models: moved, overflow: width > bed || height > bed };
}

/**
 * Dados de RPG (d4, d6, d8, d10, d12, d20): sólidos gerados por coordenadas, com arestas arredondadas por uma esfera,
 * números (ou bolinhas, texto, emoji, desenho) em cada face, gravados rentes em 2 cores, só gravados ou em relevo.
 * Cada dado apoia numa face, e o conjunto completo cabe numa mesa.
 */
export function buildDice(ctx: ModelCtx, p: DiceParams): ModelOutput {
  const set = p.die === "set";
  const built = (set ? DIE_KINDS : [p.die as DieKind]).map((kind) => buildDie(ctx, kind, p, set));
  const { models, overflow } = layout(built.map((b) => b.model));
  const warnings = [...new Set(built.flatMap((b) => b.warnings))];
  warnings.unshift(p.size < SMALL_MM ? "Peças pequenas: não é brinquedo para menores de 3 anos (risco de engasgo)." : "Brinquedo: para menores de 3 anos, confira se nada solta.");
  warnings.push("Imprima com 100% de preenchimento: o peso fica parelho e o dado rola justo.");
  if (p.style === "raised") warnings.push("Em relevo, a face de baixo sai gravada (ela apoia na mesa) e a altura passa do tamanho pedido pela altura do relevo.");
  if (overflow) warnings.push(`O conjunto passa da mesa de ${bedMm()} mm: imprima em mais de uma vez ou diminua o dado.`);
  return { models, warnings };
}
