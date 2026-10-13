import type { Mat4 } from "manifold-3d";
import { fitSetOnBed, setOnBedWarning } from "./bedLayout";
import { fitDepth, planPins } from "./cutPins";
import { solidFromMesh } from "./cutSolid";
import { dashFor, emptyMesh, regionSegments, regionSolid, type Box, type Region, type Vec3 } from "./cutRegion";
import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { EXTRA_DEPTH, DEPTH_FACTOR, pinCs, spread, type CutAxis, type K, type PinMode, type PinShape } from "./planeCut";
import { scoped } from "./shape2d";
import type { Model, Part } from "./types";

export type { Box, Region, Vec3 };

/**
 * Corte parcial: o plano de corte só vale dentro de uma região (caixa, cilindro ou esfera). Pedaço = peça ∩ (região ∩
 * lado de cima do plano); resto = peça − essa região. Fora da região nada é cortado (o outro personagem, a árvore ao
 * lado). Trabalha num referencial em que o plano é z = 0 e a normal aponta para cima: o pedaço já sai com a face cortada na mesa.
 */
export type PartialCutOptions = {
  axis: CutAxis;
  /** Inclinação do plano em graus, em torno de um eixo horizontal (0 = plano reto). */
  tilt: number;
  /** Distância do plano à origem, em mm, ao longo da normal. */
  offset: number;
  /** Onde o corte vale, em mm no sistema do modelo. `null` = a peça toda. */
  region: Region | null;
  pin: PinShape;
  mode: PinMode;
  size: number; // 0 = automático
  clearance: number;
  /** Só na prévia: quanto o pedaço se afasta do plano, em mm. */
  explode: number;
};
export const DEFAULT_PARTIAL_CUT: PartialCutOptions = { axis: "z", tilt: 0, offset: 0, region: null, pin: "round", mode: "loose", size: 0, clearance: 0.2, explode: 0 };

export type CutReport = {
  original: number; // mm³
  sum: number; // pedaço + resto, antes do encaixe
  /** As duas peças são sólidos fechados e a soma volta ao original (até 0,1%). */
  ok: boolean;
};

const SLAB_MM = 0.2; // meia espessura do ladrilho que mostra o plano
const MARGIN_MM = 1;
const VOLUME_TOL = 1e-3;
/** Cores só de interface (nunca de filamento): região azul tracejada, plano translúcido neutro com contorno. */
const COLORS = { region: "#3b82f6", plane: "#cbd5e1", planeEdge: "#475569" };
const LINE_PX = 2; // largura do contorno na tela, em pixels
const SMALLER_PINS = [4, 3, 2.5, 2]; // pinos menores que se oferecem quando a face não comporta o automático
const MAX_AUTO_PIN = 12;

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Ponto (x, y) do plano do corte (z = 0 no referencial) levado ao mundo. */
const fromFrame = (m: Mat4, x: number, y: number): Vec3 => [m[0] * x + m[4] * y + m[12], m[1] * x + m[5] * y + m[13], m[2] * x + m[6] * y + m[14]];

/** Normal do plano: o eixo escolhido girado `tilt` graus (z e x em torno de Y/Z, y em torno de X). */
export function planeNormal(axis: CutAxis, tilt: number): Vec3 {
  const t = (tilt * Math.PI) / 180;
  const [s, c] = [Math.sin(t), Math.cos(t)];
  if (axis === "z") return [s, 0, c];
  if (axis === "x") return [c, s, 0];
  return [0, c, s];
}

/** Mundo → referencial do corte (normal vira +Z, plano em z = 0) e o caminho de volta. */
export function planeFrames(n: Vec3, offset: number): { to: Mat4; from: Mat4 } {
  const u = unit(Math.abs(n[2]) < 0.9 ? cross([0, 0, 1], n) : [1, 0, 0]);
  const v = cross(n, u);
  const to: Mat4 = [u[0], v[0], n[0], 0, u[1], v[1], n[1], 0, u[2], v[2], n[2], 0, 0, 0, -offset, 1];
  const from: Mat4 = [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, n[0] * offset, n[1] * offset, n[2] * offset, 1];
  return { to, from };
}

const asParts = (list: [Part, Solid][], k: K, z0: number): Part[] => list.map(([part, s]) => ({ ...part, mesh: toMesh(k(s.translate([0, 0, -z0]))) }));
const minZ = (list: [Part, Solid][]) => (list.length ? Math.min(...list.map(([, s]) => s.boundingBox().min[2])) : 0);

const SIDE_RATIO = 0.01; // mais de 1% da peça de cima fora da região

/** A borda da região atravessa material acima do plano: uma peça de cima que a região só pega em parte (um "tarugo"). */
function cutsSideways(k: K, all: Solid, B: Solid): boolean {
  const top = k(all.trimByPlane([0, 0, 1], 0));
  for (const c of top.decompose().map(k)) {
    if (k(c.intersect(B)).isEmpty()) continue;
    if (k(c.subtract(B)).volume() > SIDE_RATIO * c.volume()) return true;
  }
  return false;
}

/**
 * Corta `model` só dentro da região. `models` são os arquivos (resto, pedaço e, no pino solto, os pinos), lado a lado
 * na mesa; `preview` é o conjunto montado (pedaço em outra cor, afastado por `explode`) com a região e o plano.
 */
/** Saída do corte: `pinMissing` = pediu encaixe e a face não deu; `pinFix` = tamanho menor (mm) em que um pino fixo cabe escondido, se houver. */
export type PartialCutResult = { models: Model[]; preview: Model[]; warnings: string[]; report: CutReport; pinMissing: boolean; pinFix: number | null };

export function partialCut(M: ManifoldToplevel, model: Model, o: PartialCutOptions): PartialCutResult {
  const warnings: string[] = [];
  return scoped((k) => {
    const { to, from } = planeFrames(planeNormal(o.axis, o.tilt), o.offset);
    let holes = 0;
    const world = model.parts.map((p) => {
      const built = solidFromMesh(M, p.mesh);
      holes += built.holes;
      return k(built.solid);
    });
    if (holes) warnings.push(`A malha de "${model.name}" tinha ${holes} ${holes === 1 ? "furo" : "furos"} e foi reparada automaticamente antes do corte: confira o resultado.`);
    const frame = world.map((s) => k(s.transform(to)));
    const all = k(M.Manifold.union(frame));
    const wb = k(M.Manifold.union(world)).boundingBox();
    const region: Region = o.region ?? { kind: "box", min: wb.min.map((v) => v - MARGIN_MM) as Vec3, max: wb.max.map((v) => v + MARGIN_MM) as Vec3 };
    const B = k(regionSolid(M, k, region).transform(to));
    const upper = k(B.trimByPlane([0, 0, 1], 0)); // a região do lado de cima do plano
    const section = k(k(all.intersect(B)).slice(0));
    if (section.isEmpty()) throw new Error("O plano de corte não passa pela peça dentro da região.");

    const pieces: [Part, Solid][] = [];
    const rests: [Part, Solid][] = [];
    let original = 0, sum = 0;
    model.parts.forEach((part, i) => {
      const [piece, rest] = [k(frame[i].intersect(upper)), k(frame[i].subtract(upper))];
      original += frame[i].volume();
      sum += piece.volume() + rest.volume();
      if (!piece.isEmpty()) pieces.push([part, piece]);
      if (!rest.isEmpty()) rests.push([part, rest]);
    });
    if (!pieces.length) throw new Error("O plano de corte não passa pela peça dentro da região.");
    const closed = [...pieces, ...rests].every(([, s]) => s.status() === "NoError");
    const report: CutReport = { original, sum, ok: closed && Math.abs(sum - original) <= VOLUME_TOL * original + 0.01 };

    if (o.region && cutsSideways(k, all, B)) warnings.push(`A região corta a peça pelo lado (a borda dela atravessa o material acima do plano): aumente ${o.region.kind === "box" ? "a caixa" : "o raio"}.`);

    // encaixe na face cortada: tamanho e posição pelo círculo livre da face, escondido dentro das duas peças
    let spots: [number, number][] = [];
    let pinSize = 0, depth = 0;
    let pinMissing = false;
    let pinFix: number | null = null;
    if (o.pin !== "none") {
      // quanto há de material acima e abaixo do plano (o fitDepth confere que o furo cabe de fato na coluna)
      const above = Math.max(...pieces.map(([, p]) => p.boundingBox().max[2]));
      const below = -Math.min(...rests.map(([, r]) => r.boundingBox().min[2]), 0);
      const pieceAll = k(M.Manifold.union(pieces.map(([, s]) => s)));
      const restAll = k(M.Manifold.union(rests.map(([, s]) => s)));
      const tryPins = (size0: number) => {
        const plan = planPins(M, k, section, size0);
        const want = Math.min(plan.size * DEPTH_FACTOR, below * 0.6, above * 0.6);
        const fit = plan.spots.length && want >= 1.5 ? fitDepth(M, k, { shape: o.pin, size: plan.size, clearance: o.clearance, want }, plan.spots, pieceAll, restAll) : { spots: [], depth: 0 };
        return { size: plan.size, ...fit };
      };
      const first = tryPins(o.size);
      ({ spots, depth } = first);
      pinSize = first.size;
      if (!spots.length) {
        pinMissing = true;
        const smaller = SMALLER_PINS.filter((s) => s < (o.size > 0 ? o.size : MAX_AUTO_PIN)).find((s) => tryPins(s).spots.length > 0);
        pinFix = smaller ?? null;
        warnings.push(`A face do corte de "${model.name}" é pequena ou fina demais para um pino escondido nas duas peças: saiu sem encaixe.`);
      }
    }
    const pin2d: CS | null = spots.length ? k(M.CrossSection.union(spots.map((p) => k(k(pinCs(M, o.pin, pinSize)).translate(p))))) : null;
    const hole2d: CS | null = spots.length ? k(M.CrossSection.union(spots.map((p) => k(k(k(pinCs(M, o.pin, pinSize)).offset(o.clearance, "Miter")).translate(p))))) : null;
    if (hole2d && pin2d) {
      const holeUp = k(hole2d.extrude(depth + EXTRA_DEPTH));
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
    const lifted = pieces.map(([part, s], i): Part => ({ ...part, name: `Pedaço ${i + 1}`, mesh: toMesh(k(k(s.translate([0, 0, o.explode])).transform(from))) }));
    const shown: Model[] = [{ name: "Resto", parts: asParts(restWorld, k, 0).map((p) => ({ ...p, name: "Resto" })) }, { name: "Pedaço", parts: lifted }];
    shown.push(...cutOverlay(M, { min: wb.min as Vec3, max: wb.max as Vec3 }, o));
    return { models: placed, preview: shown, warnings, report, pinMissing, pinFix };
  });
}

/**
 * Plano (ladrilho translúcido com contorno) e região (contorno azul tracejado), rápidos de calcular: seguem o arrasto
 * ao vivo enquanto o corte em si espera. São só da prévia (`ghost`).
 */
export function cutOverlay(M: ManifoldToplevel, bounds: Box, o: Pick<PartialCutOptions, "axis" | "tilt" | "offset" | "region">): Model[] {
  return scoped((k) => {
    const n = planeNormal(o.axis, o.tilt);
    const { to, from } = planeFrames(n, o.offset);
    const region: Region = o.region ?? { kind: "box", min: bounds.min.map((v) => v - MARGIN_MM) as Vec3, max: bounds.max.map((v) => v + MARGIN_MM) as Vec3 };
    const B = regionSolid(M, k, region);
    const above = k(B.trimByPlane(n, o.offset - SLAB_MM));
    const slab = k(above.trimByPlane([-n[0], -n[1], -n[2]], -(o.offset + SLAB_MM)));
    const parts: Part[] = [{ name: "Plano de corte", color: COLORS.plane, mesh: toMesh(slab), ghost: true }];
    // contorno do plano: a borda da seção, em linha fina (largura fixa em pixels), levada de volta ao mundo
    const face = k(k(B.transform(to)).slice(0));
    const edge: number[] = [];
    for (const ring of face.toPolygons()) {
      for (let i = 0; i < ring.length; i++) {
        const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
        edge.push(...fromFrame(from, a[0], a[1]), ...fromFrame(from, b[0], b[1]));
      }
    }
    if (edge.length) parts.push({ name: "", color: COLORS.planeEdge, mesh: emptyMesh(), lines: { points: Float32Array.from(edge), width: LINE_PX, dash: 0 } });
    const out: Model[] = [{ name: "Plano de corte", parts }];
    if (o.region) out.push({ name: "Região", parts: [{ name: "Região", color: COLORS.region, mesh: emptyMesh(), lines: { points: regionSegments(o.region), width: LINE_PX, dash: dashFor(o.region) } }] });
    return out;
  });
}
