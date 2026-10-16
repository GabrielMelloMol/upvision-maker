import type { Mat4 } from "manifold-3d";
import type { CS, Solid } from "../manifold";
import { bedMm } from "../bed";
import { fitInto, scoped } from "../shape2d";
import { roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

/*
 * Suportes de livro (#213), os dois que mais saem: o apoio de polegar (anel que prende a página aberta com uma mão só)
 * e o suporte de mesa (cavalete inclinado com batente na frente, para livro de receitas, caderno ou tablet).
 * Os dois saem como são usados, sem suporte de impressão.
 */

export type BookThumbParams = {
  thumb: number; // diâmetro do furo do polegar
  wall: number; // parede do anel
  ringH: number; // altura do anel
  length: number; // comprimento da aba (do anel até a ponta)
  tabW: number; // largura da aba
  tabT: number; // espessura da aba
  relief: number;
  text: string;
  ringColor: string;
  tabColor: string;
  textColor: string;
};
export const DEFAULT_BOOK_THUMB: BookThumbParams = { thumb: 24, wall: 3.2, ringH: 9, length: 46, tabW: 26, tabT: 2.2, relief: 0.8, text: "LER", ringColor: "#2563eb", tabColor: "#f8f8f6", textColor: "#2563eb" };

const TAB_MARGIN = 1.6;
const TEXT_FROM_RING = 5; // o texto começa um pouco depois do anel (que é mais alto e esconde a borda)

/** Apoio de polegar: anel em pé (eixo vertical) com uma aba chata que segura a página, e o texto em relevo na aba. */
export function buildBookThumb(ctx: ModelCtx, p: BookThumbParams): ModelOutput {
  const { M, text, art } = ctx;
  return scoped((k) => {
    const rIn = p.thumb / 2, rOut = rIn + p.wall;
    const outerDisc = k(M.CrossSection.circle(rOut, 96));
    const ring = k(outerDisc.subtract(k(M.CrossSection.circle(rIn, 96))));
    // a aba nasce no anel e vai para a direita, estreitando para a ponta redonda
    const tip = k(k(M.CrossSection.circle(p.tabW / 2, 64)).translate([rOut + p.length - p.tabW / 2, 0]));
    const root = k(k(roundedRect(M, 2 * rOut * 0.9, p.tabW * 0.9, 4)).translate([0, 0]));
    const blade = k(k(M.CrossSection.hull([root, tip])).subtract(outerDisc));
    const parts = [
      { name: "Anel", color: p.ringColor, mesh: slab(ring, p.ringH) },
      { name: "Aba", color: p.tabColor, mesh: slab(blade, p.tabT) },
    ];
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (src) {
      const x0 = rOut + TEXT_FROM_RING, w = p.length - p.tabW * 0.5 - TEXT_FROM_RING, h = p.tabW - 2 * TAB_MARGIN - 2;
      const placed = k(k(fitInto(src, w, h, 0)).translate([x0 + w / 2, 0]));
      const inside = k(placed.intersect(blade));
      if (!inside.isEmpty()) parts.push({ name: "Texto", color: p.textColor, mesh: slab(inside, p.relief, p.tabT) });
    }
    return { models: [{ name: "Apoio de polegar", parts }] };
  });
}

export type BookStandParams = {
  width: number; // largura do suporte
  thick: number; // espessura do livro (o vão entre o batente e o apoio)
  height: number; // altura do apoio (ao longo da inclinação)
  tilt: number; // inclinação do apoio para trás, em graus a partir da vertical
  plate: number; // espessura da base e do apoio
  lip: number; // altura do batente
  relief: number;
  text: string;
  bodyColor: string;
  accentColor: string; // batente e pés laterais
  textColor: string;
};
export const DEFAULT_BOOK_STAND: BookStandParams = { width: 120, thick: 40, height: 150, tilt: 22, plate: 4, lip: 14, relief: 1, text: "LER", bodyColor: "#2563eb", accentColor: "#1e3a8a", textColor: "#f8f8f6" };

const LIP_T = 4;
const REAR_MIN = 20; // base atrás do apoio, além da projeção da inclinação
const FOOT_T = 5; // espessura dos pés laterais
const FOOT_FRACTION = 0.62; // até onde sobe o pé lateral pela traseira do apoio
const BASE_R = 9; // cantos arredondados da base
const TOP_R = 14; // cantos de cima do apoio
const WINDOW_H = 0.34; // altura das janelas do apoio, em fração da altura
const WINDOW_AT = 0.5; // onde elas começam
const VIEW_TURN = 65; // a peça sai girada para a câmera padrão ver a frente em ¾ (a impressão não muda)

/** Geometria do perfil (x para trás a partir do batente, z para cima), exportada para os testes. */
export function bookStandProfile(p: Pick<BookStandParams, "thick" | "height" | "tilt" | "plate">) {
  const a = (p.tilt * Math.PI) / 180;
  const d: [number, number] = [Math.sin(a), Math.cos(a)];
  const back: [number, number] = [Math.cos(a), -Math.sin(a)];
  const foot: [number, number] = [LIP_T + p.thick, p.plate];
  const along = (s: number, t = 0): [number, number] => [foot[0] + s * d[0] + t * back[0], foot[1] + s * d[1] + t * back[1]];
  const baseLen = foot[0] + p.plate + 0.75 * p.height * d[0] + REAR_MIN;
  return { foot, along, baseLen, top: along(p.height, p.plate) };
}

/** Número de janelas do apoio, pela largura. */
export const windowsFor = (width: number) => Math.min(5, Math.max(2, Math.floor(width / 36)));

/**
 * Suporte de mesa: base de cantos arredondados com batente, apoio inclinado de cantos arredondados e janelas em arco
 * (leve e com cara de estante), pés laterais curvos atrás e o nome em relevo na frente do batente. O corpo é uma cor e o
 * batente e os pés outra. Sai girado em z: a frente aponta para a câmera padrão da prévia, em ¾; a base fica na mesa e o
 * apoio inclinado imprime sem suporte (a inclinação para trás é suave).
 */
export function buildBookStand(ctx: ModelCtx, p: BookStandParams): ModelOutput {
  const { M, text, art } = ctx;
  const g = bookStandProfile(p);
  const W = p.width, H = p.height;
  return scoped((k) => {
    const poly = (pts: [number, number][]) => k(new M.CrossSection([pts], "NonZero"));
    // base: planta arredondada; o batente é a mesma planta recortada na faixa da frente
    const plan = k(k(roundedRect(M, g.baseLen, W, BASE_R)).translate([g.baseLen / 2, 0]));
    const base = k(plan.extrude(p.plate));
    const lip = k(k(plan.intersect(k(M.CrossSection.square([LIP_T, W + 1], false).translate([0, -W / 2 - 0.5])))).extrude(p.lip));
    // apoio: contorno com os cantos de cima arredondados e janelas em arco, no plano do próprio apoio (x = largura, y = altura)
    const rounded = k(k(roundedRect(M, W, 2 * H, TOP_R)).translate([0, 0]));
    const outline = k(rounded.intersect(k(k(M.CrossSection.square([W + 1, H], false)).translate([-W / 2 - 0.5, 0]))));
    const n = windowsFor(W);
    const slot = (W - 2 * 16) / n; // a janela mais a parede entre elas
    const winW = slot * 0.62;
    const windows = Array.from({ length: n }, (_, i) => {
      const cx = -W / 2 + 16 + slot * (i + 0.5);
      const y0 = H * WINDOW_AT, hh = H * WINDOW_H;
      const rect = k(k(M.CrossSection.square([winW, hh - winW / 2], false)).translate([cx - winW / 2, y0]));
      const arch = k(k(M.CrossSection.circle(winW / 2, 48)).translate([cx, y0 + hh - winW / 2]));
      return k(rect.add(arch));
    });
    const board = k(outline.subtract(k(M.CrossSection.union(windows))));
    const cosA = g.along(1)[1] - g.foot[1], sinA = g.along(1)[0] - g.foot[0];
    // plano do apoio → mundo: x local → −y, y local → ao longo da inclinação, z local → normal da frente; a espessura vai para trás
    const toWorld: Mat4 = [0, -1, 0, 0, sinA, 0, cosA, 0, -cosA, 0, sinA, 0, g.foot[0], 0, g.foot[1], 1];
    const plate = k(k(k(board.extrude(p.plate)).translate([0, 0, -p.plate])).transform(toWorld));
    // pés laterais: perfil curvo atrás do apoio, nas duas pontas da largura
    const rear = g.along(0, p.plate), up = g.along(H * FOOT_FRACTION, p.plate);
    const end: [number, number] = [g.baseLen - BASE_R, p.plate / 2];
    const ctrl: [number, number] = [up[0] + 0.1 * (end[0] - up[0]), end[1] + 0.22 * (up[1] - end[1])];
    const curve = Array.from({ length: 16 }, (_, i): [number, number] => {
      const t = (i + 1) / 16;
      return [(1 - t) ** 2 * up[0] + 2 * (1 - t) * t * ctrl[0] + t * t * end[0], (1 - t) ** 2 * up[1] + 2 * (1 - t) * t * ctrl[1] + t * t * end[1]];
    });
    const footProfile = poly([[rear[0] - 1, p.plate / 2], g.along(p.plate * 0.3, p.plate + 0.01), up, ...curve]);
    const sweep = (cs: CS, w: number, y: number) => k(k(k(cs.extrude(w)).rotate([90, 0, 0])).translate([0, y + w / 2, 0]));
    const feet = [sweep(footProfile, FOOT_T, W / 2 - FOOT_T), sweep(footProfile, FOOT_T, -W / 2)];
    const main = k(M.Manifold.union([base, plate]));
    const accent = k(k(M.Manifold.union([lip, ...feet])).subtract(main));
    // a volta de ¾ só vale se a peça girada ainda cabe na mesa (em larguras grandes a diagonal passa dela: aí sai reta)
    const rotated = k(main.rotate([0, 0, VIEW_TURN])).boundingBox();
    const turnBy = Math.max(rotated.max[0] - rotated.min[0], rotated.max[1] - rotated.min[1]) <= bedMm() ? VIEW_TURN : 0;
    const turn = (s: Solid) => solidMesh(k(s.rotate([0, 0, turnBy])));
    const parts = [{ name: "Suporte", color: p.bodyColor, mesh: turn(main) }, { name: "Batente e pés", color: p.accentColor, mesh: turn(accent) }];
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (src) {
      const w = W - 24, h = Math.max(4, p.lip - 5);
      const fitted = k(fitInto(src, w, h, p.lip / 2));
      // nome no plano do batente: x local → direita de quem lê (−y), y local → z, extrusão → −x (para quem lê)
      const placed = k(k(fitted.extrude(p.relief)).transform([0, -1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 1]));
      parts.push({ name: "Nome", color: p.textColor, mesh: turn(placed) });
    }
    return { models: [{ name: "Suporte de livro", parts }] };
  });
}
