import { bedMm } from "../bed";
import type { CS, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type Side = "left" | "right" | "top" | "bottom";
export type Connector = { side: Side; pos: number; w: number; h: number; z0: number };

export type BoardBoxParams = {
  boardL: number;
  boardW: number;
  boardT: number;
  /** Furos de fixação da placa: "x, y; x, y" em mm, a partir do canto inferior esquerdo da placa. */
  holes: string;
  holeD: number;
  mount: "pegs" | "screws" | "pads";
  standoffH: number;
  /** Aberturas dos conectores: uma por linha ("lado, posição, largura, altura, altura do fundo"). */
  connectors: string;
  /** Espaço livre acima da placa (o conector e o pino mais altos). */
  headroom: number;
  wall: number;
  clearance: number;
  lidGap: number;
  vents: number;
  label: string;
  print: "box" | "test";
  boxColor: string;
  lidColor: string;
};

export const DEFAULT_BOARD_BOX: BoardBoxParams = {
  boardL: 68.6,
  boardW: 53.3,
  boardT: 1.6,
  holes: "14, 2.5; 15.3, 50.7; 66.1, 7.6; 66.1, 35.5",
  holeD: 3.2,
  mount: "pegs",
  standoffH: 4,
  connectors: "left, 38, 13, 12, 0\nleft, 7.5, 10, 12, 0",
  headroom: 20,
  wall: 2,
  clearance: 0.5,
  lidGap: 0.25,
  vents: 4,
  label: "Arduino",
  print: "box",
  boxColor: "#1f2937",
  lidColor: "#e5e7eb",
};

const FLOOR = 2;
const STANDOFF_D = 6.5;
const SCREW_PILOT = 2.4; // furo para parafuso de rosca no plástico (M2.5/M3)
const LID_T = 2.5;
const LIP_H = 2.5;
const LIP_W = 1.5;
const VENT_W = 2;
const VENT_L = 18;
const TEST_WALL_H = 5;
const GAP = 10;
const CUT_MARGIN = 0.4; // folga extra nas aberturas (plástico e solda variam)
const SIDES = new Set<Side>(["left", "right", "top", "bottom"]);
const num = (s: string) => Number(s.trim().replace(",", "."));

/** "x, y; x, y" → furos; linha ruim volta em `bad`. */
export function parseHoles(s: string): { holes: [number, number][]; bad: string[] } {
  const holes: [number, number][] = [], bad: string[] = [];
  for (const part of s.split(/[;\n]/).map((t) => t.trim()).filter(Boolean)) {
    const [x, y, ...rest] = part.split(/\s+/).join(" ").split(/[\s,]+/).map(num);
    if (Number.isFinite(x) && Number.isFinite(y) && !rest.length && x >= 0 && y >= 0) holes.push([x, y]);
    else bad.push(part);
  }
  return { holes, bad };
}

/** "lado, posição, largura, altura, altura do fundo" por linha; o lado é left, right, top ou bottom (esquerda, direita, cima, baixo). */
export function parseConnectors(s: string): { list: Connector[]; bad: string[] } {
  const names: Record<string, Side> = { left: "left", esquerda: "left", right: "right", direita: "right", top: "top", cima: "top", bottom: "bottom", baixo: "bottom" };
  const list: Connector[] = [], bad: string[] = [];
  for (const line of s.split(/\n|;/).map((t) => t.trim()).filter(Boolean)) {
    const [side, ...rest] = line.split(",").map((t) => t.trim());
    const [pos, w, h, z0 = 0] = rest.map(num);
    const sd = names[side?.toLowerCase()];
    if (sd && SIDES.has(sd) && [pos, w, h, z0].every(Number.isFinite) && w > 0 && h > 0) list.push({ side: sd, pos, w, h, z0 });
    else bad.push(line);
  }
  return { list, bad };
}

/**
 * Caixa para placa eletrônica (#233): a placa assenta em pinos ou colunas no fundo, os conectores saem por aberturas na parede
 * e a tampa encaixa por um lábio. As medidas da placa, os furos e as aberturas são campos (os perfis prontos só os preenchem).
 * "Só a bandeja de teste" imprime o fundo com os pinos e uma parede baixa para conferir os furos e o encaixe antes da caixa.
 */
export function buildBoardBox(ctx: ModelCtx, p: BoardBoxParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const { holes, bad: badHoles } = parseHoles(p.holes);
    const { list: conns, bad: badConns } = parseConnectors(p.connectors);
    if (badHoles.length) warnings.push(`Furo ignorado (use "x, y; x, y"): ${badHoles.join(" | ")}`);
    if (badConns.length) warnings.push(`Abertura ignorada (use "lado, posição, largura, altura, altura do fundo"): ${badConns.join(" | ")}`);
    const outsideHoles = holes.filter(([x, y]) => x > p.boardL || y > p.boardW);
    if (outsideHoles.length) warnings.push("Há furo fora da placa: confira as medidas.");
    const onBoard = holes.filter(([x, y]) => x <= p.boardL && y <= p.boardW); // só estes viram coluna

    const cl = p.clearance, w = p.wall;
    const cx = p.boardL / 2, cy = p.boardW / 2;
    const innerL = p.boardL + 2 * cl, innerW = p.boardW + 2 * cl;
    const outerL = innerL + 2 * w, outerW = innerW + 2 * w;
    const test = p.print === "test";
    const boardTop = FLOOR + p.standoffH + p.boardT; // z da face de cima da placa
    const innerH = p.standoffH + p.boardT + p.headroom; // do fundo da caixa até a tampa
    const wallH = test ? TEST_WALL_H : FLOOR + innerH;
    const place = (cs: CS) => k(cs.translate([cx, cy]));

    // ---- caixa: casca, colunas e pinos
    const shell2d = k(k(roundedRect(M, outerL, outerW, Math.min(3, w + 1))).subtract(k(roundedRect(M, innerL, innerW, 1))));
    const floor2d = k(roundedRect(M, outerL, outerW, Math.min(3, w + 1)));
    let box: Solid = k(M.Manifold.union([k(place(floor2d).extrude(FLOOR)), k(place(shell2d).extrude(wallH))]));
    const posts: Solid[] = [];
    const pegR = Math.max(0.8, (p.holeD - 0.3) / 2);
    for (const [x, y] of onBoard) {
      if (p.mount === "pads") continue;
      posts.push(k(k(M.Manifold.cylinder(p.standoffH, STANDOFF_D / 2, STANDOFF_D / 2, 32)).translate([x, y, FLOOR - 0.01])));
      if (p.mount === "pegs") posts.push(k(k(M.Manifold.cylinder(p.boardT + 1.2, pegR, pegR, 24)).translate([x, y, FLOOR + p.standoffH - 0.01])));
    }
    if (p.mount === "pads") {
      // sem furos: quatro apoios nos cantos
      for (const [x, y] of [[4, 4], [p.boardL - 4, 4], [4, p.boardW - 4], [p.boardL - 4, p.boardW - 4]] as [number, number][])
        posts.push(k(k(M.Manifold.cylinder(p.standoffH, 3, 3, 24)).translate([x, y, FLOOR - 0.01])));
    }
    if (posts.length) box = k(M.Manifold.union([box, ...posts]));
    if (p.mount === "screws") {
      const pilots = onBoard.map(([x, y]) => k(k(M.Manifold.cylinder(p.standoffH + 1, SCREW_PILOT / 2, SCREW_PILOT / 2, 24)).translate([x, y, FLOOR + 0.5])));
      if (pilots.length) box = k(box.subtract(k(M.Manifold.union(pilots))));
    }

    // ---- aberturas dos conectores (nas paredes)
    if (!test && conns.length) {
      const cuts: Solid[] = [];
      for (const c of conns) {
        const z0 = boardTop + c.z0 - CUT_MARGIN, h = c.h + 2 * CUT_MARGIN, ww = c.w + 2 * CUT_MARGIN, len = w + 3;
        const horizontal = c.side === "left" || c.side === "right"; // a abertura atravessa a parede em x
        const dims: [number, number, number] = horizontal ? [len, ww, h] : [ww, len, h];
        const at: [number, number, number] = horizontal
          ? [c.side === "left" ? -cl - w - 1 : p.boardL + cl - 0.01, c.pos - ww / 2, z0]
          : [c.pos - ww / 2, c.side === "bottom" ? -cl - w - 1 : p.boardW + cl - 0.01, z0];
        if (z0 + h > wallH + 0.5) warnings.push("Uma abertura passa da altura da caixa: aumente o espaço livre acima da placa.");
        cuts.push(k(k(M.Manifold.cube(dims, false)).translate(at)));
      }
      box = k(box.subtract(k(M.Manifold.union(cuts))));
    }
    if (conns.some((c) => (c.side === "left" || c.side === "right" ? c.pos + c.w / 2 > p.boardW + cl : c.pos + c.w / 2 > p.boardL + cl) || c.pos - c.w / 2 < -cl)) warnings.push("Uma abertura sai da parede: confira a posição e a largura.");

    const bBox = box.boundingBox();
    let layout: [number, number] = [bBox.max[0] - bBox.min[0], bBox.max[1] - bBox.min[1]];
    const models = [{ name: "Caixa", parts: [{ name: "Caixa", color: p.boxColor, mesh: solidMesh(k(box.translate([-bBox.min[0], -bBox.min[1], 0]))) }] }];

    // ---- tampa: placa + lábio que entra na caixa (folga lidGap), respiros e nome gravado
    if (!test) {
      const lidOuter = k(roundedRect(M, outerL, outerW, Math.min(3, w + 1)));
      const lipOut = k(roundedRect(M, innerL - 2 * p.lidGap, innerW - 2 * p.lidGap, 1));
      const lipIn = k(roundedRect(M, innerL - 2 * (p.lidGap + LIP_W), innerW - 2 * (p.lidGap + LIP_W), 1));
      let lid: Solid = k(M.Manifold.union([k(lidOuter.extrude(LID_T)), k(k(k(lipOut.subtract(lipIn)).extrude(LIP_H + 0.01)).translate([0, 0, LID_T - 0.01]))]));
      const vents = Math.max(0, Math.round(p.vents));
      if (vents) {
        const slots: Solid[] = Array.from({ length: vents }, (_, i) => {
          const y = (i - (vents - 1) / 2) * (VENT_W * 2.2);
          return k(k(k(roundedRect(M, VENT_L, VENT_W, VENT_W / 2)).extrude(LID_T + 2)).translate([0, y, -1]));
        });
        lid = k(lid.subtract(k(M.Manifold.union(slots))));
      }
      if (p.label.trim()) {
        const raw = ctx.text(p.label, 6);
        if (raw) {
          const t = k(fitInto(k(raw), Math.min(outerL * 0.6, 40), 6, 0));
          // o nome fica na face de fora (a que encosta na mesa na impressão): espelhado para ler certo
          const mirrored = k(t.mirror([1, 0]));
          const shiftY = vents ? (vents * VENT_W * 2.2) / 2 + 6 : 0;
          lid = k(lid.subtract(k(k(mirrored.extrude(0.6 + 0.01)).translate([0, shiftY, -0.01]))));
        }
      }
      const lb = lid.boundingBox();
      const boxW = bBox.max[0] - bBox.min[0], boxD = bBox.max[1] - bBox.min[1];
      // a tampa vai ao lado da caixa ou atrás dela, o que ocupar menos da mesa
      const beside = Math.max(2 * boxW + GAP, boxD) <= Math.max(boxW, 2 * boxD + GAP);
      const lidAt: [number, number] = beside ? [boxW + GAP - lb.min[0], -lb.min[1] - (lb.max[1] - lb.min[1]) / 2 + boxD / 2] : [-lb.min[0] - (lb.max[0] - lb.min[0]) / 2 + boxW / 2, boxD + GAP - lb.min[1]];
      models.push({ name: "Tampa", parts: [{ name: "Tampa", color: p.lidColor, mesh: solidMesh(k(lid.translate([lidAt[0], lidAt[1], 0]))) }] });
      layout = beside ? [2 * boxW + GAP, boxD] : [boxW, 2 * boxD + GAP];
      if (vents && VENT_L + 4 > outerL) warnings.push("A tampa é estreita para os respiros: diminua a quantidade.");
    }
    if (!test && Math.max(...layout) > bedMm()) warnings.push(`Caixa e tampa ocupam ${Math.round(layout[0])} × ${Math.round(layout[1])} mm: passam da mesa de ${bedMm()} mm; imprima uma de cada vez.`);
    if (p.standoffH < 3) warnings.push("Coluna baixa: o lado de baixo da placa pode encostar nas soldas. Use 3 mm ou mais.");
    return { models, warnings };
  });
}
