import type { ToolOutline } from "../../organizer/types";
import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { moveMesh, roundedRect, solidMesh, type ModelOutput } from "./common";
import { BED_MARGIN, DRAWER_GAP } from "./gridDrawer";
import { BIN_GAP, BIN_R, FOOT_H, GRID, gridFeet, HEIGHT_UNIT, type K } from "./gridfinity";
import { arrange } from "./toolFitLayout";

/**
 * Organizador pela foto (#169): contornos das ferramentas (mm) viram bolsões com folga num bloco, numa caixa
 * Gridfinity ou em bandejas que enchem a gaveta; a peça de teste é só o contorno com 2 mm para conferir o encaixe.
 */
export type ToolFitMode = "block" | "gridfinity" | "drawer" | "test";
export type ToolFitParams = {
  mode: ToolFitMode;
  /** Folga em volta da ferramenta (cada lado), mm. */
  clearance: number;
  /** Profundidade do bolsão. */
  depth: number;
  /** Fundo embaixo do bolsão. */
  floor: number;
  /** Parede entre bolsões e até a borda. */
  wall: number;
  /** Recorte redondo no meio de um lado para pegar a ferramenta com o dedo. */
  finger: boolean;
  drawerW: number;
  drawerD: number;
  color: string;
};
/** Folgas prontas da tela: nenhuma, pequena (A1 justa), média, grande. */
export const CLEARANCES = [
  ["none", "Nenhuma", 0],
  ["small", "Pequena", 0.3],
  ["medium", "Média", 0.6],
  ["large", "Grande", 1],
] as const;
export const DEFAULT_TOOL_FIT: ToolFitParams = { mode: "block", clearance: 0.3, depth: 12, floor: 2, wall: 3, finger: true, drawerW: 400, drawerD: 300, color: "#2563eb" };

const FINGER_R = 11; // um dedo de adulto com sobra
const TEST_H = 2;
const EPS = 0.01;
const BLOCK_R = 3;
const TRAY_SPACING = 10; // entre as bandejas no 3MF

type Pt = [number, number];
function validate(o: ToolOutline) {
  const ok = (pts: Pt[]) => pts.length >= 3 && pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!ok(o.points) || !(o.holes ?? []).every(ok)) throw new Error(`O contorno de "${o.label ?? o.id}" é inválido (precisa de 3 ou mais pontos em mm).`);
}

/** Bolsão de uma ferramenta já no lugar: contorno (com os furos virando pinos) crescido da folga. */
function pocketOf(M: ManifoldToplevel, k: K, o: ToolOutline, clearance: number, holes = true): CS {
  const cs = k(new M.CrossSection([o.points, ...(holes ? o.holes ?? [] : [])], "EvenOdd"));
  return clearance > 0 ? k(cs.offset(clearance, "Round")) : cs;
}

/** Círculo para o dedo centrado na borda de cima do bolsão, no meio da ferramenta. */
function fingerOf(M: ManifoldToplevel, k: K, pocket: CS): CS {
  const b = pocket.bounds();
  const cx = (b.min[0] + b.max[0]) / 2;
  const strip = k(k(M.CrossSection.square([1, b.max[1] - b.min[1] + 2])).translate([cx - 0.5, b.min[1] - 1]));
  const cut = k(pocket.intersect(strip));
  const top = cut.isEmpty() ? b.max[1] : cut.bounds().max[1];
  return k(k(M.CrossSection.circle(FINGER_R, 48)).translate([cx, top]));
}

/** Tudo o que sai do topo: bolsões + recortes, em coordenadas da área arrumada. */
function cutsOf(M: ManifoldToplevel, k: K, placed: ToolOutline[], p: ToolFitParams): CS {
  const shapes = placed.flatMap((o) => {
    const pocket = pocketOf(M, k, o, p.clearance);
    return p.finger ? [pocket, fingerOf(M, k, pocket)] : [pocket];
  });
  return k(M.CrossSection.union(shapes));
}

/** Corpo maciço de `z0` até `top` com os bolsões descendo `depth` do topo. */
function carve(k: K, body: CS, cuts: CS, z0: number, top: number, depth: number): Solid {
  const block = k(k(body.extrude(top - z0)).translate([0, 0, z0]));
  return k(block.subtract(k(k(cuts.extrude(depth + EPS)).translate([0, 0, top - depth]))));
}

const arrangeFor = (tools: ToolOutline[], p: ToolFitParams, width: number, height?: number) =>
  arrange(tools, { width, height, inflate: p.clearance, gap: p.wall, reserveTop: p.finger ? FINGER_R : 0 });
const usableBed = () => bedMm() - 2 * BED_MARGIN;
const missingNote = (ids: string[], tools: ToolOutline[], where: string) =>
  ids.length ? [`${ids.map((id) => tools.find((t) => t.id === id)?.label ?? id).join(", ")} não ${ids.length > 1 ? "couberam" : "coube"} ${where}.`] : [];
/** Lados das bandejas num eixo: inteiras do tamanho da mesa e a última com o que sobra. */
function traySizes(total: number, max: number): number[] {
  const n = Math.ceil(total / max - 1e-9);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? max : total - (n - 1) * max));
}

function buildBlock(M: ManifoldToplevel, k: K, tools: ToolOutline[], p: ToolFitParams, name = "Bloco", w = usableBed(), d?: number): { model: Model | null; missing: string[] } {
  const r = arrangeFor(tools, p, w, d);
  if (!r.placed.length) return { model: null, missing: r.missing };
  const [bw, bd] = r.size;
  const body = k(k(roundedRect(M, bw, bd, BLOCK_R)).translate([bw / 2, bd / 2]));
  const s = carve(k, body, cutsOf(M, k, r.placed, p), 0, p.floor + p.depth, p.depth);
  return { model: { name, parts: [{ name, color: p.color, mesh: solidMesh(k(s.translate([-bw / 2, -bd / 2, 0]))) }] }, missing: r.missing };
}

function buildGridfinity(M: ManifoldToplevel, k: K, tools: ToolOutline[], p: ToolFitParams): { model: Model | null; missing: string[]; note: string } {
  const r = arrangeFor(tools, p, usableBed());
  const nx = Math.max(1, Math.ceil((r.size[0] + BIN_GAP) / GRID)), ny = Math.max(1, Math.ceil((r.size[1] + BIN_GAP) / GRID));
  const W = nx * GRID - BIN_GAP, D = ny * GRID - BIN_GAP;
  const units = Math.ceil((FOOT_H + p.floor + p.depth) / HEIGHT_UNIT - 1e-9);
  const top = units * HEIGHT_UNIT;
  const body = k(roundedRect(M, W, D, BIN_R));
  // bolsões no centro da caixa
  const cuts = k(cutsOf(M, k, r.placed, p).translate([-r.size[0] / 2, -r.size[1] / 2]));
  const bin = k(gridFeet(M, k, nx, ny).add(carve(k, body, k(cuts.intersect(k(body.offset(-EPS)))), FOOT_H, top, p.depth)));
  return { model: { name: "Caixa Gridfinity", parts: [{ name: "Caixa Gridfinity", color: p.color, mesh: solidMesh(bin) }] }, missing: r.missing, note: `Caixa Gridfinity de ${nx}×${ny} casas e ${units} unidades de altura (${top} mm).` };
}

/** Gaveta dividida em bandejas que cabem na mesa; as ferramentas vão na primeira bandeja onde couberem. */
function buildDrawer(M: ManifoldToplevel, k: K, tools: ToolOutline[], p: ToolFitParams): { models: Model[]; missing: string[]; note: string } {
  const xs = traySizes(p.drawerW - DRAWER_GAP, usableBed()), ys = traySizes(p.drawerD - DRAWER_GAP, usableBed());
  const models: Model[] = [];
  const sizes: string[] = [];
  let left = tools;
  let y0 = 0;
  for (const td of ys) {
    let x0 = 0;
    for (const tw of xs) {
      const { model, missing } = left.length ? buildBlock(M, k, left, p, `Bandeja ${models.length + 1}`, tw, td) : { model: null, missing: [] };
      left = left.filter((t) => missing.includes(t.id));
      // bandeja na posição dela na gaveta, afastada das vizinhas no 3MF
      if (model) {
        models.push({ ...model, parts: model.parts.map((q) => ({ ...q, mesh: moveMesh(q.mesh, x0 + tw / 2, y0 + td / 2) })) });
        sizes.push(`${Math.floor(tw)} × ${Math.floor(td)}`);
      }
      x0 += tw + TRAY_SPACING;
    }
    y0 += td + TRAY_SPACING;
  }
  const free = xs.length * ys.length - models.length;
  const note = models.length
    ? `Gaveta de ${p.drawerW} × ${p.drawerD} mm: ${models.length} bandeja(s) (${sizes.join(", ")} mm)${free > 0 ? `; ${free} espaço(s) da gaveta ficam livres` : ""}.`
    : `Gaveta de ${p.drawerW} × ${p.drawerD} mm: nenhuma ferramenta cabe nela.`;
  return { models, missing: left.map((t) => t.id), note };
}

/** Peça de teste: anel do contorno com a folga, 2 mm de altura, uma por ferramenta. */
function buildTest(M: ManifoldToplevel, k: K, tools: ToolOutline[], p: ToolFitParams): Model[] {
  const r = arrange(tools, { width: usableBed(), inflate: p.clearance + p.wall, gap: 3 });
  return r.placed.map((o) => {
    const inside = pocketOf(M, k, o, p.clearance, false);
    const ring = k(k(inside.offset(p.wall, "Round")).subtract(inside));
    const name = `Teste: ${o.label ?? o.id}`;
    return { name, parts: [{ name, color: p.color, mesh: solidMesh(k(ring.extrude(TEST_H))) }] };
  });
}

export function buildToolFit(M: ManifoldToplevel, tools: ToolOutline[], p: ToolFitParams): ModelOutput {
  tools.forEach(validate);
  if (!tools.length) return { models: [], warnings: [] };
  return scoped((k) => {
    const warnings: string[] = [];
    if (p.clearance === 0) warnings.push("Sem folga: a ferramenta pode não entrar. Imprima a peça de teste antes.");
    if (p.mode === "test") return { models: buildTest(M, k, tools, p), warnings: [...warnings, "Encaixe a ferramenta no contorno: deve entrar sem forçar e não sair ao virar de cabeça para baixo. Frouxa: diminua a folga; não entra: aumente."] };
    const sunk = tools.filter((t) => t.heightMm !== undefined && t.heightMm < p.depth - 2);
    if (sunk.length && !p.finger) warnings.push(`${sunk.map((t) => t.label ?? t.id).join(", ")} fica(m) toda(s) dentro do bolsão: ligue o recorte para o dedo para tirar.`);
    if (p.mode === "gridfinity") {
      const g = buildGridfinity(M, k, tools, p);
      return { models: g.model ? [g.model] : [], warnings: [...warnings, g.note, ...missingNote(g.missing, tools, "na caixa")] };
    }
    if (p.mode === "drawer") {
      const d = buildDrawer(M, k, tools, p);
      return { models: d.models, warnings: [...warnings, d.note, ...missingNote(d.missing, tools, "na gaveta")] };
    }
    const b = buildBlock(M, k, tools, p);
    return { models: b.model ? [b.model] : [], warnings: [...warnings, ...missingNote(b.missing, tools, "no bloco (maior que a mesa)")] };
  });
}
