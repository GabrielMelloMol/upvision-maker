import { solidFromMesh } from "./cutSolid";
import type { ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Mesh, Model } from "./types";

/**
 * Miolo leve (#236): a peça fica com uma casca de `wall` mm e o resto vira uma estrutura repetida (giroide, voronoi ou treliça
 * cúbica). Serve para economizar filamento em peça grande; o fatiador continua podendo pôr o infill dele na estrutura.
 */
export type CoreKind = "gyroid" | "voronoi" | "cubic";
export const CORE_KINDS: [CoreKind, string][] = [
  ["gyroid", "Giroide"],
  ["voronoi", "Voronoi"],
  ["cubic", "Treliça cúbica"],
];
export type LightenOpts = {
  kind: CoreKind;
  /** Tamanho da célula (mm): período do giroide, distância média entre sementes do voronoi, passo da treliça. */
  cell: number;
  /** Espessura da chapa ou do bastão da estrutura (mm). */
  strut: number;
  /** Casca externa que fica maciça (mm); 0 = a estrutura vai até a borda (bloco de treliça). */
  wall: number;
  /** Sorteio das sementes do voronoi. */
  seed: number;
};
export const DEFAULT_LIGHTEN: LightenOpts = { kind: "gyroid", cell: 12, strut: 1.2, wall: 1.6, seed: 1 };

export type LightenStats = {
  /** Volume da peça pronta e da maciça (mm³). */
  volume: number;
  solidVolume: number;
  /** Menor seção que sobra em cada direção, em fração da maciça (0 a 1): quem carrega a carga naquele eixo. */
  sections: { x: number; y: number; z: number };
  /** A grade de cálculo ficou grossa para essa célula: a estrutura sai mais facetada. */
  coarse: boolean;
};

const MAX_SAMPLES = 4_000_000;
const MIN_EDGE_PER_CELL = 1 / 6;
const COARSE_EDGE_PER_CELL = 1 / 4;
const SLICE_PROBES = 12;
const MIN_PROBE_AREA = 1e-3;
const PLA_G_PER_MM3 = 0.00124;
export const massGrams = (volumeMm3: number) => volumeMm3 * PLA_G_PER_MM3;

type K = <D extends { delete(): void }>(o: D) => D;

/** Casca interna: cada fatia encolhida em `wall` (offset 2D, rápido) e depois encolhida também no sentido vertical. */
function erode(M: ManifoldToplevel, k: K, body: Solid, wall: number): Solid {
  if (wall <= 0) return body;
  const b = body.boundingBox();
  const dz = Math.min(0.8, Math.max(0.3, wall / 3));
  const n = Math.max(1, Math.ceil((b.max[2] - b.min[2]) / dz));
  const step = (b.max[2] - b.min[2]) / n;
  const layers: Solid[] = [];
  for (let i = 0; i < n; i++) {
    const z = b.min[2] + (i + 0.5) * step;
    const cs = k(body.slice(z));
    if (cs.isEmpty()) continue;
    const shrunk = k(cs.offset(-wall, "Round"));
    if (shrunk.isEmpty()) continue;
    layers.push(k(k(shrunk.extrude(step * 1.001)).translate([0, 0, z - step / 2])));
  }
  if (!layers.length) return k(M.Manifold.cube([0.001, 0.001, 0.001]));
  const stack = k(M.Manifold.union(layers));
  return k(k(stack.intersect(k(stack.translate([0, 0, wall])))).intersect(k(stack.translate([0, 0, -wall]))));
}

/** Gerador de números repetível (mulberry32) para as sementes do voronoi. */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash3 = (i: number, j: number, l: number, seed: number) => ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(l, 83492791) ^ Math.imul(seed, 2654435761)) >>> 0);

/** Gap entre a 1ª e a 2ª semente mais próximas de p (0 em cima da parede entre duas células do voronoi). */
function voronoiGap(o: LightenOpts): (p: [number, number, number]) => number {
  const cache = new Map<number, [number, number, number]>();
  const seedAt = (i: number, j: number, l: number): [number, number, number] => {
    const key = hash3(i, j, l, o.seed);
    let s = cache.get(key);
    if (!s) {
      const r = rand(key);
      s = [(i + r()) * o.cell, (j + r()) * o.cell, (l + r()) * o.cell];
      cache.set(key, s);
    }
    return s;
  };
  return ([x, y, z]) => {
    const ci = Math.floor(x / o.cell), cj = Math.floor(y / o.cell), cl = Math.floor(z / o.cell);
    let d1 = Infinity, d2 = Infinity;
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (let l = cl - 1; l <= cl + 1; l++) {
          const s = seedAt(i, j, l);
          const d = Math.hypot(s[0] - x, s[1] - y, s[2] - z);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
    return d2 - d1;
  };
}

type Box = { min: [number, number, number]; max: [number, number, number] };
const MAX_BARS = 4000;
const BAR_SEGMENTS = 10;

/** Treliça cúbica: barras exatas (cilindros) nas arestas de uma grade de passo `cell`; barra mais fina que a grade de cálculo sumiria num campo. */
function cubicBars(M: ManifoldToplevel, o: LightenOpts, box: Box): Solid {
  const bars: Solid[] = [];
  const c = o.cell;
  const r = o.strut / 2;
  const lines = (lo: number, hi: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / c) * c; v <= hi; v += c) out.push(v);
    return out;
  };
  const [xs, ys, zs] = [0, 1, 2].map((a) => lines(box.min[a], box.max[a]));
  if (xs.length * ys.length + xs.length * zs.length + ys.length * zs.length > MAX_BARS) throw new Error("A célula é pequena demais para o tamanho da peça (barras demais). Aumente a célula.");
  const add = (axis: 0 | 1 | 2, a: number, b: number) => {
    const len = box.max[axis] - box.min[axis];
    const cyl = M.Manifold.cylinder(len, r, r, BAR_SEGMENTS);
    // o cilindro nasce ao longo de z: gira para o eixo pedido e leva ao ponto (a, b) da grade
    const turned = axis === 2 ? cyl : axis === 0 ? cyl.rotate([0, 90, 0]) : cyl.rotate([-90, 0, 0]);
    const at = axis === 0 ? [box.min[0], a, b] : axis === 1 ? [a, box.min[1], b] : [a, b, box.min[2]];
    bars.push(turned.translate(at as [number, number, number]));
    if (turned !== cyl) cyl.delete();
  };
  for (const y of ys) for (const z of zs) add(0, y, z);
  for (const x of xs) for (const z of zs) add(1, x, z);
  for (const x of xs) for (const y of ys) add(2, x, y);
  const out = M.Manifold.union(bars);
  bars.forEach((b) => b.delete());
  return out;
}

/** Estrutura repetida cobrindo a caixa `box` (maior que a região do miolo para o corte ficar limpo). */
function lattice(M: ManifoldToplevel, o: LightenOpts, box: Box): { solid: Solid; coarse: boolean } {
  if (o.kind === "cubic") return { solid: cubicBars(M, o, box), coarse: false };
  const ext = [0, 1, 2].map((i) => box.max[i] - box.min[i]);
  const edge = Math.max(o.cell * MIN_EDGE_PER_CELL, Math.cbrt((ext[0] * ext[1] * ext[2]) / MAX_SAMPLES));
  const coarse = edge > o.cell * COARSE_EDGE_PER_CELL;
  if (o.kind === "gyroid") {
    // chapa = região entre as superfícies g = −t e g = +t, cada uma lisa e amostrada na mesma grade: o erro da grade é parecido nas
    // duas e a espessura sai uniforme (detectar a chapa fina direto no campo a perde quando ela é mais fina que a grade)
    const kk = (2 * Math.PI) / o.cell;
    const t = 0.55 * kk * o.strut;
    const g = ([x, y, z]: [number, number, number]) => Math.sin(x * kk) * Math.cos(y * kk) + Math.sin(y * kk) * Math.cos(z * kk) + Math.sin(z * kk) * Math.cos(x * kk);
    const outer = M.Manifold.levelSet(g, box, edge, -t);
    const inner = M.Manifold.levelSet(g, box, edge, t);
    const sheet = outer.subtract(inner);
    outer.delete();
    inner.delete();
    return { solid: sheet, coarse };
  }
  // voronoi: paredes = caixa menos o interior das células (cada interior é grande e liso, bem amostrado)
  const cells = M.Manifold.levelSet(voronoiGap(o), box, edge, o.strut);
  const whole = M.Manifold.cube([ext[0], ext[1], ext[2]]).translate(box.min);
  const walls = whole.subtract(cells);
  cells.delete();
  whole.delete();
  return { solid: walls, coarse };
}

/** Menor razão (peça pronta ÷ maciça) das áreas das fatias ao longo de z; as pontas ficam de fora (lá a casca é maciça). */
function minSection(res: Solid, body: Solid): number {
  const b = body.boundingBox();
  let min = 1;
  for (let i = 1; i <= SLICE_PROBES; i++) {
    const z = b.min[2] + ((b.max[2] - b.min[2]) * i) / (SLICE_PROBES + 1);
    const full = body.slice(z);
    const part = res.slice(z);
    const a = full.area();
    if (a > MIN_PROBE_AREA) min = Math.min(min, part.area() / a);
    full.delete();
    part.delete();
  }
  return min;
}

/** A estrutura entra um pouco na casca (até esta folga), para fundir com ela em vez de só encostar. */
const OVERLAP_MM = 0.4;
const GROUNDED_MM = 0.1;
/** Refazer o sólido sem um corpo pode revelar outra lasca; repete até estabilizar. */
const FLOATING_PASSES = 4;
/** Um corpo com pelo menos esta fração do maior é uma peça de verdade (outro objeto do arquivo), não uma sobra. */
const REAL_BODY_FRACTION = 0.02;

/**
 * Pedaços de estrutura que não apoiam em nada (sobras do corte na borda do miolo e lascas) sairiam impressos no ar. Ficam os
 * corpos que encostam na mesa e, com casca, os grandes; as cavidades (o Manifold as devolve como corpos de volume negativo)
 * acompanham. Só remonta os corpos que valem, sem operação booleana (com lascas degeneradas ela é lenta e instável).
 * Sem casca (bloco de treliça) só ficam os que encostam na mesa: o maior corpo solto no ar não seria imprimível.
 */
function dropFloating(M: ManifoldToplevel, k: K, first: Solid, zMin: number, groundedOnly: boolean): Solid {
  let solid = first;
  for (let pass = 0; pass < FLOATING_PASSES; pass++) {
    const next = dropFloatingOnce(M, k, solid, zMin, groundedOnly);
    if (next === solid) return solid;
    solid = next;
  }
  return solid;
}

function dropFloatingOnce(M: ManifoldToplevel, k: K, solid: Solid, zMin: number, groundedOnly: boolean): Solid {
  const bodies = solid.decompose();
  bodies.forEach((b) => k(b));
  const material = bodies.filter((b) => b.volume() > 0);
  if (!material.length) return solid;
  const biggest = Math.max(...material.map((b) => b.volume()));
  const keep = bodies.filter((b) => {
    const v = b.volume();
    if (v <= 0) return true;
    const grounded = b.boundingBox().min[2] <= zMin + GROUNDED_MM;
    return grounded || (!groundedOnly && v >= biggest * REAL_BODY_FRACTION);
  });
  if (keep.length === bodies.length) return solid;
  // junta as malhas dos corpos que ficam (as cavidades vêm com as faces para dentro, como no original) e refaz o sólido
  const pos: number[] = [];
  const tri: number[] = [];
  for (const b of keep) {
    const m = b.getMesh();
    const base = pos.length / 3;
    for (let i = 0; i < m.vertProperties.length; i += m.numProp) pos.push(m.vertProperties[i], m.vertProperties[i + 1], m.vertProperties[i + 2]);
    for (const t of m.triVerts) tri.push(t + base);
  }
  solid.delete();
  return M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts: new Uint32Array(tri) }));
}

/** Troca o miolo do sólido `body` (já em mm) pela estrutura de `o`. */
export function lightenSolid(M: ManifoldToplevel, body: Solid, o: LightenOpts): { solid: Solid; stats: LightenStats } {
  return scoped((k) => {
    const inner = erode(M, k, body, o.wall);
    if (inner.isEmpty() || inner.volume() < o.cell ** 3 * 0.05) throw new Error("A peça é fina demais para essa casca: diminua a casca ou a célula.");
    const overlap = o.wall > 0 ? Math.min(OVERLAP_MM, o.wall / 2) : 0;
    const reach = overlap > 0 ? erode(M, k, body, o.wall - overlap) : inner;
    const b = reach.boundingBox();
    const pad = o.cell;
    const { solid: core, coarse } = lattice(M, o, { min: b.min.map((v) => v - pad) as Box["min"], max: b.max.map((v) => v + pad) as Box["max"] });
    k(core);
    const skin = k(body.subtract(inner));
    const fused = M.Manifold.union([skin, k(core.intersect(reach))]); // dropFloating devolve ou substitui este
    const solid = dropFloating(M, k, fused, body.boundingBox().min[2], o.wall === 0);
    const rx = (s: Solid) => k(s.rotate([0, 90, 0])); // leva o eixo x para z
    const ry = (s: Solid) => k(s.rotate([-90, 0, 0])); // leva o eixo y para z
    const stats: LightenStats = {
      volume: solid.volume(),
      solidVolume: body.volume(),
      sections: { x: minSection(rx(solid), rx(body)), y: minSection(ry(solid), ry(body)), z: minSection(solid, body) },
      coarse,
    };
    return { solid, stats };
  });
}

/** A peça cortada ao meio (some a metade da frente, y abaixo do centro): a face cortada fica virada para a câmera da prévia. Só para a prévia, nunca vai para o arquivo. */
function halfSection(M: ManifoldToplevel, k: K, solid: Solid): Mesh {
  const b = solid.boundingBox();
  const mid = (b.min[1] + b.max[1]) / 2;
  const big = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 2;
  const cutter = k(M.Manifold.cube([big * 2, big, big * 2], false).translate([b.min[0] - big / 2, mid - big, b.min[2] - big / 2]));
  return toMesh(k(solid.subtract(cutter)));
}

/** Modelo do arquivo → uma só peça com miolo leve (as cores do arquivo viram a da primeira parte). */
export function lightenModel(M: ManifoldToplevel, model: Model, o: LightenOpts): { model: Model; section: Mesh; stats: LightenStats; warnings: string[] } {
  return scoped((k) => {
    const warnings: string[] = [];
    const parts = model.parts.map((p) => k(solidFromMesh(M, p.mesh).solid));
    const body = parts.length === 1 ? parts[0] : k(M.Manifold.union(parts));
    if (model.parts.length > 1) warnings.push("As partes do arquivo viram uma peça só, na cor da primeira.");
    const { solid, stats } = lightenSolid(M, body, o);
    k(solid);
    if (stats.coarse) warnings.push("A célula é grande para o tamanho da peça (a grade de cálculo ficou grossa): a estrutura sai mais facetada. Use uma célula maior.");
    const color = model.parts[0]?.color ?? "#d4d4d8";
    return { model: { ...model, name: `${model.name} (miolo leve)`, parts: [{ name: "Peça", color, mesh: toMesh(solid) }] }, section: halfSection(M, k, solid), stats, warnings };
  });
}

/** Bloco de treliça (#236): caixa W×D×H com a estrutura até a borda (casca 0) ou com casca. */
export function latticeBlock(M: ManifoldToplevel, size: [number, number, number], o: LightenOpts): { model: Model; section: Mesh; stats: LightenStats } {
  return scoped((k) => {
    const body = k(M.Manifold.cube(size));
    const { solid, stats } = lightenSolid(M, body, o);
    k(solid);
    return { model: { name: "Bloco de treliça", parts: [{ name: "Bloco", color: "#6366f1", mesh: toMesh(solid) }] }, section: halfSection(M, k, solid), stats };
  });
}
