import type { Font } from "opentype.js";
import { AXES, AXIS_INDEX, FACE_DOWN, MAX_PARTS_PER_AXIS, planCuts, planeFrame, usable, type BedBox, type Vec3 } from "./bedCutPlan";
import { buildJoint, numberSpot, type JointKind, type Magnet } from "./bedCutJoints";
import type { ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { solidFromMesh } from "./cutSolid";
import { JobCancelled, type Hooks } from "./jobs";
import { scoped } from "./shape2d";
import { textToCrossSection } from "./text";
import type { Model, Part } from "./types";

/**
 * Cortar peça grande para a mesa (#218): divide um STL/3MF em pedaços iguais que cabem na mesa da impressora, com
 * encaixe (pino redondo ou quadrado, chave rabo de andorinha ou ímã) e o número de cada junta gravado nas duas faces.
 * Cada pedaço assenta na mesa pela face em que mais se apoia e todos saem arrumados em mesas.
 */
export type BedCutOptions = {
  bed: BedBox;
  /** Folga de segurança em volta, de cada lado (mm). */
  margin: number;
  /** Partes por eixo; null = o app escolhe (menos pedaços possível). */
  counts: Vec3 | null;
  joint: JointKind;
  /** Medida do pino ou da cintura da chave (mm); 0 = automática. */
  size: number;
  clearance: number;
  magnet: Magnet;
  numbers: boolean;
  /** Afastamento (mm) entre os pedaços na vista montada. */
  explode: number;
};
export const DEFAULT_BEDCUT: BedCutOptions = {
  bed: { x: 256, y: 256, z: 256 },
  margin: 4,
  counts: null,
  joint: "round",
  size: 0,
  clearance: 0.2,
  magnet: { d: 6, h: 2 },
  numbers: true,
  explode: 0,
};

export type BedCutInfo = { dims: Vec3; counts: Vec3; auto: boolean; fits: boolean; pieces: number; joints: number; plates: number };
export type BedCutResult = { models: Model[]; assembled: Model[]; warnings: string[]; info: BedCutInfo };

const NUMBER_MM = 4; // altura do número gravado
const ENGRAVE_MM = 0.4;
const MIN_PIECE_MM3 = 1;
const PLATE_GAP = 6;
const PIECE_COLOR = "#d4d4d8";
const KEY_COLOR = PIECE_COLOR; // mesma cor: uma cor só, sem AMS nem torre de purga
const ROOM = 0.4; // o furo ocupa no máximo 40% da espessura da peça ao longo do eixo

type Cell = { idx: Vec3; min: Vec3; max: Vec3; solid: Solid };
const joinKey = (i: Vec3) => i.join(",");

const label = (n: number) => `Peça ${n}`;

/** Parte de baixo e de cima do plano: caixas que cobrem tudo, para cortar sem tocar nos furos dos outros planos. */
function cellBoxes(M: ManifoldToplevel, lo: Vec3, hi: Vec3, bounds: [number[], number[], number[]], counts: Vec3): { idx: Vec3; min: Vec3; max: Vec3; box: Solid }[] {
  const out: { idx: Vec3; min: Vec3; max: Vec3; box: Solid }[] = [];
  const pad = 1;
  for (let i = 0; i < counts[0]; i++)
    for (let j = 0; j < counts[1]; j++)
      for (let k = 0; k < counts[2]; k++) {
        const idx: Vec3 = [i, j, k];
        const min = idx.map((v, a) => bounds[a][v]) as Vec3;
        const max = idx.map((v, a) => bounds[a][v + 1]) as Vec3;
        const lo2 = min.map((v, a) => (idx[a] === 0 ? lo[a] - pad : v)) as Vec3;
        const hi2 = max.map((v, a) => (idx[a] === counts[a] - 1 ? hi[a] + pad : v)) as Vec3;
        out.push({ idx, min, max, box: M.Manifold.cube(hi2.map((v, a) => v - lo2[a]) as Vec3, false).translate(lo2) });
      }
  return out;
}

export function bedCut(M: ManifoldToplevel, model: Model, o: BedCutOptions, font: Font | null, hooks: Hooks = {}): BedCutResult {
  const at = (fraction: number, stage: string) => {
    if (hooks.cancelled?.()) throw new JobCancelled();
    hooks.progress?.(fraction, stage);
  };
  return scoped((k) => {
    const warnings: string[] = [];
    at(0.02, "Conferindo a malha");
    const parts = model.parts.map((p) => {
      const r = solidFromMesh(M, p.mesh);
      if (r.holes) warnings.push(`A malha de "${p.name}" tinha ${r.holes} furo${r.holes > 1 ? "s" : ""} e foi consertada antes de cortar.`);
      return k(r.solid);
    });
    const solid = parts.length > 1 ? k(M.Manifold.union(parts)) : parts[0];
    const bb = solid.boundingBox();
    const dims = [0, 1, 2].map((a) => bb.max[a] - bb.min[a]) as Vec3;
    const auto = !o.counts;
    const plan = o.counts ? { counts: o.counts.map((n) => Math.max(1, Math.min(MAX_PARTS_PER_AXIS, Math.round(n)))) as Vec3, fits: true } : planCuts(dims, o.bed, o.margin);
    const counts = plan.counts;
    if (!plan.fits) warnings.push("Mesmo com 8 partes por eixo os pedaços não cabem nesta mesa: confira as medidas da mesa e da peça.");
    const bounds = [0, 1, 2].map((a) => Array.from({ length: counts[a] + 1 }, (_, i) => bb.min[a] + (dims[a] * i) / counts[a])) as [number[], number[], number[]];

    // pedaços: a peça cortada em caixas
    const cells = new Map<string, Cell>();
    const boxes = cellBoxes(M, bb.min as Vec3, bb.max as Vec3, bounds, counts);
    for (const [n, c] of boxes.entries()) {
      at(0.1 + (0.4 * n) / boxes.length, "Cortando os pedaços");
      const piece = k(solid.intersect(k(c.box)));
      if (piece.isEmpty() || piece.volume() < MIN_PIECE_MM3) continue;
      cells.set(joinKey(c.idx), { idx: c.idx, min: c.min, max: c.max, solid: piece });
    }
    if (cells.size === 0) throw new Error("O plano de corte não passa pela peça.");

    // juntas: cada par de pedaços vizinhos
    const keys: { id: number; solid: Solid }[] = [];
    const touched = new Map<string, number[]>();
    let joints = 0;
    if (o.joint !== "none" || o.numbers) {
      for (const axis of AXES) {
        const a = AXIS_INDEX[axis];
        for (const lower of cells.values()) {
          const upper = cells.get(joinKey(lower.idx.map((v, i) => (i === a ? v + 1 : v)) as Vec3));
          if (!upper) continue;
          const f = planeFrame(axis, lower.max[a]);
          const [l0, l1] = f.lateral;
          const section = k(k(solid.transform(f.toLocal)).slice(0));
          const rect = k(M.CrossSection.square([lower.max[l0] - lower.min[l0], lower.max[l1] - lower.min[l1]]).translate([lower.min[l0], lower.min[l1]]));
          const sec = k(section.intersect(rect));
          if (sec.isEmpty()) continue; // o plano passou por um vão entre duas partes soltas: não há o que encaixar
          const id = ++joints;
          at(0.5 + 0.3 * (1 - 1 / (1 + joints / 4)), "Fazendo os encaixes");
          const room = ROOM * Math.min(lower.max[a] - lower.min[a], upper.max[a] - upper.min[a]);
          const joint = o.joint === "none" ? null : buildJoint(M, k, o.joint, sec, { size: o.size, clearance: o.clearance, magnet: o.magnet, room });
          if (o.joint !== "none" && !joint) warnings.push(`A junta ${id} (${axis.toUpperCase()}) é pequena demais para o encaixe escolhido: saiu sem encaixe.`);
          const cuts: Solid[][] = [[], []]; // o que sai de baixo e de cima
          if (joint) {
            cuts[0].push(k(joint.holeBelow.transform(f.toWorld)));
            cuts[1].push(k(joint.holeAbove.transform(f.toWorld)));
            if (joint.key) keys.push({ id, solid: joint.key });
          }
          if (o.numbers && font) {
            const text = k(textToCrossSection(M, font, String(id), NUMBER_MM));
            const tb = text.bounds();
            const spot = numberSpot(k, sec, joint?.footprint ?? k(M.CrossSection.square([0.01, 0.01])), Math.hypot(tb.max[0] - tb.min[0], tb.max[1] - tb.min[1]) / 2);
            if (spot) {
              const [cx, cy] = [(tb.min[0] + tb.max[0]) / 2, (tb.min[1] + tb.max[1]) / 2];
              const front = k(text.translate([spot[0] - cx, spot[1] - cy]));
              const mirrored = k(text.scale([-1, 1])); // a face de cima do corte é vista por baixo: o número sai espelhado nela
              const back = k(mirrored.translate([spot[0] + cx, spot[1] - cy]));
              cuts[0].push(k(k(k(front.extrude(ENGRAVE_MM)).translate([0, 0, -ENGRAVE_MM])).transform(f.toWorld)));
              cuts[1].push(k(k(back.extrude(ENGRAVE_MM)).transform(f.toWorld)));
            } else warnings.push(`O número da junta ${id} não coube na face cortada.`);
          }
          for (const [cell, list] of [[lower, cuts[0]], [upper, cuts[1]]] as const) {
            if (!list.length) continue;
            cell.solid = k(cell.solid.subtract(k(M.Manifold.union(list))));
            touched.set(joinKey(cell.idx), [...(touched.get(joinKey(cell.idx)) ?? []), id]);
          }
        }
      }
    }

    // cada pedaço assenta na mesa pela face em que mais se apoia (que caiba); depois tudo arrumado em mesas
    at(0.85, "Arrumando na mesa");
    const u = usable(o.bed, o.margin);
    const list = [...cells.values()].sort((p, q) => p.idx[2] - q.idx[2] || p.idx[1] - q.idx[1] || p.idx[0] - q.idx[0]);
    const laid = list.map((c, i) => {
      let best = null as { s: Solid; score: number } | null;
      for (const f of FACE_DOWN) {
        const r = k(c.solid.rotate(f.rotate));
        const b = r.boundingBox();
        const [dx, dy, dz] = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
        const ok = dz <= u.z + 1e-6 && ((dx <= u.x + 1e-6 && dy <= u.y + 1e-6) || (dx <= u.y + 1e-6 && dy <= u.x + 1e-6));
        if (!ok) continue;
        const base = k(r.slice(b.min[2] + 0.1));
        const score = base.area() - dz * 1e-3; // mais base, depois mais baixo
        if (!best || score > best.score) best = { s: r, score };
      }
      if (!best) warnings.push(`${label(i + 1)} não cabe na mesa em nenhuma posição: aumente o número de partes.`);
      const s = best?.s ?? c.solid;
      const b = s.boundingBox();
      return { cell: c, n: i + 1, solid: k(s.translate([-b.min[0], -b.min[1], -b.min[2]])), w: b.max[0] - b.min[0], d: b.max[1] - b.min[1] };
    });
    const placed = shelf(laid.map((p) => ({ w: p.w, d: p.d })), u.x, u.y);
    const models: Model[] = laid.map((p, i) => {
      const [x, y] = placed.at[i];
      const js = touched.get(joinKey(p.cell.idx));
      const mesh = toMesh(k(p.solid.translate([x, y, 0])));
      return { name: js?.length ? `${label(p.n)} (juntas ${js.join(", ")})` : label(p.n), parts: [{ name: label(p.n), color: PIECE_COLOR, mesh }] as Part[] };
    });
    // chaves e pinos soltos: ficam à parte, ao lado das peças
    let kx = 0;
    const keyModels: Model[] = keys.map(({ id, solid: key }) => {
      const b = key.boundingBox();
      const mesh = toMesh(k(key.translate([-b.min[0] + kx, -b.min[1] + placed.depth + PLATE_GAP, -b.min[2]])));
      kx += b.max[0] - b.min[0] + 3;
      return { name: `Chave ou pinos da junta ${id}`, parts: [{ name: `Junta ${id}`, color: KEY_COLOR, mesh }] };
    });

    // montada, para a prévia (com afastamento entre os pedaços)
    const assembled: Model[] = list.map((c, i) => {
      const off = c.idx.map((v, a) => (v - (counts[a] - 1) / 2) * o.explode) as Vec3;
      return { name: label(i + 1), previewOnly: true, parts: [{ name: label(i + 1), color: PIECE_COLOR, mesh: toMesh(k(c.solid.translate(off))) }] };
    });

    at(0.97, "Montando a prévia");
    const fits = plan.fits && laid.every((p) => p.w <= u.x + 1e-6 || p.w <= u.y + 1e-6);
    return {
      models: [...models, ...keyModels],
      assembled,
      warnings,
      info: { dims, counts, auto, fits, pieces: list.length, joints, plates: placed.plates },
    };
  });
}

/** Arruma retângulos em fileiras dentro de mesas de w × d; mesa nova quando acaba o espaço. Devolve a posição de cada um (mesas lado a lado). */
function shelf(items: { w: number; d: number }[], W: number, D: number): { at: [number, number][]; plates: number; depth: number } {
  const at: [number, number][] = new Array(items.length);
  const order = items.map((_, i) => i).sort((a, b) => items[b].d - items[a].d);
  let plate = 0, x = 0, y = 0, rowH = 0, maxY = 0;
  for (const i of order) {
    const { w, d } = items[i];
    if (x + w > W && x > 0) [x, y, rowH] = [0, y + rowH + PLATE_GAP, 0];
    if (y + d > D && y > 0) [plate, x, y, rowH] = [plate + 1, 0, 0, 0];
    at[i] = [plate * (W + 20) + x, y];
    x += w + PLATE_GAP;
    rowH = Math.max(rowH, d);
    maxY = Math.max(maxY, y + d);
  }
  return { at, plates: plate + 1, depth: maxY };
}
