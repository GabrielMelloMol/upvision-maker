import { meshBounds } from "../bounds";
import type { CS, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model } from "../types";
import { moveModel, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

/*
 * Caixa de discos (#214): CDs, DVDs e Blu-rays em pé, cada um no seu vão entre divisórias baixas, com entalhe na frente
 * e atrás para os dedos e uma tampa tipo capuz que cobre a parte dos discos que passa da caixa. A tampa imprime de
 * cabeça para baixo (topo na mesa: sem ponte) e leva o nome em duas cores, rente, e um furo oval para puxar.
 */
export type DiscKind = "disc" | "slim" | "jewel" | "dvd" | "bluray";
export type DiscLayout = "print" | "assembled";

/** Medidas de cada item em mm: profundidade na caixa, altura em pé e espessura. */
export const DISC_ITEMS: Record<DiscKind, { label: string; depth: number; height: number; thick: number }> = {
  disc: { label: "Disco solto (CD, DVD)", depth: 120, height: 120, thick: 1.3 },
  slim: { label: "CD em caixa fina", depth: 142, height: 125, thick: 5.5 },
  jewel: { label: "CD em caixa comum", depth: 142, height: 125, thick: 10.6 },
  dvd: { label: "DVD em caixa", depth: 135, height: 190, thick: 14.2 },
  bluray: { label: "Blu-ray em caixa", depth: 130, height: 171, thick: 13.2 },
};

export type DiscBoxParams = {
  kind: DiscKind;
  count: number;
  text: string;
  layout: DiscLayout; // só a mesa, ou também a caixa fechada ao lado (só prévia: o 3MF leva só a mesa)
  bodyColor: string;
  lidColor: string;
  textColor: string;
};

export const DEFAULT_DISC_BOX: DiscBoxParams = { kind: "jewel", count: 6, text: "FILMES", layout: "print", bodyColor: "#2563eb", lidColor: "#1e3a8a", textColor: "#f8f8f6" };

export const WALL = 2;
export const FLOOR = 2;
const DIV = 1.2; // divisória entre os vãos
const GAP = 1.4; // folga em cada vão, somada à espessura do item
const CLEAR = 1.5; // folga na profundidade
const BOX_FRACTION = 0.6; // altura da parede da caixa, em fração da altura do item
const DIV_FRACTION = 0.45; // altura das divisórias
const MIN_INNER = 44; // largura mínima de dentro (entalhe e nome precisam de espaço)
const CORNER = 6;
const FIT = 0.35; // folga da tampa
const OVERLAP = 8; // quanto a tampa desce sobre a caixa
const HEADROOM = 3; // folga entre o topo dos itens e a tampa
const LID_T = 2.2; // espessura do topo da tampa
const INLAY = 0.6;
const NOTCH_R = 20;
const PULL_W = 30;
const PULL_H = 11;
const SEG = 48;
const PREVIEW_GAP = 25;

/** Medidas derivadas, exportadas para os testes. */
export function discBoxSizes(p: Pick<DiscBoxParams, "kind" | "count">) {
  const it = DISC_ITEMS[p.kind];
  const innerX = Math.max(MIN_INNER, p.count * (it.thick + GAP) + (p.count - 1) * DIV);
  const innerY = it.depth + 2 * CLEAR;
  const boxH = FLOOR + it.height * BOX_FRACTION;
  const exposed = it.height - (boxH - FLOOR);
  const lidCavity = OVERLAP + exposed + HEADROOM;
  return { it, innerX, innerY, outerX: innerX + 2 * WALL, outerY: innerY + 2 * WALL, boxH, exposed, lidCavity, lidH: lidCavity + LID_T };
}

function box(ctx: ModelCtx, p: DiscBoxParams): Solid {
  const { M } = ctx;
  const s = discBoxSizes(p);
  return scoped((k) => {
    let body: Solid = k(k(roundedRect(M, s.outerX, s.outerY, CORNER)).extrude(s.boxH));
    body = k(body.subtract(k(k(k(roundedRect(M, s.innerX, s.innerY, Math.max(CORNER - WALL, 1))).extrude(s.boxH)).translate([0, 0, FLOOR]))));
    // divisórias baixas, centradas na largura
    const slot = s.it.thick + GAP;
    const used = p.count * slot + (p.count - 1) * DIV;
    const dividers: Solid[] = [];
    for (let i = 1; i < p.count; i++) {
      const x = -used / 2 + i * slot + (i - 0.5) * DIV;
      dividers.push(k(k(M.Manifold.cube([DIV, s.innerY, s.it.height * DIV_FRACTION], false)).translate([x - DIV / 2, -s.innerY / 2, FLOOR - 0.01])));
    }
    if (dividers.length) body = k(body.add(k(M.Manifold.union(dividers))));
    // entalhe em meia-lua nas paredes da frente e de trás, para pegar o disco
    const notch = k(k(k(M.CrossSection.circle(Math.min(NOTCH_R, s.innerX / 3), SEG)).extrude(s.outerY + 2)).rotate([90, 0, 0]));
    return body.subtract(k(notch.translate([0, s.outerY / 2 + 1, s.boxH])));
  });
}

/** Tampa em pé (fundo aberto para baixo, em z = 0); o nome entra rente no topo, numa peça à parte. */
function lid(ctx: ModelCtx, p: DiscBoxParams): { body: Solid; name: Solid | null } {
  const { M } = ctx;
  const s = discBoxSizes(p);
  const X = s.outerX + 2 * (FIT + WALL), Y = s.outerY + 2 * (FIT + WALL);
  return scoped((k) => {
    let body: Solid = k(k(roundedRect(M, X, Y, CORNER + WALL)).extrude(s.lidH));
    body = k(body.subtract(k(k(roundedRect(M, s.outerX + 2 * FIT, s.outerY + 2 * FIT, CORNER)).extrude(s.lidCavity))));
    // furo oval para puxar, perto da frente
    const pull = k(k(k(roundedRect(M, PULL_W, PULL_H, PULL_H / 2 - 0.05)).extrude(LID_T + 2)).translate([0, -Y / 2 + WALL + PULL_H + 8, s.lidCavity - 1]));
    body = k(body.subtract(pull));
    let name: Solid | null = null;
    const raw = p.text.trim() ? ctx.text(p.text, Math.min(30, s.innerY * 0.3)) : null;
    if (raw) {
      const fitted: CS = k(fitInto(k(raw), X * 0.7, Math.min(30, s.innerY * 0.3), 0));
      const cut = k(k(fitted.extrude(INLAY + 0.01)).translate([0, 0, s.lidH - INLAY]));
      const inlay = k(body.intersect(k(k(fitted.extrude(INLAY)).translate([0, 0, s.lidH - INLAY]))));
      body = k(body.subtract(cut));
      name = inlay;
    }
    return { body: body.translate([0, 0, 0]), name: name ? name.translate([0, 0, 0]) : null };
  });
}

const flip = (s: Solid, h: number): Solid => scoped((k) => k(s.rotate([180, 0, 0])).translate([0, 0, h]));

/** Caixa de discos: caixa, tampa (de cabeça para baixo, pronta para imprimir) e, se pedido, a caixa fechada ao lado só de prévia. */
export function buildDiscBox(ctx: ModelCtx, p: DiscBoxParams): ModelOutput {
  const s = discBoxSizes(p);
  return scoped((k) => {
    const body = k(box(ctx, p));
    const l = lid(ctx, p);
    k(l.body);
    if (l.name) k(l.name);
    const boxModel: Model = { name: "Caixa", parts: [{ name: "Caixa", color: p.bodyColor, mesh: solidMesh(body) }] };
    // a tampa vira de cabeça para baixo: o topo (liso) fica na mesa e o interior para cima, sem ponte
    const lidParts = [{ name: "Tampa", color: p.lidColor, mesh: solidMesh(k(flip(l.body, s.lidH))) }, ...(l.name ? [{ name: "Nome", color: p.textColor, mesh: solidMesh(k(flip(l.name, s.lidH))) }] : [])];
    const gap = 15;
    const lidModel = moveModel({ name: "Tampa", parts: lidParts }, s.outerX / 2 + gap + (s.outerX + 2 * (FIT + WALL)) / 2, 0);
    const models: Model[] = [boxModel, lidModel];
    if (p.layout === "assembled") {
      const up = (x: Solid) => k(x.translate([0, 0, s.boxH - OVERLAP]));
      const closed: Model = {
        name: "Fechada",
        previewOnly: true,
        parts: [
          { name: "Caixa", color: p.bodyColor, mesh: solidMesh(body) },
          { name: "Tampa", color: p.lidColor, mesh: solidMesh(up(l.body)) },
          ...(l.name ? [{ name: "Nome", color: p.textColor, mesh: solidMesh(up(l.name)) }] : []),
        ],
      };
      const printed = meshBounds(models.flatMap((m) => m.parts.map((x) => x.mesh)));
      const shown = meshBounds(closed.parts.map((x) => x.mesh));
      if (printed && shown) models.push(moveModel(closed, printed.max[0] + PREVIEW_GAP - shown.min[0], 0));
    }
    return { models };
  });
}
