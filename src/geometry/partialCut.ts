import type { Mat4 } from "manifold-3d";
import { fitSetOnBed, setOnBedWarning } from "./bedLayout";
import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { autoSize, DEPTH_FACTOR, EXTRA_DEPTH, pinCs, pinSpots, spread, type CutAxis, type K, type PinMode, type PinShape } from "./planeCut";
import { scoped } from "./shape2d";
import type { Mesh, Model, Part } from "./types";

/**
 * Corte parcial: o plano de corte só vale dentro de uma caixa. Pedaço = peça ∩ (caixa ∩ lado de cima do plano);
 * resto = peça − essa região. Fora da caixa nada é cortado (o outro personagem, a árvore ao lado). Trabalha num
 * referencial em que o plano é z = 0 e a normal aponta para cima: o pedaço já sai com a face cortada na mesa.
 */
export type Vec3 = [number, number, number];
export type Box = { min: Vec3; max: Vec3 };
export type PartialCutOptions = {
  axis: CutAxis;
  /** Inclinação do plano em graus, em torno de um eixo horizontal (0 = plano reto). */
  tilt: number;
  /** Distância do plano à origem, em mm, ao longo da normal. */
  offset: number;
  /** Onde o corte vale, em mm no sistema do modelo. `null` = a peça toda. */
  box: Box | null;
  pin: PinShape;
  mode: PinMode;
  size: number; // 0 = automático
  clearance: number;
  /** Só na prévia: quanto o pedaço se afasta do plano, em mm. */
  explode: number;
};
export const DEFAULT_PARTIAL_CUT: PartialCutOptions = { axis: "z", tilt: 0, offset: 0, box: null, pin: "round", mode: "loose", size: 0, clearance: 0.2, explode: 0 };

export type CutReport = {
  original: number; // mm³
  sum: number; // pedaço + resto, antes do encaixe
  /** As duas peças são sólidos fechados e a soma volta ao original (até 0,1%). */
  ok: boolean;
};

const OUTLINE_MM = 0.6;
const SLAB_MM = 0.2; // meia espessura do ladrilho que mostra o plano
const MARGIN_MM = 1;
const VOLUME_TOL = 1e-3;
const COLORS = { region: "#38bdf8", plane: "#ef4444", piece: "#f97316" };

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Normal do plano: o eixo escolhido girado `tilt` graus (z e x em torno de Y/Z, y em torno de X). */
export function planeNormal(axis: CutAxis, tilt: number): Vec3 {
  const t = (tilt * Math.PI) / 180;
  const [s, c] = [Math.sin(t), Math.cos(t)];
  if (axis === "z") return [s, 0, c];
  if (axis === "x") return [c, s, 0];
  return [0, c, s];
}

/** Mundo → referencial do corte (normal vira +Z, plano em z = 0) e o caminho de volta. */
function frames(n: Vec3, offset: number): { to: Mat4; from: Mat4 } {
  const u = unit(Math.abs(n[2]) < 0.9 ? cross([0, 0, 1], n) : [1, 0, 0]);
  const v = cross(n, u);
  const to: Mat4 = [u[0], v[0], n[0], 0, u[1], v[1], n[1], 0, u[2], v[2], n[2], 0, 0, 0, -offset, 1];
  const from: Mat4 = [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, n[0] * offset, n[1] * offset, n[2] * offset, 1];
  return { to, from };
}

const solidOf = (M: ManifoldToplevel, m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

/** Contorno da caixa: 12 barras finas sobre as arestas (a prévia não tem fio, só malha). */
function outline(M: ManifoldToplevel, k: K, box: Box): Solid {
  const [lo, hi] = [box.min, box.max];
  const t = OUTLINE_MM;
  const bars: Solid[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const len = hi[axis] - lo[axis] + t;
    for (const a of [lo, hi]) {
      for (const b of [lo, hi]) {
        const size: Vec3 = [t, t, t];
        const at: Vec3 = [0, 0, 0];
        const [i, j] = [(axis + 1) % 3, (axis + 2) % 3];
        size[axis] = len;
        at[axis] = lo[axis] - t / 2;
        at[i] = a[i] - t / 2;
        at[j] = b[j] - t / 2;
        bars.push(k(k(M.Manifold.cube(size, false)).translate(at)));
      }
    }
  }
  return k(M.Manifold.union(bars));
}

const asParts = (list: [Part, Solid][], k: K, z0: number): Part[] => list.map(([part, s]) => ({ ...part, mesh: toMesh(k(s.translate([0, 0, -z0]))) }));
const minZ = (list: [Part, Solid][]) => (list.length ? Math.min(...list.map(([, s]) => s.boundingBox().min[2])) : 0);

/**
 * Corta `model` só dentro da caixa. `models` são os arquivos (resto, pedaço e, no pino solto, os pinos), lado a lado
 * na mesa; `preview` é o conjunto montado (pedaço em outra cor, afastado por `explode`) com a região e o plano.
 */
export function partialCut(M: ManifoldToplevel, model: Model, o: PartialCutOptions): { models: Model[]; preview: Model[]; warnings: string[]; report: CutReport } {
  const warnings: string[] = [];
  return scoped((k) => {
    const { to, from } = frames(planeNormal(o.axis, o.tilt), o.offset);
    const world = model.parts.map((p) => k(solidOf(M, p.mesh)));
    const frame = world.map((s) => k(s.transform(to)));
    const all = k(M.Manifold.union(frame));
    const wb = k(M.Manifold.union(world)).boundingBox();
    const box: Box = o.box ?? { min: wb.min.map((v) => v - MARGIN_MM) as Vec3, max: wb.max.map((v) => v + MARGIN_MM) as Vec3 };
    const size: Vec3 = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
    const B = k(k(k(M.Manifold.cube(size, false)).translate(box.min)).transform(to));
    const region = k(B.trimByPlane([0, 0, 1], 0)); // a caixa do lado de cima do plano
    const section = k(k(all.intersect(B)).slice(0));
    if (section.isEmpty()) throw new Error("O plano de corte não passa pela peça dentro da caixa.");

    const pieces: [Part, Solid][] = [];
    const rests: [Part, Solid][] = [];
    let original = 0, sum = 0;
    model.parts.forEach((part, i) => {
      const [piece, rest] = [k(frame[i].intersect(region)), k(frame[i].subtract(region))];
      original += frame[i].volume();
      sum += piece.volume() + rest.volume();
      if (!piece.isEmpty()) pieces.push([part, piece]);
      if (!rest.isEmpty()) rests.push([part, rest]);
    });
    if (!pieces.length) throw new Error("O plano de corte não passa pela peça dentro da caixa.");
    const closed = [...pieces, ...rests].every(([, s]) => s.status() === "NoError");
    const report: CutReport = { original, sum, ok: closed && Math.abs(sum - original) <= VOLUME_TOL * original + 0.01 };

    // encaixe na face cortada
    const pinSize = o.size > 0 ? o.size : autoSize(k, section);
    const spots = o.pin === "none" ? [] : pinSpots(M, section, pinSize);
    const inBox = k(all.intersect(B)).boundingBox();
    const depth = Math.max(1, Math.min(pinSize * DEPTH_FACTOR, -inBox.min[2] * 0.6, inBox.max[2] * 0.6));
    if (o.pin !== "none" && (!spots.length || depth < 1.5)) {
      warnings.push(`O corte de "${model.name}" é fino demais para pino de ${pinSize.toFixed(1).replace(".", ",")} mm: saiu sem encaixe.`);
      spots.length = 0;
    }
    const pin2d: CS | null = spots.length ? k(M.CrossSection.union(spots.map((p) => k(k(pinCs(M, o.pin, pinSize)).translate(p))))) : null;
    const hole2d: CS | null = spots.length ? k(M.CrossSection.union(spots.map((p) => k(k(k(pinCs(M, o.pin, pinSize)).offset(o.clearance, "Miter")).translate(p))))) : null;
    if (hole2d && pin2d) {
      const holeUp = k(k(hole2d.extrude(depth + EXTRA_DEPTH)).translate([0, 0, 0]));
      const holeDown = k(k(hole2d.extrude(depth + EXTRA_DEPTH)).translate([0, 0, -depth - EXTRA_DEPTH]));
      pieces.forEach((e, i) => (pieces[i] = [e[0], k(e[1].subtract(holeUp))]));
      if (o.mode === "loose") rests.forEach((e, i) => (rests[i] = [e[0], k(e[1].subtract(holeDown))]));
      else if (rests.length) rests[0] = [rests[0][0], k(rests[0][1].add(k(pin2d.extrude(depth))))];
    }

    // arquivos: o resto na posição de origem (sobre a mesa) e o pedaço com a face cortada para baixo
    const restWorld = rests.map(([part, r]): [Part, Solid] => [part, k(r.transform(from))]);
    const out: Model[] = [
      { name: `${model.name} · resto`, parts: asParts(restWorld, k, minZ(restWorld)) },
      { name: `${model.name} · pedaço`, parts: asParts(pieces, k, minZ(pieces)) },
    ];
    if (pin2d && o.mode === "loose") {
      const len = 2 * depth + EXTRA_DEPTH / 2;
      const pins = spots.map((_, i) => k(k(k(pinCs(M, o.pin, pinSize)).extrude(len)).translate([i * (pinSize + 4), 0, 0])));
      out.push({ name: `${model.name} · pinos`, parts: [{ name: "Pinos", color: model.parts[0].color, mesh: toMesh(k(M.Manifold.union(pins))) }] });
    }
    const placed = fitSetOnBed(spread(out));
    const set = setOnBedWarning(placed);
    if (set) warnings.push(set);

    // prévia: tudo no lugar, pedaço destacado e afastado do plano
    const lifted = pieces.map(([part, s], i): Part => ({ ...part, color: COLORS.piece, name: `Pedaço ${i + 1}`, mesh: toMesh(k(k(s.translate([0, 0, o.explode])).transform(from))) }));
    const shown: Model[] = [{ name: "Resto", parts: asParts(restWorld, k, 0) }, { name: "Pedaço", parts: lifted }];
    const slab = k(k(B.trimByPlane([0, 0, 1], -SLAB_MM)).trimByPlane([0, 0, -1], -SLAB_MM));
    shown.push({ name: "Plano de corte", parts: [{ name: "Plano de corte", color: COLORS.plane, mesh: toMesh(k(slab.transform(from))) }] });
    if (o.box) shown.push({ name: "Região", parts: [{ name: "Região", color: COLORS.region, mesh: toMesh(outline(M, k, box)) }] });
    return { models: placed, preview: shown, warnings, report };
  });
}
