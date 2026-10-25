import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { spread } from "../planeCut";
import { fitInto, scoped } from "../shape2d";
import { presetSilhouette, silhouetteFromDesign } from "../thermo/shapes";
import type { Mesh, Model, Part } from "../types";
import { artParts, boxOf, MissingInput, moveMesh, placeIn, requireArt, roundedRect, type ElementBox, type ModelCtx, type ModelOutput } from "./common";

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
export const MIC_SHAPE_WIDTH: Record<MicShape, number> = { cube: 50, cylinder: 50, heart: 62, star: 66, flower: 62, cloud: 64, house: 56, dumbbell: 84, medical: 60, podcast: 58, book: 68, art: 60 };

export type MicHolderParams = {
  shape: MicShape;
  width: number;
  thickness: number; // cubo e cilindro usam a largura
  micW: number; // medidas do transmissor, de pé, visto de frente
  micH: number;
  micT: number;
  micRound: boolean;
  clearance: number; // folga em volta do microfone (Kit de testes)
  neckD: number; // pescoço onde a espuma encaixa
  neckH: number;
  handleL: number;
  front: "text" | "art" | "none";
  text: string;
  relief: number;
  print: "full" | "test";
  bodyColor: string;
  artColor: string;
  handleColor: string;
};

/** Hollyland Lark M2: Ø26 × 9,9 mm (ficha oficial, sem o ímã). */
export const DEFAULT_MIC_HOLDER: MicHolderParams = {
  shape: "cube",
  width: 50,
  thickness: 30,
  micW: 26,
  micH: 26,
  micT: 9.9,
  micRound: true,
  clearance: 0.5,
  neckD: 28,
  neckH: 14,
  handleL: 75,
  front: "text",
  text: "UPVISION",
  relief: 1,
  print: "full",
  bodyColor: "#f8f8f6",
  artColor: "#1c1c1e",
  handleColor: "#f8f8f6", // na cor do meio: cabo de outra cor sobe junto e troca o filamento em toda camada
};

export const MIC_WALL = 2.4; // parede em volta do berço
export const MIN_WIDTH = 40;
export const TENON_FIT = 0.15; // o encaixe do cabo entra justo no canal (por lado)
const TENON_MIN = 8; // o canal abaixo do microfone, onde o encaixe do cabo entra
const FLOOR = 2; // fundo de cada metade atrás do bolso
const SOUND_W = 8; // canal do som, do microfone até o topo do pescoço
const HANDLE_TOP = 30;
const HANDLE_BOTTOM = 22;
export const PIN_D = 4;
const PIN_FIT = 0.15;
const PIN_WALL = 1.6;
const PIN_DEPTH = 5;
const RING_H = 12;
const SEG = 64;
const FOAM_COLOR = "#2b2b2b";

/** Medidas que saem dos parâmetros: berço (com folga), canal, centro do microfone e encaixe do cabo. */
export function micLayout(p: Pick<MicHolderParams, "micW" | "micH" | "micT" | "clearance" | "micRound">) {
  const cw = p.micW + 2 * p.clearance;
  const ch = p.micH + 2 * p.clearance;
  const cd = p.micT + 2 * p.clearance;
  const coreW = cw + 2 * MIC_WALL;
  return { cw, ch, cd, coreW, radius: p.micRound ? Math.min(cw, ch) / 2 : Math.min(2, cw / 4), tenon: [cw - 2 * TENON_FIT, cd - 2 * TENON_FIT] as const };
}

/** Onde ficaram as coisas (para os testes e a vista montada): centro do microfone, topo do pescoço, encaixe e pinos. */
export type MicHolderOutput = ModelOutput & { layout: { cy: number; top: number; tenonL: number; pinDepth: number; pins: [number, number][]; thickness: number } | null };

type K = <D extends { delete(): void }>(o: D) => D;

/** Contorno do formato centrado na origem, `w` de largura. */
function outline(M: ManifoldToplevel, k: K, ctx: ModelCtx, shape: MicShape, w: number): CS {
  const poly = (pts: [number, number][]) => k(new M.CrossSection([pts], "NonZero"));
  const circle = (r: number, x: number, y: number) => k(k(M.CrossSection.circle(r, SEG)).translate([x, y]));
  const rect = (rw: number, rh: number, x: number, y: number, r = 0) => k(k(roundedRect(M, rw, rh, r)).translate([x, y]));
  const smooth = (cs: CS, r: number) => k(k(cs.offset(-r, "Round")).offset(r, "Round"));
  let cs: CS;
  switch (shape) {
    case "cube":
    case "cylinder":
      return k(roundedRect(M, w, w, shape === "cube" ? 4 : 0));
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

/** Ponto dentro da região? (sonda pequena) */
const inside = (M: ManifoldToplevel, k: K, cs: CS, x: number, y: number) => !k(k(k(M.CrossSection.circle(0.01, 8)).translate([x, y])).intersect(cs)).isEmpty();

/**
 * Canopla para microfone sem fio (#274): o meio no formato escolhido, oco, com o microfone de pé dentro. Sai em 2 metades
 * (frente e costas) cortadas ao meio da espessura, deitadas com o corte na mesa (sem suporte), unidas por pinos soltos.
 * O microfone entra por baixo e o cabo, peça à parte, encaixa no mesmo canal e segura o microfone. O pescoço redondo
 * no topo recebe a espuma. "Anel de teste": só o berço, para conferir a medida antes da peça inteira.
 */
export function buildMicHolder(ctx: ModelCtx, p: MicHolderParams): MicHolderOutput {
  const { M } = ctx;
  const L = micLayout(p);
  const warnings: string[] = [];
  if (p.print === "test") {
    const ring = scoped((k) => toMesh(k(k(k(roundedRect(M, L.cw + 2 * MIC_WALL, L.cd + 2 * MIC_WALL, MIC_WALL + 1)).subtract(k(roundedRect(M, L.cw, L.cd, 1)))).extrude(RING_H))));
    return {
      layout: null,
      models: [{ name: "Anel de teste", parts: [{ name: "Anel", color: p.bodyColor, mesh: ring }] }],
      warnings: ["Anel de teste: o microfone (com o ímã ou clipe que você vai usar) deve passar pela abertura sem forçar e sem folga grande. Apertado: aumente a folga; solto: diminua. Depois imprima a peça inteira."],
    };
  }
  const round = p.shape === "cylinder";
  // cilindro estreito: o raio cresce até o berço ter parede na altura do bolso (a largura no corte é a do miolo)
  const R = round ? Math.max(p.width / 2, Math.hypot(L.coreW / 2, L.cd / 2)) : 0;
  const T0 = p.shape === "cube" ? p.width : round ? 2 * R : p.thickness;
  const T = Math.max(T0, L.cd + 2 * FLOOR);
  if (T > T0) warnings.push(`A espessura subiu para ${fmt(T)} mm para o microfone caber com parede atrás.`);
  const elements: ElementBox[] = [];
  const out = scoped((k) => {
    const S0 = outline(M, k, ctx, p.shape, p.width);
    // o miolo (berço + parede, de y_b até o topo) sobe pelo formato até caber inteiro nele: assim a ponta do coração vira
    // base reta e não sobra bloco para fora. Com folga, o microfone fica no centro do formato.
    const s0 = boxOf(S0);
    const cyMin = L.ch / 2 + TENON_MIN;
    // acima do microfone o pescoço já cobre o miolo (o vão do coração, a ponta da estrela)
    const outside = (yb: number, cy: number) => {
      const neck = k(k(M.CrossSection.square([p.neckD, 1e3])).translate([-p.neckD / 2, yb + cy]));
      return k(k(k(k(M.CrossSection.square([L.coreW, cy + L.ch / 2 + MIC_WALL])).translate([-L.coreW / 2, yb])).subtract(S0)).subtract(neck)).area();
    };
    const tol = L.coreW * (cyMin + L.ch / 2 + MIC_WALL) * 0.01;
    let yb = s0[1];
    let best = Infinity;
    for (let y = s0[1]; y <= s0[3] - cyMin; y += 1) {
      const a = outside(y, cyMin);
      if (a < best - 1e-6) [best, yb] = [a, y];
      if (a <= tol) break;
    }
    const cy = -yb > cyMin && outside(yb, -yb) <= tol ? -yb : cyMin;
    // o formato não desce na faixa do cabo (as pernas da estrela e os anilhas do halter ficam ao lado dele)
    const S = k(k(S0.translate([0, -yb])).subtract(k(k(M.CrossSection.square([HANDLE_TOP + 2, 1e3], true)).translate([0, -500]))));
    const coreTop = cy + L.ch / 2 + MIC_WALL;
    const core = k(k(M.CrossSection.square([L.coreW, coreTop])).translate([-L.coreW / 2, 0]));
    const body2d = k(S.add(core));
    const extra = outside(yb, cy);
    if (p.width < MIN_WIDTH || extra > core.area() * 0.03) warnings.push(`O formato ficou estreito para o microfone (largura mínima de uns ${MIN_WIDTH} mm): o app engrossou a parte em volta dele. Aumente a largura para o desenho aparecer inteiro.`);
    const sb = boxOf(S);
    const top = Math.max(sb[3], coreTop) + p.neckH;
    // berço + canal do cabo (de baixo até o centro) + canal do som (até o topo do pescoço)
    const cavity = k(M.CrossSection.union([k(k(roundedRect(M, L.cw, L.ch, L.radius)).translate([0, cy])), k(k(M.CrossSection.square([L.cw, cy])).translate([-L.cw / 2, 0])), k(k(M.CrossSection.square([SOUND_W, top - cy + 1])).translate([-SOUND_W / 2, cy]))]));
    // pinos: o primeiro par simétrico (dos lados do berço) que fica inteiro no formato, com parede
    const pr = PIN_D / 2 + PIN_FIT;
    const safe = k(k(body2d.offset(-(pr + PIN_WALL), "Round")).subtract(k(cavity.offset(pr + PIN_WALL, "Round"))));
    const xs = L.cw / 2 + PIN_WALL + pr + 0.5;
    const ys = [cy, cy + L.ch / 2, cy - L.ch / 4, coreTop, cy + L.ch];
    const xsAll = [xs, xs + 4, xs + 8];
    let spots: [number, number][] = [];
    for (const y of ys) {
      for (const x of xsAll) if (inside(M, k, safe, x, y) && inside(M, k, safe, -x, y)) { spots = [[-x, y], [x, y]]; break; }
      if (spots.length) break;
    }
    if (!spots.length) warnings.push("Não coube pino entre as metades: alinhe pela borda e cole.");
    const depth = Math.min(PIN_DEPTH, T / 2 - FLOOR);
    // metade sem a arte, com o corte em z = 0 (fica na mesa)
    const halfShell = (): Solid => {
      let s: Solid;
      if (round) {
        const cyl = k(k(k(M.Manifold.cylinder(sb[3] - sb[1], R, R, SEG * 2)).rotate([-90, 0, 0])).translate([0, sb[1], 0]));
        s = k(cyl.trimByPlane([0, 0, 1], 0));
      } else s = k(body2d.extrude(T / 2));
      const neck = k(k(k(k(M.Manifold.cylinder(top - cy - L.ch / 2, p.neckD / 2, p.neckD / 2, SEG)).rotate([-90, 0, 0])).translate([0, cy + L.ch / 2, 0])).trimByPlane([0, 0, 1], 0));
      s = k(s.add(neck));
      s = k(s.subtract(k(k(cavity.extrude(L.cd / 2 + 0.01)).translate([0, 0, -0.01]))));
      for (const [x, y] of spots) s = k(s.subtract(k(k(M.Manifold.cylinder(depth + 0.4, pr, pr, 32)).translate([x, y, -0.01]))));
      return s;
    };
    const front = halfShell();
    const back = k(halfShell().mirror([1, 0, 0]));
    const frontParts: Part[] = [{ name: "Frente", color: p.bodyColor, mesh: toMesh(front) }];
    // o que vai na frente: texto, desenho/ícone ou nada, em relevo de outra cor
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
      const db = boxOf(placed);
      elements.push({ id: "front", label: "Frente", box: db });
      if (round) {
        const shell = (r: number) => k(k(k(M.Manifold.cylinder(sb[3] - sb[1], r, r, SEG * 2)).rotate([-90, 0, 0])).translate([0, sb[1], 0]));
        const skin = k(shell(R + p.relief).subtract(shell(R)));
        frontParts.push({ name: "Frente (relevo)", color: p.artColor, mesh: toMesh(k(k(placed.extrude(R + p.relief)).intersect(skin))) });
      } else frontParts.push(...artParts(p.front === "art" ? ctx : { ...ctx, art: null, artLayers: null }, placed, p.artColor, "Frente (relevo)", p.relief, T / 2));
    }
    // cabo de pé: afina para baixo; o encaixe no topo entra no canal e segura o microfone
    const tenonL = cy - L.ch / 2;
    const handle = k(k(M.Manifold.cylinder(p.handleL, HANDLE_BOTTOM / 2, HANDLE_TOP / 2, SEG)).add(k(k(k(roundedRect(M, L.tenon[0], L.tenon[1], 1)).extrude(tenonL)).translate([0, 0, p.handleL]))));
    const pinLen = 2 * depth - 0.4;
    const pins = spots.map((_, i) => k(k(M.Manifold.cylinder(pinLen, PIN_D / 2, PIN_D / 2, 32)).translate([i * (PIN_D + 4), 0, 0])));
    const models: Model[] = [
      { name: "Frente", parts: frontParts },
      { name: "Costas", parts: [{ name: "Costas", color: p.bodyColor, mesh: toMesh(back) }] },
      { name: "Cabo", parts: [{ name: "Cabo", color: p.handleColor, mesh: toMesh(handle) }] },
      ...(pins.length ? [{ name: "Pinos", parts: [{ name: "Pinos", color: p.bodyColor, mesh: toMesh(k(M.Manifold.union(pins))) }] }] : []),
    ];
    // vista montada (prévia e foto do cartão): de pé, frente para -Y, o cabo embaixo e a espuma no pescoço
    const stand = (m: Mesh, f: (x: number, y: number, z: number) => [number, number, number]): Mesh => {
      const q = m.positions.slice();
      for (let i = 0; i < q.length; i += 3) [q[i], q[i + 1], q[i + 2]] = f(q[i], q[i + 1], q[i + 2]);
      return { positions: q, indices: m.indices };
    };
    const foamR = p.neckD / 2 + 5;
    const foam = k(k(k(M.Manifold.sphere(1, SEG)).scale([foamR, foamR, foamR * 1.15])).translate([0, 0, top - p.neckH * 0.3]));
    const assembled: Model[] = [
      { name: "Frente", parts: frontParts.map((x) => ({ ...x, mesh: stand(x.mesh, (a, b, c) => [a, -c, b]) })) },
      { name: "Costas", parts: [{ name: "Costas", color: p.bodyColor, mesh: stand(models[1].parts[0].mesh, (a, b, c) => [-a, c, b]) }] },
      { name: "Cabo", parts: [{ name: "Cabo", color: p.handleColor, mesh: moveMesh(models[2].parts[0].mesh, 0, 0, -p.handleL) }] },
      { name: "Espuma", parts: [{ name: "Espuma (só na prévia)", color: FOAM_COLOR, mesh: toMesh(foam) }] },
    ];
    return { models: spread(models), assembled, cy, top, tenonL, depth, spots };
  });
  warnings.push("Duas metades: ponha os pinos, passe cola e una a frente e as costas. O microfone entra por baixo e o cabo encaixa no mesmo canal, segurando ele. A espuma veste o pescoço.");
  const views = [
    { id: "closed", label: "Montada", models: out.assembled, note: "Como fica pronta, com a espuma (que não vai para o arquivo)." },
    { id: "bed", label: "Mesa", models: out.models },
  ];
  return { models: out.models, views, elements, warnings, layout: { cy: out.cy, top: out.top, tenonL: out.tenonL, pinDepth: out.depth, pins: out.spots, thickness: T } };
}

const fmt = (n: number) => n.toFixed(1).replace(".", ",");
