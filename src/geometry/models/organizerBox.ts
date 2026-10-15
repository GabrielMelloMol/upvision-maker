import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { scoped } from "../shape2d";
import type { Mesh, Model, Part } from "../types";
import { artParts, boxOf, MissingInput, moveMesh, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput, type ModelView } from "./common";
import { buildLidBox, dividerHeight, DEFAULT_LID_BOX, INLAY, lidDecor, lidPose, type LidBoxParams } from "./lidBox";
import { buildHinge, HINGE, LATCH, latchMinBody } from "./organizer/hinge";
import { cellsOf, layoutProblem, smallestSide, stripsOf } from "./organizer/layout";
import { dimsOf, type Dims, type OrganizerParams } from "./organizer/params";

/*
 * Caixa organizadora (#204): nichos de vários jeitos (organizer/layout.ts), tampa de dobradiça com pino impresso e trava,
 * de encaixe, deslizante ou sem tampa, puxador, nome na tampa ou na lateral, empilhável e porta-etiqueta.
 * Tampa de encaixe e deslizante reaproveitam a Caixa com tampa (lidBox.ts); a de dobradiça é daqui (organizer/hinge.ts).
 * A saída leva as peças para imprimir (`models`) e as 4 vistas da prévia (`views`): compartimentos, aberta, fechada e peças.
 */
const GAP = 10;
const EPS = 0.01;
const HANDLE = { w: 24, d: 10, h: 5 };
const LABEL_SLOT = { w: 32, h: 17, depth: 0.8 };
const STACK = { ring: 1.6, h: 1.2, clearance: 0.3, inset: 0.8 };
export const OPEN_DEG = HINGE.stopDeg;
const SIDE_MARGIN = 4;

type K = <D extends { delete(): void }>(o: D) => D;
type Face = "front" | "right";

const solidOf = (M: ManifoldToplevel, m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const moveParts = (parts: Part[], dx: number, dy: number, dz: number): Part[] => parts.map((q) => ({ ...q, mesh: moveMesh(q.mesh, dx, dy, dz) }));

/** Gira uma malha em torno do eixo paralelo a x que passa por (y0, z0): `deg` > 0 levanta a frente (abre a tampa por trás). */
export function turnMesh(m: Mesh, y0: number, z0: number, deg: number): Mesh {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  const p = m.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    const dy = p[i + 1] - y0, dz = p[i + 2] - z0;
    p[i + 1] = y0 + dy * c + dz * s;
    p[i + 2] = z0 - dy * s + dz * c;
  }
  return { positions: p, indices: m.indices };
}
const turnParts = (parts: Part[], y0: number, z0: number, deg: number): Part[] => parts.map((q) => ({ ...q, mesh: turnMesh(q.mesh, y0, z0, deg) }));

/** Região 2D dos nichos (cantos arredondados), no centro do vão. */
function cellsRegion(M: ManifoldToplevel, k: K, p: OrganizerParams, d: Dims): CS {
  const rows = cellsOf(stripsOf(p), d.innerW, d.innerD, p.divider);
  const r = Math.max(0, Math.min(p.cellRadius, smallestSide(rows) / 2 - 0.05));
  const cs = rows.flat().map((c) => k(k(roundedRect(M, c.x1 - c.x0, c.y1 - c.y0, r)).translate([(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2])));
  return k(M.CrossSection.union(cs));
}

const at = (k: K, cs: CS, h: number, z: number): Solid => k(k(cs.extrude(h)).translate([0, 0, z]));

/** Qual face leva o nome: a lateral maior ou a menor (a da frente tem a trava e o porta-etiqueta). */
export function faceOf(p: OrganizerParams, d: Dims): Face {
  const longFront = d.outerW >= d.outerD;
  return (p.labelPlace === "sideLong") === longFront ? "front" : "right";
}

type SideLabel = { cut: Solid | null; part: Mesh | null; warnings: string[] };

/** Nome na lateral: embutido, em relevo ou gravado, centrado no espaço livre da parede. */
function sideLabel(ctx: ModelCtx, k: K, p: OrganizerParams, d: Dims, face: Face, zLow: number, zHigh: number): SideLabel {
  const warnings: string[] = [];
  const raw = ctx.text(p.text, p.textSize);
  if (!raw) return { cut: null, part: null, warnings };
  k(raw);
  const faceLen = face === "front" ? d.outerW : d.outerD;
  const maxW = faceLen - 2 * p.outerRadius - 2 * SIDE_MARGIN;
  const room = zHigh - zLow;
  if (room < 5) return { cut: null, part: null, warnings: ["A lateral não tem altura para o nome (a trava e a base ocupam a parede): use o nome na tampa ou na outra lateral."] };
  const b = boxOf(raw);
  const w0 = b[2] - b[0], h0 = b[3] - b[1];
  const scale = Math.min(1, maxW / w0, (room - 1) / h0);
  if (scale < 0.999) warnings.push("O nome não cabe na lateral nesse tamanho: reduzi para caber.");
  const cs = k(k(raw.translate([-(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2])).scale(scale));
  const t = p.textMode === "raised" ? p.relief : p.textMode === "inlay" ? INLAY : p.relief;
  const L = face === "front" ? d.outerD / 2 : d.outerW / 2;
  // sólido do texto olhando para a frente (−y); a lateral direita é o mesmo girado 90°
  const front = (depth: number, outward: boolean): Solid => {
    const s = k(k(cs.extrude(depth + EPS)).rotate([90, 0, 0])); // y de −(depth+EPS) a 0
    return k(s.translate([0, outward ? -L + EPS : -L + depth, (zLow + zHigh) / 2]));
  };
  const turn = (s: Solid): Solid => (face === "front" ? s : k(s.rotate([0, 0, 90])));
  const solid = turn(front(t, p.textMode === "raised"));
  return { cut: p.textMode === "raised" ? null : solid, part: p.textMode === "engraved" ? null : slab2(solid), warnings };
}
const slab2 = (s: Solid): Mesh => toMesh(s);

function handleSolid(M: ManifoldToplevel, k: K): Solid {
  const base = k(k(roundedRect(M, HANDLE.w, HANDLE.d, 4)).extrude(1.2));
  const top = k(k(k(roundedRect(M, HANDLE.w - 7, HANDLE.d - 4, 2.5)).extrude(0.01)).translate([0, 0, HANDLE.h - 0.01]));
  return k(M.Manifold.hull([base, top]));
}

/** Anel de empilhar (na tampa) e o rebaixo correspondente (no fundo da caixa). */
function stackRing(M: ManifoldToplevel, k: K, p: OrganizerParams, d: Dims, grow: number): CS {
  const s = p.wall + STACK.inset - grow;
  const out = k(roundedRect(M, d.outerW - 2 * s, d.outerD - 2 * s, Math.max(0.5, p.outerRadius - s)));
  return k(out.subtract(k(out.offset(-(STACK.ring + 2 * grow), "Round", 2, 32))));
}
const grooveDepth = (p: OrganizerParams) => Math.min(1.4, p.floor - 0.8);

function labelSlotCut(M: ManifoldToplevel, k: K, d: Dims, zc: number): Solid {
  const cs = k(roundedRect(M, LABEL_SLOT.w, LABEL_SLOT.h, 1.5));
  const s = k(k(cs.extrude(LABEL_SLOT.depth + 0.5)).rotate([90, 0, 0])); // y de −depth−0,5 a 0
  return k(s.translate([0, -d.outerD / 2 + LABEL_SLOT.depth, zc]));
}

/** Texto e desenho na tampa: embutido, em relevo ou gravado (como na Caixa com tampa). Devolve a tampa já cortada e as partes extras. */
function decorLid(ctx: ModelCtx, k: K, p: OrganizerParams, d: Dims, lid: Solid, topZ: number, mirrored: boolean): { lid: Solid; extra: Part[]; elements: ModelOutput["elements"] } {
  const text = p.labelPlace === "lid" ? p.text : "";
  const dec = lidDecor(ctx, { innerW: d.innerW, innerD: d.innerD, text, textSize: p.textSize, artSize: p.artSize }, mirrored);
  if (!dec) return { lid, extra: [], elements: [] };
  for (const cs of [dec.all, dec.text, dec.art]) if (cs) k(cs);
  const mode = p.textMode;
  const [h, z] = mode === "inlay" ? [INLAY, topZ - INLAY] : mode === "raised" ? [p.relief, topZ] : [p.relief, topZ - p.relief];
  const out = mode !== "raised" ? k(lid.subtract(at(k, dec.all, h + EPS, z))) : lid;
  const extra: Part[] = [];
  if (mode !== "engraved") {
    if (dec.text) extra.push({ name: "Texto", color: p.decorColor, mesh: slab(dec.text, h, z) });
    if (dec.art) extra.push(...artParts(ctx, dec.art, p.decorColor, "Desenho", h, z));
  }
  return { lid: out, extra, elements: dec.elements };
}

export function buildOrganizerBox(ctx: ModelCtx, p: OrganizerParams): ModelOutput {
  const d = dimsOf(p);
  const problem = layoutProblem(p, d.innerW, d.innerD, p.divider);
  if (problem) throw new MissingInput(problem);
  if (p.lid === "hinge" && d.bodyH < latchMinBody(p.lidT, p.floor)) throw new MissingInput(`Para a dobradiça com trava a caixa precisa de pelo menos ${Math.ceil(latchMinBody(p.lidT, p.floor) + p.lidT)} mm de altura total.`);
  const warnings: string[] = [];
  if (Math.max(d.outerW, d.outerD) > bedMm()) warnings.push(`A caixa tem ${Math.round(Math.max(d.outerW, d.outerD))} mm e passa da mesa de ${bedMm()} mm: diminua ou imprima numa impressora maior.`);
  if (p.wall < 1.6) warnings.push("Parede abaixo de 1,6 mm: a caixa fica frágil e a tampa pode quebrar.");
  if (p.stackable && p.lid === "snap") warnings.push("Empilhável não vale para a tampa de encaixe (ela imprime de cara para baixo): use dobradiça, deslizante ou sem tampa.");
  return scoped((k) => (p.lid === "snap" || p.lid === "slide" ? viaLidBox(ctx, k, p, d, warnings) : own(ctx, k, p, d, warnings)));
}

/** O que a lateral e o porta-etiqueta mexem na caixa (a trava da frente deixa só a faixa de baixo livre). */
function applyBoxExtras(ctx: ModelCtx, k: K, p: OrganizerParams, d: Dims, box: Solid, zLow: number, zHigh: number): { box: Solid; text: Mesh | null; warnings: string[] } {
  const warnings: string[] = [];
  let out = box;
  const slotFront = p.labelSlot;
  if (slotFront) out = k(out.subtract(labelSlotCut(ctx.M, k, d, (zLow + zHigh) / 2)));
  let text: Mesh | null = null;
  if (p.labelPlace === "sideLong" || p.labelPlace === "sideShort" || (p.labelPlace === "lid" && p.lid === "none")) {
    let face = faceOf({ ...p, labelPlace: p.labelPlace === "lid" ? "sideLong" : p.labelPlace }, d);
    if (slotFront && face === "front") {
      face = "right";
      warnings.push("O porta-etiqueta ocupa a frente: o nome foi para a outra lateral.");
    }
    const [fLow, fHigh] = face === "front" ? [zLow, zHigh] : [p.floor + 1.5, d.bodyH - 1.5]; // só a frente tem a trava
    const lab = sideLabel(ctx, k, p, d, face, fLow, fHigh);
    warnings.push(...lab.warnings);
    if (lab.cut) out = k(out.subtract(lab.cut));
    text = lab.part;
  }
  if (p.stackable && p.lid !== "snap") {
    const depth = grooveDepth(p);
    out = k(out.subtract(at(k, stackRing(ctx.M, k, p, d, -STACK.clearance), depth, -EPS)));
  }
  return { box: out, text, warnings };
}

/** Faixa da parede da frente que a trava deixa livre (acima dela só há a lingueta). */
const freeBand = (p: OrganizerParams, d: Dims): [number, number] => (p.lid === "hinge" ? [p.floor + 1.5, Math.max(p.floor + 2, d.bodyH - LATCH.ledgeFrom) - 1] : [p.floor + 1.5, d.bodyH - 1.5]);

function viaLidBox(ctx: ModelCtx, k: K, p: OrganizerParams, d: Dims, warnings: string[]): ModelOutput {
  const { M } = ctx;
  const lb: LidBoxParams = {
    ...DEFAULT_LID_BOX,
    innerW: d.innerW, innerD: d.innerD, innerH: d.depth, wall: p.wall, floor: p.floor, radius: p.outerRadius,
    lid: p.lid as "snap" | "slide", clearance: 0.3, lidT: p.lidT,
    text: p.labelPlace === "lid" ? p.text : "", textMode: p.textMode, textSize: p.textSize, relief: p.relief, artSize: p.artSize,
    boxColor: p.boxColor, lidColor: p.lidColor, decorColor: p.decorColor,
  };
  const out = buildLidBox(ctx, lb);
  const lidModel = out.models.find((m) => m.name === "Tampa")!;
  const boxModel = out.models.find((m) => m.name === "Caixa")!;
  // a caixa da Caixa com tampa vem sem as divisórias em faixas: soma a trama dos nichos e os extras
  const web = k(k(k(roundedRect(M, d.innerW, d.innerD, Math.max(0.5, p.outerRadius - p.wall))).subtract(cellsRegion(M, k, p, d))).extrude(dividerHeight(lb) + EPS));
  let box = k(k(solidOf(M, boxModel.parts[0].mesh)).add(k(web.translate([0, 0, p.floor - EPS]))));
  const [zLow, zHigh] = freeBand(p, d);
  const ex = applyBoxExtras(ctx, k, p, d, box, zLow, zHigh);
  box = ex.box;
  warnings.push(...(out.warnings ?? []), ...ex.warnings);
  const boxParts: Part[] = [{ name: "Caixa", color: p.boxColor, mesh: solidMesh(box) }, ...(ex.text ? [{ name: "Nome", color: p.decorColor, mesh: ex.text }] : [])];
  const pose = lidPose(lb);
  // anel de empilhar na tampa deslizante (a de encaixe imprime virada, com a face de cima na mesa)
  const ring = p.stackable && p.lid === "slide" ? k(at(k, stackRing(M, k, p, d, 0), STACK.h + EPS, d.totalH - EPS).translate([pose.dx, 0, -(p.floor + d.depth)])) : null;
  const printLid: Part[] = lidModel.parts.map((q, i) => (i === 0 && ring ? { ...q, mesh: solidMesh(k(k(solidOf(M, q.mesh)).add(ring))) } : q));
  const lidClosed: Part[] = printLid.map((q) => ({ ...q, mesh: pose.toClosed(q.mesh) }));
  const handle = p.handle ? handlePieces(M, k, p, d) : null;
  const models: Model[] = [{ name: "Tampa", parts: printLid }, { name: "Caixa", parts: boxParts }, ...(handle ? [handle.print] : [])];
  const away = p.lid === "snap" ? (parts: Part[]) => moveParts(parts, 0, 0, d.totalH * 0.7 + 12) : (parts: Part[]) => moveParts(parts, 0, -d.outerD * 0.6, 0);
  const views = makeViews(p, boxParts, lidClosed, [], handle?.closed ?? null, away, models);
  const elements = out.elements?.map((e) => ({ ...e }));
  return { models, warnings: [...new Set(warnings)], elements, mirrorFace: out.mirrorFace, views };
}

function handlePieces(M: ManifoldToplevel, k: K, p: OrganizerParams, d: Dims): { print: Model; closed: Part[] } {
  const h = handleSolid(M, k);
  const mesh = solidMesh(h);
  const part: Part = { name: "Puxador", color: p.lidColor, mesh };
  return { print: { name: "Puxador", parts: moveParts([part], 2 * d.outerW + GAP, 0, 0) }, closed: moveParts([part], 0, -d.outerD / 2 + HANDLE.d / 2 + 6, d.totalH) };
}

function own(ctx: ModelCtx, k: K, p: OrganizerParams, d: Dims, warnings: string[]): ModelOutput {
  const { M } = ctx;
  const hinge = p.lid === "hinge";
  const Hb = d.bodyH;
  const shell = at(k, k(roundedRect(M, d.outerW, d.outerD, p.outerRadius)), Hb, 0);
  let box = k(shell.subtract(at(k, cellsRegion(M, k, p, d), Hb - p.floor + 1, p.floor)));
  const geo = { W: d.outerW, D: d.outerD, Hb, lidT: p.lidT, floor: p.floor, outerRadius: p.outerRadius, latchClearance: p.latchClearance };
  const hg = hinge ? buildHinge(M, k, geo) : null;
  if (hg) box = k(box.add(hg.boxAdd));
  const [zLow, zHigh] = freeBand(p, d);
  const ex = applyBoxExtras(ctx, k, p, d, box, zLow, zHigh);
  box = ex.box;
  warnings.push(...ex.warnings);
  const boxParts: Part[] = [{ name: "Caixa", color: p.boxColor, mesh: solidMesh(box) }, ...(ex.text ? [{ name: "Nome", color: p.decorColor, mesh: ex.text }] : [])];
  if (!hg) return { models: [{ name: "Caixa", parts: boxParts }], warnings: [...new Set(warnings)], views: makeViews(p, boxParts, null, [], null, (x) => x, [{ name: "Caixa", parts: boxParts }]) };

  const top = Hb + p.lidT;
  let lid = at(k, k(roundedRect(M, d.outerW, d.outerD, p.outerRadius)), p.lidT, Hb);
  lid = k(lid.subtract(hg.lidTrim));
  // nós e pescoço da dobradiça numa parte à parte (mesma cor): assim a "peça principal" da Vista de cima e das camadas livres é a placa da tampa
  const hingePart = k(hg.lidAdd.subtract(lid));
  if (p.stackable) lid = k(lid.add(at(k, stackRing(M, k, p, d, 0), STACK.h + EPS, top - EPS)));
  const dec = decorLid(ctx, k, p, d, lid, top, false);
  const lidParts: Part[] = [{ name: "Tampa", color: p.lidColor, mesh: solidMesh(dec.lid) }, { name: "Dobradiça", color: p.lidColor, mesh: solidMesh(hingePart) }, ...dec.extra];
  const pins: Part[][] = hg.pins.map((s) => [{ name: "Pino", color: p.lidColor, mesh: solidMesh(s) }]);
  const handle = p.handle ? handlePieces(M, k, p, d) : null;
  const dx = d.outerW + GAP;
  const printLid = moveParts(lidParts, dx, 0, -Hb);
  // pinos deitados na mesa, atrás da tampa; o eixo de cada pino vai para y = −(raio da cabeça)
  const printPins: Model[] = pins.map((pp, i) => ({ name: `Pino ${i + 1}`, parts: moveParts(pp, 0, -hg.axis.y - 12 - i * 8, -hg.axis.z + HINGE.headR) }));
  const models: Model[] = [{ name: "Tampa", parts: printLid }, { name: "Caixa", parts: boxParts }, ...printPins, ...(handle ? [handle.print] : [])];
  const open = (parts: Part[]) => turnParts(parts, hg.axis.y, hg.axis.z, OPEN_DEG);
  const views = makeViews(p, boxParts, lidParts, pins.flat(), handle?.closed ?? null, open, models);
  const elements = dec.elements?.map((e) => ({ ...e, box: [e.box[0] + dx, e.box[1], e.box[2] + dx, e.box[3]] as [number, number, number, number] }));
  return { models, warnings: [...new Set(warnings)], elements, mirrorFace: false, views };
}

/** As 4 vistas da prévia: compartimentos (sem tampa), aberta, fechada e peças na mesa (o que vai para o arquivo). */
function makeViews(p: OrganizerParams, box: Part[], lid: Part[] | null, pins: Part[], handle: Part[] | null, away: (parts: Part[]) => Part[], print: Model[]): ModelView[] {
  const closedAll = [...box, ...(lid ?? []), ...pins, ...(handle ?? [])];
  const m = (name: string, parts: Part[]): Model[] => [{ name, parts }];
  const views: ModelView[] = [{ id: "compartments", label: "Compartimentos", models: m("Caixa", box), note: "Sem a tampa, para ver os nichos." }];
  if (lid) {
    const lifted = away([...lid, ...(handle ?? [])]);
    views.push(
      { id: "open", label: "Tampa aberta", models: m("Caixa aberta", [...box, ...pins, ...lifted]), note: p.lid === "hinge" ? "A tampa gira no pino e para sozinha no batente, a cerca de 100°." : p.lid === "slide" ? "A tampa corre para a frente no trilho." : "A tampa sai levantando." },
      { id: "closed", label: "Fechada", models: m("Caixa fechada", closedAll) },
    );
  }
  views.push({ id: "pieces", label: "Peças na mesa", models: print, note: "Cada peça deitada como vai para a impressora; o 3MF sai assim." });
  return views;
}
