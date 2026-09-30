import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { fitSetOnBed, setOnBedWarning } from "./bedLayout";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Model, Part } from "./types";

/**
 * Corte pelo plano com encaixe (#14, 2ª entrega): corta o modelo (todas as partes/cores) num plano perpendicular a
 * X, Y ou Z e põe pinos na face cortada. Pino solto: furo nas duas partes e pinos à parte (as duas partes vão à
 * mesa com a face cortada para baixo). Pino fixo: o pino sai da parte de baixo e a de cima recebe o furo.
 */
export type CutAxis = "x" | "y" | "z";
export type PinShape = "none" | "round" | "square" | "triangle";
export type PinMode = "loose" | "fixed";
export type CutOptions = {
  axis: CutAxis;
  at: number; // 0–1 ao longo do eixo
  pin: PinShape;
  mode: PinMode;
  size: number; // 0 = automático
  clearance: number;
};
export const DEFAULT_CUT: CutOptions = { axis: "z", at: 0.5, pin: "round", mode: "loose", size: 0, clearance: 0.2 };

const WALL = 1.6; // parede mínima em volta do pino
const MIN_SIZE = 3;
const MAX_SIZE = 12;
const DEPTH_FACTOR = 1.5;
const EXTRA_DEPTH = 0.4; // o furo é mais fundo que o pino
const LONG_RATIO = 2.5; // ilha comprida ganha 2 pinos
const GAP = 10;

type K = <D extends { delete(): void }>(o: D) => D;
type Pt = [number, number];

/** Gira o mundo para o eixo de corte virar Z (e desfaz). */
const toZ: Record<CutAxis, [number, number, number]> = { z: [0, 0, 0], x: [0, 90, 0], y: [-90, 0, 0] };

function pinCs(M: ManifoldToplevel, shape: PinShape, size: number): CS {
  if (shape === "round") return M.CrossSection.circle(size / 2, 48);
  if (shape === "square") return M.CrossSection.square([size, size], true);
  const r = size / Math.sqrt(3);
  return new M.CrossSection([[0, 1, 2].map((i) => [r * Math.cos(Math.PI / 2 + (i * 2 * Math.PI) / 3), r * Math.sin(Math.PI / 2 + (i * 2 * Math.PI) / 3)] as Pt)], "NonZero");
}

/** Pontos dos pinos: 1 por ilha do corte (2 se for comprida), onde cabe o pino com parede em volta. */
export function pinSpots(M: ManifoldToplevel, section: CS, size: number): Pt[] {
  return scoped((k) => {
    const spots: Pt[] = [];
    for (const island of section.decompose().map(k)) {
      const safe = k(island.offset(-(size / 2 + WALL), "Round"));
      if (safe.isEmpty()) continue;
      const b = safe.bounds();
      const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
      const cands: Pt[] = w > h * LONG_RATIO ? [[b.min[0] + w * 0.2, (b.min[1] + b.max[1]) / 2], [b.max[0] - w * 0.2, (b.min[1] + b.max[1]) / 2]] : h > w * LONG_RATIO ? [[(b.min[0] + b.max[0]) / 2, b.min[1] + h * 0.2], [(b.min[0] + b.max[0]) / 2, b.max[1] - h * 0.2]] : [[(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]];
      for (const c of cands) {
        // o centro pode cair fora (ilha em U): usa o ponto do contorno seguro mais perto
        const probe = k(k(M.CrossSection.circle(0.01, 8)).translate(c));
        if (!k(probe.intersect(safe)).isEmpty()) spots.push(c);
        else spots.push(safe.toPolygons().flat().reduce((a, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(a[0] - c[0], a[1] - c[1]) ? p : a)) as Pt);
      }
    }
    return spots;
  });
}

/** Medida automática do pino: cabe na menor ilha que recebe pino, entre 3 e 12 mm. */
function autoSize(k: K, section: CS): number {
  let best = MIN_SIZE;
  for (const island of section.decompose().map(k)) {
    const b = island.bounds();
    const guess = Math.min(MAX_SIZE, Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]) * 0.3);
    if (guess > best && !k(island.offset(-(guess / 2 + WALL), "Round")).isEmpty()) best = guess;
  }
  return best;
}

/** Corta cada modelo e devolve Parte A, Parte B (e Pinos, no modo solto), lado a lado na mesa. */
export function cutModels(M: ManifoldToplevel, models: Model[], o: CutOptions): { models: Model[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: Model[] = [];
  for (const model of models) {
    const r = scoped((k) => {
      const [rx, ry, rz] = toZ[o.axis];
      const solids = model.parts.map((p) => ({ part: p, s: k(k(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices }))).rotate([rx, ry, rz])) }));
      const all = k(M.Manifold.union(solids.map((x) => x.s)));
      const bb = all.boundingBox();
      const z = bb.min[2] + (bb.max[2] - bb.min[2]) * Math.min(0.98, Math.max(0.02, o.at));
      const section = k(all.slice(z));
      if (section.isEmpty()) throw new Error("O plano de corte não passa pela peça.");
      const size = o.size > 0 ? o.size : autoSize(k, section);
      const spots = o.pin === "none" ? [] : pinSpots(M, section, size);
      if (o.pin !== "none" && !spots.length) warnings.push(`O corte de "${model.name}" é fino demais para pino de ${size.toFixed(1).replace(".", ",")} mm: saiu sem encaixe.`);
      const below = bb.max[2] - z, above = z - bb.min[2];
      const depth = Math.max(1, Math.min(size * DEPTH_FACTOR, below * 0.6, above * 0.6));
      const pin2d = spots.length ? k(M.CrossSection.union(spots.map((p) => k(k(pinCs(M, o.pin, size)).translate(p))))) : null;
      const hole2d = spots.length ? k(M.CrossSection.union(spots.map((p) => k(k(k(pinCs(M, o.pin, size)).offset(o.clearance, "Miter")).translate(p))))) : null;
      // furos: descem na parte de baixo (A) e sobem na de cima (B), a partir do plano
      const holeDown = hole2d ? k(k(hole2d.extrude(depth + EXTRA_DEPTH)).translate([0, 0, z - depth - EXTRA_DEPTH])) : null;
      const holeUp = hole2d ? k(k(hole2d.extrude(depth + EXTRA_DEPTH)).translate([0, 0, z])) : null;
      const pinUp = pin2d && o.mode === "fixed" ? k(k(pin2d.extrude(depth)).translate([0, 0, z])) : null;
      // mundo girado: corte horizontal em z. Cima (B) já tem a face cortada embaixo; baixo (A) gira 180° no modo
      // solto (face cortada para a mesa) ou fica em pé com o pino para cima no modo fixo.
      const flipA = o.mode === "loose";
      const downs: [Part, Solid][] = [], ups: [Part, Solid][] = [];
      solids.forEach(({ part, s }, i) => {
        const [up0, down0] = s.splitByPlane([0, 0, 1], z);
        let up = k(up0), down = k(down0);
        if (holeUp) up = k(up.subtract(holeUp));
        if (holeDown && o.mode === "loose") down = k(down.subtract(holeDown));
        if (pinUp && i === 0) down = k(down.add(pinUp)); // pino fixo na parte principal de baixo
        if (!down.isEmpty()) downs.push([part, flipA ? k(down.rotate([180, 0, 0])) : down]);
        if (!up.isEmpty()) ups.push([part, up]);
      });
      const onBed = (list: [Part, Solid][]): Part[] => {
        if (!list.length) return [];
        const z0 = Math.min(...list.map(([, s]) => s.boundingBox().min[2]));
        return list.map(([part, s]) => ({ ...part, mesh: toMesh(k(s.translate([0, 0, -z0]))) }));
      };
      const models2: Model[] = [
        { name: `${model.name} · parte A`, parts: onBed(downs) },
        { name: `${model.name} · parte B`, parts: onBed(ups) },
      ];
      if (pin2d && o.mode === "loose") {
        const pinLen = 2 * depth + EXTRA_DEPTH / 2;
        const pins = spots.map((_, i) => k(k(k(pinCs(M, o.pin, size)).extrude(pinLen)).translate([i * (size + 4), 0, 0])));
        models2.push({ name: `${model.name} · pinos`, parts: [{ name: "Pinos", color: model.parts[0].color, mesh: toMesh(k(M.Manifold.union(pins))) }] });
      }
      return models2;
    });
    out.push(...r);
  }
  const placed = fitSetOnBed(spread(out)); // partes em fila passando da mesa: rearruma (#125)
  const set = setOnBedWarning(placed);
  return { models: placed, warnings: set ? [...warnings, set] : warnings };
}

/** Lado a lado em X, sem se tocar. */
function spread(models: Model[]): Model[] {
  let x = 0;
  return models.map((m) => {
    let x0 = Infinity, x1 = -Infinity;
    for (const p of m.parts)
      for (let i = 0; i < p.mesh.positions.length; i += 3) {
        x0 = Math.min(x0, p.mesh.positions[i]);
        x1 = Math.max(x1, p.mesh.positions[i]);
      }
    const dx = x - x0;
    x += x1 - x0 + GAP;
    return { ...m, parts: m.parts.map((p) => ({ ...p, mesh: { ...p.mesh, positions: p.mesh.positions.map((v, i) => (i % 3 === 0 ? v + dx : v)) } })) };
  });
}
