import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Mesh, Part } from "../types";
import { artParts, boxOf, offsetOf, placeIn, roundedRect, slab, solidMesh, type ElementBox, type ModelCtx, type ModelOutput } from "./common";

/*
 * Caixa com tampa (#94): medidas de dentro, divisórias em grade e dois tipos de tampa.
 * Encaixe: placa com um lábio que entra na boca da caixa com folga; imprime de face para baixo.
 * Deslizante: placa com bordas a 45° que corre num trilho em cauda de andorinha no topo das paredes; entra pela frente.
 */
export type LidBoxParams = {
  innerW: number;
  innerD: number;
  innerH: number;
  wall: number;
  floor: number;
  radius: number; // canto de fora
  dividersX: number; // compartimentos na largura (1 = sem divisória)
  dividersY: number;
  lid: "snap" | "slide";
  clearance: number;
  lidT: number;
  text: string;
  textMode: "raised" | "inlay" | "engraved";
  textSize: number;
  relief: number;
  artSize: number;
  boxColor: string;
  lidColor: string;
  decorColor: string;
};

export const DEFAULT_LID_BOX: LidBoxParams = {
  innerW: 80,
  innerD: 50,
  innerH: 30,
  wall: 2,
  floor: 1.5,
  radius: 4,
  dividersX: 1,
  dividersY: 1,
  lid: "snap",
  clearance: 0.3,
  lidT: 2,
  text: "Tesouros",
  textMode: "inlay",
  textSize: 10,
  relief: 0.6,
  artSize: 25,
  boxColor: "#2563eb",
  lidColor: "#2563eb",
  decorColor: "#f8f8f6",
};

export const INLAY = 0.6; // embutido: primeiras camadas em 2 cores, rente à face
const DIV_T = 1.2;
const LIP_T = 1.2;
const LIP_MAX = 6;
const MIN_BACK_WALL = 0.8; // parede que sobra atrás do trilho
const MARGIN = 4; // folga entre a arte e a borda da tampa
const GAP = 10; // entre a caixa e a tampa na mesa
const EPS = 0.01;

type K = <D extends { delete(): void }>(o: D) => D;

const rect = (M: ManifoldToplevel, x0: number, y0: number, x1: number, y1: number): CS => M.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);
const at = (k: K, cs: CS, h: number, z: number): Solid => k(k(cs.extrude(h)).translate([0, 0, z]));

const outer = (p: LidBoxParams) => [p.innerW + 2 * p.wall, p.innerD + 2 * p.wall] as const;
const innerR = (p: LidBoxParams) => Math.max(0.5, p.radius - p.wall);
const lipH = (p: LidBoxParams) => Math.min(LIP_MAX, p.innerH * 0.4);
const groove = (p: LidBoxParams) => Math.min(Math.max(0.4, p.wall - MIN_BACK_WALL), p.lidT);
const topZ = (p: LidBoxParams) => p.floor + p.innerH + p.lidT;

/** Trilho/tampa deslizante: seção trapezoidal (45°) de z0 a z0+lidT, recuada `inset` na horizontal. Frente em `front`. */
function dovetail(M: ManifoldToplevel, k: K, p: LidBoxParams, z0: number, inset: number, front: number): Solid {
  const g = groove(p);
  const hw = p.innerW / 2 + g - inset, back = p.innerD / 2 + g - inset;
  const bottom = at(k, k(rect(M, -hw, front, hw, back)), EPS, z0);
  const top = at(k, k(rect(M, -hw + p.lidT, front, hw - p.lidT, back - p.lidT)), EPS, z0 + p.lidT - EPS);
  return k(M.Manifold.hull([bottom, top]));
}

function dividers(M: ManifoldToplevel, k: K, p: LidBoxParams, h: number): Solid | null {
  const bars: CS[] = [];
  for (let i = 1; i < p.dividersX; i++) bars.push(k(rect(M, -p.innerW / 2 + (i * p.innerW) / p.dividersX - DIV_T / 2, -p.innerD / 2, -p.innerW / 2 + (i * p.innerW) / p.dividersX + DIV_T / 2, p.innerD / 2)));
  for (let j = 1; j < p.dividersY; j++) bars.push(k(rect(M, -p.innerW / 2, -p.innerD / 2 + (j * p.innerD) / p.dividersY - DIV_T / 2, p.innerW / 2, -p.innerD / 2 + (j * p.innerD) / p.dividersY + DIV_T / 2)));
  return bars.length ? at(k, k(M.CrossSection.union(bars)), h, p.floor - EPS) : null;
}

/** Caixa e tampa na posição fechada (tampa em cima, pronta para uso). Quem chama dá delete(). */
export function lidBoxSolids(M: ManifoldToplevel, p: LidBoxParams): { box: Solid; lid: Solid } {
  const [W, D] = outer(p);
  const H = p.floor + p.innerH;
  const c = p.clearance;
  return scoped((k) => {
    const snap = p.lid === "snap";
    const shell = at(k, k(roundedRect(M, W, D, p.radius)), snap ? H : topZ(p), 0);
    const cavity = at(k, k(roundedRect(M, p.innerW, p.innerD, innerR(p))), topZ(p), p.floor);
    let box = k(shell.subtract(cavity));
    const divs = dividers(M, k, p, snap ? p.innerH - lipH(p) - c : p.innerH);
    if (divs) box = k(box.add(divs));
    if (snap) {
      const plate = at(k, k(roundedRect(M, W, D, p.radius)), p.lidT, H);
      const lipOut = k(roundedRect(M, p.innerW - 2 * c, p.innerD - 2 * c, Math.max(0.1, innerR(p) - c)));
      const ring = k(lipOut.subtract(k(lipOut.offset(-LIP_T, "Round"))));
      const lid = plate.add(at(k, ring, lipH(p) + EPS, H - lipH(p)));
      return { box: box.translate([0, 0, 0]), lid };
    }
    const slot = dovetail(M, k, p, H, 0, -D / 2 - 1);
    const above = at(k, k(rect(M, -p.innerW / 2 - groove(p) + p.lidT, -D / 2 - 1, p.innerW / 2 + groove(p) - p.lidT, p.innerD / 2 + groove(p) - p.lidT)), 1, topZ(p) - EPS);
    const lid = dovetail(M, k, p, H, c * Math.SQRT2, -D / 2).translate([0, 0, 0]);
    return { box: box.subtract(k(slot.add(above))), lid };
  });
}

/** Tampa de encaixe vai de face para baixo: gira 180° no eixo Y (x → −x, z → topo − z). */
function flipMesh(m: Mesh, top: number): Mesh {
  const q = m.positions.slice();
  for (let i = 0; i < q.length; i += 3) {
    q[i] = -q[i];
    q[i + 2] = top - q[i + 2];
  }
  return { positions: q, indices: m.indices };
}

type Decor = { all: CS; text: CS | null; art: CS | null; elements: ElementBox[] };

/** Texto e desenho centrados na face de cima da tampa (coordenadas de uso). Quem chama dá delete() nas regiões. */
function decor(ctx: ModelCtx, p: LidBoxParams, mirrored: boolean): Decor | null {
  const { M } = ctx;
  return scoped((k) => {
    const areaW = p.innerW - 2 * MARGIN, areaH = p.innerD - 2 * MARGIN;
    const area: [number, number, number, number] = [-areaW / 2, -areaH / 2, areaW / 2, areaH / 2];
    const raw = p.text.trim() ? ctx.text(p.text, p.textSize) : null;
    const text = raw && k(raw);
    const art = ctx.art && !ctx.art.isEmpty() ? k(fitInto(ctx.art, areaW, Math.min(p.artSize, areaH - (text ? p.textSize + 2 : 0)), 0)) : null;
    const pieces: { id: string; label: string; cs: CS; ay: "top" | "bottom" | "middle" }[] = [];
    if (art) pieces.push({ id: "art", label: "Desenho", cs: art, ay: text ? "top" : "middle" });
    if (text) pieces.push({ id: "text", label: "Texto", cs: text, ay: art ? "bottom" : "middle" });
    if (!pieces.length) return null;
    const placed = pieces.map((e) => {
      const [bx, by] = placeIn({ ...ctx, offset: undefined }, e.id, boxOf(e.cs), area, "center", e.ay);
      const [ox, oy] = offsetOf(ctx, e.id); // o gizmo mostra a tampa como vai na mesa: na de encaixe, x vem espelhado
      return { ...e, cs: k(e.cs.translate([bx + (mirrored ? -ox : ox), by + oy])) };
    });
    const elements = placed.map((e) => {
      const [x0, y0, x1, y1] = boxOf(e.cs);
      return { id: e.id, label: e.label, box: (mirrored ? [-x1, y0, -x0, y1] : [x0, y0, x1, y1]) as ElementBox["box"] };
    });
    const copy = (id: string) => placed.find((e) => e.id === id)?.cs.translate([0, 0]) ?? null;
    return { all: M.CrossSection.union(placed.map((e) => e.cs)), text: copy("text"), art: copy("art"), elements };
  });
}

export function buildLidBox(ctx: ModelCtx, p: LidBoxParams): ModelOutput {
  const { M } = ctx;
  const snap = p.lid === "snap";
  const [W, D] = outer(p);
  const H = p.floor + p.innerH;
  const top = topZ(p);
  const mode = snap && p.textMode === "raised" ? "inlay" : p.textMode;
  const warnings: string[] = [];
  if (snap && p.textMode === "raised" && p.text.trim()) warnings.push("Na tampa de encaixe a face de fora fica na mesa: o texto sai embutido, rente e em 2 cores.");
  if (Math.max(W, D) > bedMm()) warnings.push(`A caixa tem ${Math.round(Math.max(W, D))} mm e passa da mesa de ${bedMm()} mm.`);
  if (!snap && p.wall - MIN_BACK_WALL < 0.8) warnings.push("Parede fina para o trilho: use 2 mm ou mais para a tampa deslizante firmar.");
  return scoped((k) => {
    const { box, lid: rawLid } = lidBoxSolids(M, p);
    k(box);
    let lid = k(rawLid);
    const d = decor(ctx, p, snap);
    const extra: Part[] = [];
    if (d) {
      for (const cs of [d.all, d.text, d.art]) if (cs) k(cs);
      const [h, z] = mode === "inlay" ? [INLAY, top - INLAY] : mode === "raised" ? [p.relief, top] : [p.relief, top - p.relief];
      if (mode !== "raised") lid = k(lid.subtract(at(k, d.all, h + EPS, z)));
      if (mode !== "engraved") {
        if (d.text) extra.push({ name: "Texto", color: p.decorColor, mesh: slab(d.text, h, z) });
        if (d.art) extra.push(...artParts(ctx, d.art, p.decorColor, "Desenho", h, z));
      }
    }
    const dx = W + GAP;
    // deslizante: base da tampa na mesa; encaixe: virada, face de fora na mesa
    const place = (m: Mesh): Mesh => {
      const q = snap ? flipMesh(m, top) : m;
      const out = q.positions.slice();
      for (let i = 0; i < out.length; i += 3) {
        out[i] += dx;
        if (!snap) out[i + 2] -= H;
      }
      return { positions: out, indices: q.indices };
    };
    const lidParts: Part[] = [{ name: "Tampa", color: p.lidColor, mesh: place(solidMesh(lid)) }, ...extra.map((x) => ({ ...x, mesh: place(x.mesh) }))];
    const elements = d?.elements.map((e) => ({ ...e, box: [e.box[0] + dx, e.box[1], e.box[2] + dx, e.box[3]] as ElementBox["box"] }));
    return {
      models: [
        { name: "Caixa", parts: [{ name: "Caixa", color: p.boxColor, mesh: solidMesh(box) }] },
        { name: "Tampa", parts: lidParts },
      ],
      warnings,
      elements,
    };
  });
}
