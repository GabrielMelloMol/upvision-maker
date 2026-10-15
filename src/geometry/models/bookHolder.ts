import type { CS } from "../manifold";
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
  plate: number; // espessura do apoio e da base
  lip: number; // altura do batente
  relief: number;
  text: string;
  bodyColor: string;
  textColor: string;
};
export const DEFAULT_BOOK_STAND: BookStandParams = { width: 120, thick: 40, height: 150, tilt: 22, plate: 4, lip: 14, relief: 1, text: "LER", bodyColor: "#2563eb", textColor: "#f8f8f6" };

const RIB_W = 3;
const RIB_INSET = 8;
const LIP_T = 4;
const REAR_MIN = 20; // base atrás do apoio, além da projeção da inclinação
const RIB_FRACTION = 0.55; // até onde sobe a nervura traseira

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

/** Suporte de mesa: base com batente, apoio inclinado e duas nervuras atrás; o texto fica em relevo na frente do batente. Sai girado 90° em z: a frente (batente e texto) aponta para −y, de frente para a câmera padrão da prévia; a largura corre em x. */
export function buildBookStand(ctx: ModelCtx, p: BookStandParams): ModelOutput {
  const { M, text, art } = ctx;
  const g = bookStandProfile(p);
  return scoped((k) => {
    const poly = (pts: [number, number][]) => k(new M.CrossSection([pts], "NonZero"));
    const base = poly([[0, 0], [g.baseLen, 0], [g.baseLen, p.plate], [0, p.plate]]);
    const lip = poly([[0, 0], [LIP_T, 0], [LIP_T, p.lip], [0, p.lip]]);
    const plate = poly([g.foot, g.along(p.height), g.along(p.height, p.plate), g.along(0, p.plate)]);
    const profile = k(M.CrossSection.union([base, lip, plate]));
    // perfil (x, z) → sólido com a largura em y: extruda, gira 90° em x (o z da extrusão vira −y) e centra
    const sweep = (cs: CS, w: number, y: number) => k(k(k(cs.extrude(w)).rotate([90, 0, 0])).translate([0, y + w / 2, 0]));
    const body = sweep(profile, p.width, 0);
    const rib = poly([g.along(0, p.plate), g.along(p.height * RIB_FRACTION, p.plate), [g.baseLen, p.plate]]);
    const ribY = p.width / 2 - RIB_INSET - RIB_W / 2;
    const ribs = [sweep(rib, RIB_W, ribY), sweep(rib, RIB_W, -ribY)];
    const whole = k(M.Manifold.union([body, ...ribs]));
    // girado 90° em z: a frente (batente com o texto) aponta para −y, de frente para a câmera padrão da prévia (a impressão não muda)
    const parts = [{ name: "Suporte", color: p.bodyColor, mesh: solidMesh(k(whole.rotate([0, 0, 90]))) }];
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (src) {
      const w = p.width - 24, h = Math.max(4, p.lip - 5);
      const fitted = k(fitInto(src, w, h, p.lip / 2));
      // texto no plano do batente: x local → direita de quem lê (−y), y local → z, extrusão → −x (para quem lê)
      const slabX = k(fitted.extrude(p.relief));
      const placed = k(slabX.transform([0, -1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 1]));
      parts.push({ name: "Texto", color: p.textColor, mesh: solidMesh(k(placed.rotate([0, 0, 90]))) });
    }
    return { models: [{ name: "Suporte de livro", parts }] };
  });
}
