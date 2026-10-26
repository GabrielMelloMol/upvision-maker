import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { bedMm } from "../bed";
import { modelsBounds } from "../bounds";
import { toMesh } from "../mesh";
import { spread } from "../planeCut";
import { layoutPlates } from "../thermo/layout";
import { fitInto, scoped } from "../shape2d";
import { presetSilhouette, silhouetteFromDesign } from "../thermo/shapes";
import type { Mesh, Model, Part } from "../types";
import { artParts, boxOf, MissingInput, moveMesh, moveModel, placeIn, requireArt, roundedRect, type ElementBox, type ModelCtx, type ModelOutput } from "./common";

/** Formato do meio (#274): básicos, temas por profissão e o desenho da pessoa. */
export type MicShape = "cube" | "cylinder" | "heart" | "star" | "flower" | "cloud" | "house" | "dumbbell" | "medical" | "podcast" | "book" | "art";

export const MIC_SHAPES: readonly (readonly [MicShape, string])[] = [
  ["cube", "Cubo"],
  ["cylinder", "Cilindro"],
  ["heart", "Coração"],
  ["star", "Estrela"],
  ["flower", "Flor"],
  ["cloud", "Nuvem"],
  ["house", "Casa (arquiteto, corretor)"],
  ["dumbbell", "Halter (academia)"],
  ["medical", "Cruz (saúde)"],
  ["podcast", "Balão de fala (podcast)"],
  ["book", "Livro (professor)"],
  ["art", "Meu desenho"],
];

/** Largura que cada formato pede para o desenho aparecer inteiro em volta do microfone (o `derive` do campo usa). */
export const MIC_SHAPE_WIDTH: Record<MicShape, number> = { cube: 38, cylinder: 50, heart: 62, star: 66, flower: 62, cloud: 64, house: 56, dumbbell: 84, medical: 60, podcast: 58, book: 68, art: 60 };

export type MicHead = "foam" | "grille" | "bought";

export const MIC_HEADS: readonly (readonly [MicHead, string])[] = [
  ["foam", "Espuma impressa (lisa)"],
  ["grille", "Grade de microfone, com anel"],
  ["bought", "Espuma comprada (furo)"],
];

export type MicHolderParams = {
  shape: MicShape;
  width: number;
  thickness: number; // cubo e cilindro usam a largura
  micW: number; // medidas do transmissor deitado no bolso, visto de trás: largura, comprimento (de trás para a frente) e espessura
  micH: number;
  micT: number;
  micRound: boolean;
  clearance: number; // folga em volta do microfone (Kit de testes)
  head: MicHead; // bolinha de cima (#293)
  neckD: number; // espuma comprada: furo no topo onde a base dela entra apertada
  handleL: number;
  front: "text" | "art" | "none";
  text: string;
  relief: number;
  print: "full" | "test";
  bodyColor: string;
  artColor: string;
  headColor: string;
  ringColor: string;
  handleColor: string;
};

/** Hollyland Lark M2: Ø26 × 9,9 mm (ficha oficial, sem o ímã). */
export const DEFAULT_MIC_HOLDER: MicHolderParams = {
  shape: "cube",
  width: 38, // cubo justo em volta do bolso, como a referência (#291)
  thickness: 30,
  micW: 31.7, // medido no modelo de referência, feito com o Lark M2 de verdade (bolso Ø32,7 × 13,3 com a folga)
  micH: 31.7,
  micT: 12.3,
  micRound: true,
  clearance: 0.5,
  head: "foam",
  neckD: 28,
  handleL: 57, // o cabo da referência: Ø14,9 × 56,7
  front: "text",
  text: "UPVISION",
  relief: 1,
  print: "full",
  bodyColor: "#f8f8f6",
  artColor: "#1c1c1e",
  headColor: "#1c1c1e", // a cor do cabo: na placa 2 só o anel troca de filamento
  ringColor: "#b8bcc2", // anel prata, como a grade da referência
  handleColor: "#1c1c1e", // o cabo vai na placa 2, longe da caixinha: pode ter outra cor sem trocar filamento em toda camada
};

export const MIC_WALL = 2.5; // parede dos lados do bolso (2,5 na referência)
export const FRONT_WALL = 2.2; // parede da frente, o teto do bolso na impressão (2,2 na referência)
// Costas (#291 v3): proporções medidas na canopla de referência (cubo de 38 × 28,7 × 38, bolso de Ø32,7 × 13,3 mm), relativas
// ao bolso do transmissor. Só as medidas; a forma é nossa.
export const BAR_T = 2; // travessa (prateleira) entre o bolso e a janela do clipe: 2 mm na referência
const CLIP_H = 10 / 13.3; // altura da janela de cima ÷ altura do bolso
const CLIP_W = 19 / 33; // largura da janela de cima ÷ largura do bolso
const SLOT_W = 9 / 33; // rasgo no meio da travessa, por onde passa a haste do clipe ÷ largura do bolso
export const SLOT_L = 29 / 35; // comprimento do rasgo, a partir das costas ÷ fundo do bolso
const MIC_COLOR = "#141416"; // transmissor da prévia: preto como o Lark M2, contrasta com o meio claro
export const TENON_FIT = 0.15; // pecinha e cabo entram justos nos rebaixos (por lado), com cola
// como a referência (#293): parede de 1 mm embaixo da abertura e 2 mm em cima; rebaixo Ø11,6 em cima para a pecinha que
// segura a bolinha e Ø15 embaixo para o cabo (Ø14,9)
export const BOTTOM_WALL = 1;
const TOP_WALL = 2;
export const PEG_D = 11.6;
export const PEG_H = 0.45;
export const PEG_L = 15; // pecinha de encaixe (CABO_Boolean da referência): Ø11,5 × 15
export const HANDLE_RECESS = 15;
export const RING_D = 18; // anel (Genérico-Toro da referência): Ø18 × 2, passa pela pecinha
export const RING_H = 2;
export const FOAM_DEPTH = 5; // espuma comprada: quanto a base dela entra no furo do topo
const SOUND_W = 8; // espuma comprada: canal do som, da janela do clipe até o furo
const HANDLE_BAND = 32; // faixa embaixo do meio, em volta do cabo, onde o formato não desce
// bolinhas medidas na referência (raio, altura a partir da base). Grade = a "FONE" (27,6 × 24,7, furinhos na cúpula e a base de
// Ø18 onde fica o anel); espuma = a "Merged Parts" (Ø32 × 33,2, lisa, que a referência imprime com pele texturizada)
const GRILLE_PROFILE: [number, number][] = [[9, 0], [9.4, 2.6], [10.1, 3.6], [11, 4.6], [12, 6.6], [13.6, 10.6], [13.8, 12.6], [12.7, 14.6], [10.8, 18.6], [8.2, 21.6], [5, 23.6], [0, 24.7]];
const FOAM_R = 16;
const FOAM_C = 17.2; // centro da cúpula
const FOAM_SKIRT: [number, number][] = [[13.1, 0], [13.7, 0.6], [14.3, 1.6], [14.7, 2.6], [15.2, 4.6], [15.5, 6.6], [16, 11.6]];
export const BORE = { foam: 16.6, grille: 14.6 }; // furo da pecinha na base da bolinha
// furinhos da grade: Ø1,6 com 0,8 mm de parede entre eles (2 linhas de um bico de 0,4); abaixo de 12 mm a base fica lisa
export const DIMPLE = { d: 1.6, pitch: 2.4, depth: 0.6, from: 12 };
const SEG = 64;
const FOAM_COLOR = "#2b2b2b";

/**
 * Medidas que saem dos parâmetros (#291, revisão do Gabriel): o transmissor fica deitado num bolso que atravessa as
 * costas e entra empurrado de trás para a frente; o clipe dele desliza por cima da travessa, na janela de cima.
 * cw × cd = boca do bolso, cl = microfone + folga (de trás para a frente), ch = altura da abertura inteira (bolso + travessa + janela).
 */
export function micLayout(p: Pick<MicHolderParams, "micW" | "micH" | "micT" | "clearance" | "micRound">) {
  const cw = p.micW + 2 * p.clearance;
  const cd = p.micT + 2 * p.clearance;
  const cl = p.micH + 2 * p.clearance;
  const [clipW, clipH, slotW] = [cw * CLIP_W, cd * CLIP_H, cw * SLOT_W];
  const ch = cd + BAR_T + clipH;
  const coreW = cw + 2 * MIC_WALL;
  return { cw, ch, cd, cl, coreW, clipW, clipH, slotW, round: p.micRound, radius: p.micRound ? Math.min(p.micW, p.micH) / 2 : Math.min(2, p.micW / 4), peg: PEG_D - 2 * TENON_FIT, handleD: HANDLE_RECESS - 2 * TENON_FIT };
}

/** Onde ficaram as coisas (para os testes e a vista montada): centro do microfone, topo do meio, fundo do bolso e espessura. */
export type MicHolderOutput = ModelOutput & { layout: { cy: number; top: number; depth: number; thickness: number } | null };

type K = <D extends { delete(): void }>(o: D) => D;

/** Contorno do formato centrado na origem, `w` de largura. */
function outline(M: ManifoldToplevel, k: K, ctx: ModelCtx, shape: MicShape, w: number, cubeH = w): CS {
  const poly = (pts: [number, number][]) => k(new M.CrossSection([pts], "NonZero"));
  const circle = (r: number, x: number, y: number) => k(k(M.CrossSection.circle(r, SEG)).translate([x, y]));
  const rect = (rw: number, rh: number, x: number, y: number, r = 0) => k(k(roundedRect(M, rw, rh, r)).translate([x, y]));
  const smooth = (cs: CS, r: number) => k(k(cs.offset(-r, "Round")).offset(r, "Round"));
  let cs: CS;
  switch (shape) {
    case "cube":
      return k(roundedRect(M, w, cubeH, 4));
    case "cylinder":
      return k(roundedRect(M, w, w, 0));
    case "heart":
    case "star":
    case "flower":
      return k(presetSilhouette(M, shape, w));
    case "art":
      return k(silhouetteFromDesign(M, requireArt(ctx.art), w));
    case "cloud":
      cs = k(M.CrossSection.union([rect(100, 40, 0, -8, 20), circle(22, -28, 8), circle(28, 2, 18), circle(20, 30, 6)]));
      break;
    case "house":
      cs = smooth(k(M.CrossSection.union([poly([[-42, -45], [42, -45], [42, 5], [0, 45], [-42, 5]]), rect(12, 26, 26, 22)])), 1.5);
      break;
    case "dumbbell":
      cs = smooth(k(M.CrossSection.union([rect(84, 52, 0, 0, 4), rect(14, 84, -32, 0, 3), rect(14, 84, 32, 0, 3), rect(10, 64, -45, 0, 3), rect(10, 64, 45, 0, 3), rect(6, 22, -52, 0, 1), rect(6, 22, 52, 0, 1)])), 0.5);
      break;
    case "medical":
      cs = k(M.CrossSection.union([rect(100, 56, 0, 0, 10), rect(56, 100, 0, 0, 10)]));
      break;
    case "podcast":
      cs = k(M.CrossSection.union([rect(100, 74, 0, 6, 22), poly([[14, -20], [38, -20], [40, -44]])]));
      break;
    case "book": {
      const page = poly([[-50, -28], [-2, -34], [-2, 30], [-50, 36]]);
      cs = smooth(k(M.CrossSection.union([page, k(page.mirror([1, 0])), rect(10, 66, 0, -1, 2)])), 1);
      break;
    }
  }
  const b = cs.bounds();
  return k(k(cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2])).scale(w / (b.max[0] - b.min[0])));
}

/**
 * Abertura das costas (#291) no sistema da impressão (#293): x = largura, y = altura de uso (centro da abertura em y = 0),
 * z = de trás (z = 0, na mesa) para a frente; o bolso vai até z = `depth`. Bolso embaixo, travessa e janela do clipe em cima.
 * Microfone redondo: a frente do bolso e da janela é meia-volta (como a referência), o teto se fecha aos poucos na impressão.
 */
function openingSolid(M: ManifoldToplevel, k: K, L: ReturnType<typeof micLayout>, depth: number): Solid {
  // planta (x, z) virada prisma de altura h a partir de y0
  const prism = (fp: CS, y0: number, h: number) => k(k(k(k(fp.mirror([0, 1])).extrude(h)).rotate([-90, 0, 0])).translate([0, y0, 0]));
  const plan = (w: number, d: number) => {
    const back = k(k(M.CrossSection.square([w, d + 1 - (L.round ? w / 2 : 0)])).translate([-w / 2, -1]));
    return L.round ? k(back.add(k(k(M.CrossSection.circle(w / 2, SEG)).translate([0, d - w / 2])))) : k(k(roundedRect(M, w, d + 4, Math.min(1, L.radius))).translate([0, (d - 4) / 2]));
  };
  const y0 = -L.ch / 2;
  return k(M.Manifold.union([prism(plan(L.cw, depth), y0, L.cd), prism(plan(L.clipW, depth), L.ch / 2 - L.clipH, L.clipH), prism(k(k(M.CrossSection.square([L.slotW, depth * SLOT_L + 1])).translate([-L.slotW / 2, -1])), y0 + L.cd - 0.1, BAR_T + 0.2)]));
}

/** Curva suave pelos pontos (Catmull-Rom), para a bolinha não sair facetada. */
function smoothPath(pts: [number, number][], n = 6): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Bolinha de cima em pé, base em z = 0, com o furo da pecinha embaixo (teto em cone, sem ponte). */
function buildHead(M: ManifoldToplevel, k: K, kind: "foam" | "grille"): Solid {
  let prof: [number, number][];
  if (kind === "grille") prof = smoothPath(GRILLE_PROFILE);
  else {
    const dome: [number, number][] = [];
    for (let i = 1; i <= 24; i++) {
      const a = (i / 24) * (Math.PI / 2);
      dome.push([FOAM_R * Math.cos(a), FOAM_C + FOAM_R * Math.sin(a)]);
    }
    prof = [...smoothPath(FOAM_SKIRT, 4), [FOAM_R, FOAM_C], ...dome];
  }
  let s = k(k(new M.CrossSection([[[0, 0], ...prof.map(([r, h]) => [Math.max(0, r), h] as [number, number])]], "Positive")).revolve(SEG * 2));
  if (kind === "grille") {
    // furinhos em fileiras ao longo do perfil, de `from` até o topo, cada fileira defasada meio passo da anterior
    const { d, pitch, depth } = DIMPLE;
    const rd = d / 2;
    const holes: Solid[] = [];
    const len = prof.slice(1).map((q, i) => Math.hypot(q[0] - prof[i][0], q[1] - prof[i][1]));
    const start = prof.findIndex((q) => q[1] >= DIMPLE.from);
    let row = 0;
    for (let i = start, acc = pitch; i < prof.length - 1; i++) {
      acc += len[i];
      if (acc < pitch) continue;
      acc = 0;
      const [[r0, h0], [r1, h1]] = [prof[i], prof[i + 1]];
      const n = [h1 - h0, -(r1 - r0)].map((v) => v / len[i]); // normal para fora
      const [r, h] = [r0 + n[0] * (rd - depth), h0 + n[1] * (rd - depth)];
      const count = Math.floor((2 * Math.PI * r0) / pitch);
      if (count < 3) break;
      for (let j = 0; j < count; j++) {
        const a = ((j + (row % 2) / 2) / count) * 2 * Math.PI;
        holes.push(k(k(M.Manifold.sphere(rd, 10)).translate([r * Math.cos(a), r * Math.sin(a), h])));
      }
      row++;
    }
    s = k(s.subtract(k(M.Manifold.union(holes))));
  }
  const bore = BORE[kind];
  const r = PEG_D / 2;
  const hole = k(k(M.Manifold.cylinder(bore, r, r, SEG)).translate([0, 0, -0.01]).add(k(k(M.Manifold.cylinder(r, r, 0, SEG)).translate([0, 0, bore - 0.01]))));
  return k(s.subtract(hole));
}

/**
 * Canopla para microfone sem fio (#274, #291, #293), igual à referência: a caixinha numa peça só, fechada em 5 faces e aberta
 * atrás, impressa deitada com as costas na mesa e a frente (com o logo de outra cor) para cima, sem suporte. O transmissor
 * entra e sai por trás, deitado, sem mexer no cabo; o clipe dele abraça a travessa. Na placa 2: a bolinha de cima (espuma
 * impressa ou grade), o anel, o cabo e a pecinha que liga a caixinha à bolinha, tudo colado. "Anel de teste": só o encaixe.
 */
export function buildMicHolder(ctx: ModelCtx, p: MicHolderParams): MicHolderOutput {
  const { M } = ctx;
  const L = micLayout(p);
  const warnings: string[] = [];
  if (p.print === "test") {
    // o mesmo encaixe, impresso como a canopla: a boca na mesa e a parede da frente em cima (a mesma ponte do teto)
    const ring = scoped((k) => {
      const block = k(k(roundedRect(M, L.coreW, L.ch + 2 * MIC_WALL, MIC_WALL)).extrude(L.cl + FRONT_WALL));
      return toMesh(k(block.subtract(openingSolid(M, k, L, L.cl))));
    });
    return {
      layout: null,
      models: [{ name: "Anel de teste", parts: [{ name: "Anel", color: p.bodyColor, mesh: ring }] }],
      warnings: ["Anel de teste: é o mesmo encaixe das costas, impresso do mesmo jeito (a boca na mesa). Empurre o microfone deitado para dentro do bolso, com o clipe por cima da travessa: deve entrar sem forçar, ficar preso e sair puxando para trás. Apertado: aumente a folga; solto: diminua. Depois imprima a peça inteira."],
    };
  }
  const round = p.shape === "cylinder";
  // cilindro estreito: o raio cresce até o bolso deitado ter parede dos lados e na frente
  const R = round ? Math.max(p.width / 2, FRONT_WALL + L.cw / 2, L.coreW / 2, (L.cl + FRONT_WALL) / 2) : 0;
  const T0 = p.shape === "cube" ? p.width : round ? 2 * R : p.thickness;
  const T = Math.max(T0, L.cl + FRONT_WALL);
  if (T > T0) warnings.push(`A espessura subiu para ${fmt(T)} mm para o microfone caber deitado, com parede na frente.`);
  const depth = T - FRONT_WALL; // o microfone entra até encostar na parede da frente, como a referência
  const zc = T / 2;
  const printed = p.head !== "bought";
  const elements: ElementBox[] = [];
  const out = scoped((k) => {
    // cubo justo como a referência (38 × 28,7): só a altura que a abertura e as paredes de cima e de baixo pedem
    const S0 = outline(M, k, ctx, p.shape, p.width, Math.max(L.ch + BOTTOM_WALL + TOP_WALL, p.width * (28.7 / 38)));
    // o miolo (abertura + parede, de y_b até o topo) sobe pelo formato até caber inteiro nele: assim a ponta do coração vira
    // base reta e não sobra bloco para fora. Com folga, o microfone fica no centro do formato.
    const s0 = boxOf(S0);
    const cyMin = L.ch / 2 + BOTTOM_WALL;
    const neckW = printed ? RING_D : p.neckD; // acima do microfone a bolinha já cobre o miolo (o vão do coração, a ponta da estrela)
    const outside = (yb: number, cy: number) => {
      const neck = k(k(M.CrossSection.square([neckW, 1e3])).translate([-neckW / 2, yb + cy]));
      return k(k(k(k(M.CrossSection.square([L.coreW, cy + L.ch / 2 + TOP_WALL])).translate([-L.coreW / 2, yb])).subtract(S0)).subtract(neck)).area();
    };
    const tol = L.coreW * (cyMin + L.ch / 2 + TOP_WALL) * 0.01;
    let yb = s0[1];
    let best = Infinity;
    // cubo: a abertura fica a 1 mm do fundo, como a referência (não centraliza)
    if (p.shape !== "cube") for (let y = s0[1]; y <= s0[3] - cyMin; y += 1) {
      const a = outside(y, cyMin);
      if (a < best - 1e-6) [best, yb] = [a, y];
      if (a <= tol) break;
    }
    const cy = p.shape !== "cube" && -yb > cyMin && outside(yb, -yb) <= tol ? -yb : cyMin;
    // o formato não desce na faixa do cabo (as pernas da estrela e os anilhas do halter ficam ao lado dele)
    const S = k(k(S0.translate([0, -yb])).subtract(k(k(M.CrossSection.square([HANDLE_BAND, 1e3], true)).translate([0, -500]))));
    const coreTop = cy + L.ch / 2 + TOP_WALL;
    const core = k(k(M.CrossSection.square([L.coreW, coreTop])).translate([-L.coreW / 2, 0]));
    const body2d = k(S.add(core));
    const extra = outside(yb, cy);
    const minW = Math.ceil(L.coreW);
    if (p.width < minW || extra > core.area() * 0.03) warnings.push(`O formato ficou estreito para o microfone (largura mínima de uns ${minW} mm): o app engrossou a parte em volta dele. Aumente a largura para o desenho aparecer inteiro.`);
    const sb = boxOf(S);
    // topo no meio (onde a bolinha fica): a altura do corpo em x = 0
    const top = boxOf(k(body2d.intersect(k(M.CrossSection.square([1, 1e3], true)))))[3];
    // caixinha inteira, no sistema da impressão: costas em z = 0 (na mesa), frente em z = T (em cima, com o logo)
    let box: Solid;
    if (round) {
      // cilindro com as costas retas: a frente redonda vira o teto da peça deitada (cada camada menor que a de baixo)
      const h = sb[3] - sb[1];
      const cyl = k(k(k(M.Manifold.cylinder(h, R, R, SEG * 2)).rotate([-90, 0, 0])).translate([0, sb[1], R]));
      box = k(cyl.add(k(k(M.Manifold.cube([2 * R, h, R])).translate([-R, sb[1], 0]))));
    } else box = k(body2d.extrude(T));
    const vcyl = (y0: number, h: number, d: number) => k(k(k(M.Manifold.cylinder(h, d / 2, d / 2, SEG)).rotate([-90, 0, 0])).translate([0, y0, zc]));
    const cuts: Solid[] = [k(openingSolid(M, k, L, depth).translate([0, cy, 0])), vcyl(-1, PEG_H + 1, HANDLE_RECESS)];
    const openTop = cy + L.ch / 2;
    if (printed) cuts.push(vcyl(top - PEG_H, PEG_H + 1, PEG_D));
    else {
      cuts.push(vcyl(top - FOAM_DEPTH, FOAM_DEPTH + 1, p.neckD));
      // canal do som: da janela do clipe até o furo da espuma, por dentro dele
      const [za, zb] = [Math.max(0, zc - (p.neckD / 2 - MIC_WALL)), Math.min(depth - L.clipW / 2, zc + (p.neckD / 2 - MIC_WALL))];
      if (zb > za) cuts.push(k(k(M.Manifold.cube([SOUND_W, top - openTop + 2, zb - za])).translate([-SOUND_W / 2, openTop - 1, za])));
    }
    box = k(box.subtract(k(M.Manifold.union(cuts))));
    const boxParts: Part[] = [{ name: "Caixinha", color: p.bodyColor, mesh: toMesh(box) }];
    // o que vai na frente: texto, desenho/ícone ou nada, em relevo de outra cor na face de cima
    let deco: CS | null = null;
    const area: [number, number, number, number] = [sb[0], sb[1], sb[2], sb[3]];
    const [aw, ah] = [(sb[2] - sb[0]) * 0.66, (sb[3] - sb[1]) * 0.5];
    if (p.front === "text") {
      if (!p.text.trim()) throw new MissingInput("Digite o texto da frente (ou escolha Nada).");
      const raw = ctx.text(p.text, 10);
      if (raw) deco = k(fitInto(k(raw), aw, Math.min(ah, 12), 0));
    } else if (p.front === "art") deco = k(fitInto(requireArt(ctx.art), aw, ah, 0));
    if (deco) {
      const [dx, dy] = placeIn(ctx, "front", boxOf(deco), area);
      const placed = k(k(deco.translate([dx, dy])).intersect(k(S.offset(-1.5, "Round"))));
      elements.push({ id: "front", label: "Frente", box: boxOf(placed) });
      if (round) {
        const shell = (r: number) => k(k(k(M.Manifold.cylinder(sb[3] - sb[1], r, r, SEG * 2)).rotate([-90, 0, 0])).translate([0, sb[1], R]));
        const skin = k(shell(R + p.relief).subtract(shell(R)));
        boxParts.push({ name: "Frente (relevo)", color: p.artColor, mesh: toMesh(k(k(k(placed.extrude(R + p.relief)).translate([0, 0, R])).intersect(skin))) });
      } else boxParts.push(...artParts(p.front === "art" ? ctx : { ...ctx, art: null, artLayers: null }, placed, p.artColor, "Frente (relevo)", p.relief, T));
    }
    // placa 2, tudo em pé: cabo (chanfro embaixo), pecinha (chanfro em cima), anel e a bolinha
    const handle = k(k(M.Manifold.cylinder(1, L.handleD / 2 - 0.8, L.handleD / 2, SEG)).add(k(k(M.Manifold.cylinder(p.handleL - 1, L.handleD / 2, L.handleD / 2, SEG)).translate([0, 0, 1]))));
    const peg = k(k(M.Manifold.cylinder(PEG_L - 0.6, L.peg / 2, L.peg / 2, SEG)).add(k(k(M.Manifold.cylinder(0.6, L.peg / 2, L.peg / 2 - 0.6, SEG)).translate([0, 0, PEG_L - 0.6]))));
    const ringM = k(k(M.Manifold.cylinder(RING_H, RING_D / 2, RING_D / 2, SEG)).subtract(k(k(M.Manifold.cylinder(RING_H + 2, PEG_D / 2, PEG_D / 2, SEG)).translate([0, 0, -1]))));
    const head = printed ? toMesh(buildHead(M, k, p.head as "foam" | "grille")) : null;
    const plate2: Model[] = [
      ...(head ? [{ name: "Bolinha", parts: [{ name: p.head === "grille" ? "Grade" : "Espuma", color: p.headColor, mesh: head }] }, { name: "Anel", parts: [{ name: "Anel", color: p.ringColor, mesh: toMesh(ringM) }] }] : []),
      { name: "Cabo", parts: [{ name: "Cabo", color: p.handleColor, mesh: toMesh(handle) }] },
      ...(printed ? [{ name: "Pecinha", parts: [{ name: "Pecinha de encaixe", color: p.handleColor, mesh: toMesh(peg) }] }] : []),
    ];
    // vista montada (prévia e foto do cartão): de pé, frente para -Y, o cabo embaixo e a bolinha em cima
    const stand = (m: Mesh): Mesh => {
      const q = m.positions.slice();
      for (let i = 0; i < q.length; i += 3) [q[i + 1], q[i + 2]] = [zc - q[i + 2], q[i + 1]];
      return { positions: q, indices: m.indices };
    };
    // transmissor (só na prévia): deitado no bolso, encostado na frente dele, com o clipe por cima da travessa
    const yFront = zc - depth + p.clearance; // na vista montada, +Y é para trás
    const zDisk = cy - L.ch / 2 + p.clearance;
    const disk = k(k(k(roundedRect(M, p.micW, p.micH, L.radius)).extrude(p.micT)).translate([0, yFront + p.micH / 2, zDisk]));
    // clipe: haste no meio do transmissor, subindo pelo rasgo da travessa, e a perna deitada na janela de cima
    const yMid = yFront + p.micH / 2;
    const [legW, legL, stemW, zLeg] = [L.clipW - 2, p.micH * 0.6, L.slotW - 1.5, openTop - L.clipH / 2 - 0.75];
    const clip = k(k(M.Manifold.cube([legW, legL, 1.5])).translate([-legW / 2, yMid - legL / 2, zLeg]));
    const hinge = k(k(M.Manifold.cube([stemW, 4, zLeg + 1.5 - zDisk - p.micT + 0.5])).translate([-stemW / 2, yMid - 2, zDisk + p.micT - 0.5]));
    const txMesh = toMesh(k(M.Manifold.union([disk, clip, hinge])));
    const byName = (n: string) => plate2.find((m) => m.name === n)!;
    const foamR = p.neckD / 2 + 1; // espuma comprada (só na prévia), com a base apertada no furo do topo
    const up: Model[] = printed
      ? [
          { name: "Pecinha", parts: byName("Pecinha").parts.map((x) => ({ ...x, mesh: moveMesh(x.mesh, 0, 0, top - PEG_H) })) },
          { name: "Anel", parts: byName("Anel").parts.map((x) => ({ ...x, mesh: moveMesh(x.mesh, 0, 0, top) })) },
          { name: "Bolinha", parts: byName("Bolinha").parts.map((x) => ({ ...x, mesh: moveMesh(x.mesh, 0, 0, top + RING_H) })) },
        ]
      : [{ name: "Espuma", parts: [{ name: "Espuma (só na prévia)", color: FOAM_COLOR, mesh: toMesh(k(k(k(M.Manifold.sphere(1, SEG)).scale([foamR, foamR, foamR * 1.15])).translate([0, 0, top - FOAM_DEPTH + foamR * 1.15 - 1]))) }] }];
    const assembled: Model[] = [
      { name: "Caixinha", parts: boxParts.map((x) => ({ ...x, mesh: stand(x.mesh) })) },
      { name: "Cabo", parts: byName("Cabo").parts.map((x) => ({ ...x, mesh: moveMesh(x.mesh, 0, 0, PEG_H - p.handleL) })) },
      ...up,
    ];
    // fora, entrando e dentro: o transmissor andando de trás para a frente (o cabo não se mexe)
    const steps = [depth + 15, depth * 0.55, 0].map((dy) => [...assembled, { name: "Transmissor", parts: [{ name: "Transmissor (só na prévia)", color: MIC_COLOR, mesh: moveMesh(txMesh, 0, dy, 0) }] }]);
    // duas mesas como a referência: 1 = caixinha e logo; 2 = bolinha, anel, cabo e pecinha
    const plate1: Model[] = [{ name: "Caixinha", parts: boxParts, plate: 1 }];
    const p2 = spread(plate2);
    const b1 = modelsBounds(plate1)!, b2 = modelsBounds(p2)!;
    const dx = b1.max[0] + bedMm() * 0.2 + (b1.max[0] - b1.min[0]) / 2 - b2.min[0];
    const models = [...plate1, ...p2.map((m) => ({ ...moveModel(m, dx, (b1.min[1] + b1.max[1]) / 2 - (b2.min[1] + b2.max[1]) / 2), plate: 2 }))];
    const bed = layoutPlates([{ label: "Caixinha e logo", models: plate1 }, { label: printed ? "Bolinha, anel, cabo e pecinha" : "Cabo", models: p2 }], bedMm());
    return { models, bed, steps, cy, top };
  });
  warnings.push(
    printed
      ? "Placa 1: a caixinha deitada, costas para baixo e o logo em cima, sem suporte. Placa 2: bolinha, anel, cabo e pecinha, em pé. Monte com cola: o cabo no rebaixo de baixo; a pecinha no rebaixo de cima; o anel passa pela pecinha e a bolinha encaixa nela. O microfone entra por trás, deitado, com o clipe por cima da travessa; para carregar, puxe para trás."
      : "Placa 1: a caixinha deitada, costas para baixo e o logo em cima, sem suporte. Placa 2: o cabo, em pé. Cole o cabo no rebaixo de baixo e aperte a base da espuma no furo de cima. O microfone entra por trás, deitado, com o clipe por cima da travessa; para carregar, puxe para trás.",
  );
  // de costas: a mesma montagem girada meia volta, para ver a abertura e o transmissor
  const turn = (ms: Model[]) => ms.map((m) => ({ ...m, parts: m.parts.map((x) => { const q = x.mesh.positions.slice(); for (let i = 0; i < q.length; i += 3) [q[i], q[i + 1]] = [-q[i], -q[i + 1]]; return { ...x, mesh: { ...x.mesh, positions: q } }; }) }));
  const views = [
    { id: "closed", label: "Montada", models: out.steps[2], note: printed ? "Como fica pronta, com o transmissor (que não vai para o arquivo)." : "Como fica pronta, com a espuma e o transmissor (que não vão para o arquivo)." },
    { id: "out", label: "1. Fora", models: turn(out.steps[0]), note: "Costas: o transmissor deitado, com o clipe para cima, na frente da abertura." },
    { id: "in", label: "2. Entrando", models: turn(out.steps[1]), note: "Empurre para a frente: o corpo desliza no bolso e o clipe por cima da travessa. O cabo não sai do lugar." },
    { id: "back", label: "3. Dentro", models: turn(out.steps[2]), note: "Preso: o clipe abraça a travessa e a luz fica à vista. Para tirar e carregar, puxe para trás." },
    { id: "bed", label: "Placas", models: out.bed, note: "Duas placas, como a referência: a caixinha com o logo numa, o resto na outra." },
  ];
  return { models: out.models, views, elements, warnings, layout: { cy: out.cy, top: out.top, depth, thickness: T } };
}

const fmt = (n: number) => n.toFixed(1).replace(".", ",");
