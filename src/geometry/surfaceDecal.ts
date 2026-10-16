import { nozzleMm, nozzleText } from "./bed";
import { placeDecal, type Decal, type DecalRegions, type DecalWarning } from "./decals";
import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Mesh, Model, Part } from "./types";

/**
 * Decal em superfície qualquer (#212): a peça vem girada para o ponto escolhido ficar na origem, olhando para +Z
 * (como `toFaceFrame`). O desenho é projetado ao longo de Z na superfície que está por cima e o relevo (ou o
 * entalhe) é deformado para acompanhá-la, andando pela normal de cada ponto. Funciona em copo, esfera, tampa
 * abaulada, ombro de garrafa: onde a superfície é lisa e voltada para o desenho.
 */
type SurfaceHit = { z: number; nx: number; ny: number; nz: number };
export type SurfaceIndex = { sample(x: number, y: number): SurfaceHit | null };

const EMBED_MM = 0.4; // o relevo começa um pouco dentro da peça (depois a peça é subtraída): sem fresta nas facetas
const OUT_MM = 0.6; // o entalhe passa um pouco da superfície para o corte sair limpo
const STEEP_COS = 0.5; // 60° de inclinação: dali em diante o desenho estica
const MISS_FRAC = 0.01;
const STEEP_FRAC = 0.02;
const THIN_FRAC = 0.05;
const MIN_REFINE_MM = 0.3;
const MAX_REFINE_MM = 1;
const REFINE_DIV = 120;
const MAX_CELLS = 4_000_000;

/** Grade 2D (X,Y) sobre os triângulos voltados para +Z: dá o ponto de cima da superfície e a normal suave (média das vizinhas). */
export function surfaceIndex(mesh: Mesh): SurfaceIndex {
  const p = mesh.positions, ix = mesh.indices, nT = ix.length / 3;
  const weld = new Map<string, number>();
  const vid = new Int32Array(p.length / 3);
  for (let i = 0; i < vid.length; i++) {
    const key = `${Math.round(p[i * 3] * 1000)},${Math.round(p[i * 3 + 1] * 1000)},${Math.round(p[i * 3 + 2] * 1000)}`;
    let id = weld.get(key);
    if (id === undefined) weld.set(key, (id = weld.size));
    vid[i] = id;
  }
  const vn = new Float64Array(weld.size * 3);
  const upward: number[] = [];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let t = 0; t < nT; t++) {
    const [a, b, c] = [ix[t * 3] * 3, ix[t * 3 + 1] * 3, ix[t * 3 + 2] * 3];
    const [ux, uy, uz, vx, vy, vz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2], p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const n: [number, number, number] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; // área × normal
    for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) vn[vid[ix[t * 3 + k]] * 3 + d] += n[d];
    if (n[2] <= 1e-9) continue;
    upward.push(t);
    for (const o of [a, b, c]) {
      x0 = Math.min(x0, p[o]); x1 = Math.max(x1, p[o]); y0 = Math.min(y0, p[o + 1]); y1 = Math.max(y1, p[o + 1]);
    }
  }
  const cell = Math.max(0.2, Math.sqrt(((x1 - x0) * (y1 - y0)) / Math.max(1, upward.length)) * 2);
  const gx = Math.max(1, Math.min(2000, Math.ceil((x1 - x0) / cell) + 1)), gy = Math.max(1, Math.min(Math.floor(MAX_CELLS / gx), Math.ceil((y1 - y0) / cell) + 1));
  const cx = (x: number) => Math.min(gx - 1, Math.max(0, Math.floor(((x - x0) / (x1 - x0 || 1)) * (gx - 1))));
  const cy = (y: number) => Math.min(gy - 1, Math.max(0, Math.floor(((y - y0) / (y1 - y0 || 1)) * (gy - 1))));
  const cells: number[][] = Array.from({ length: gx * gy }, () => []);
  for (const t of upward) {
    const o = [ix[t * 3] * 3, ix[t * 3 + 1] * 3, ix[t * 3 + 2] * 3];
    const xs = o.map((i) => p[i]), ys = o.map((i) => p[i + 1]);
    for (let i = cx(Math.min(...xs)); i <= cx(Math.max(...xs)); i++) for (let j = cy(Math.min(...ys)); j <= cy(Math.max(...ys)); j++) cells[j * gx + i].push(t);
  }
  return {
    sample(x, y) {
      if (x < x0 || x > x1 || y < y0 || y > y1) return null;
      let best: SurfaceHit | null = null;
      for (const t of cells[cy(y) * gx + cx(x)]) {
        const [a, b, c] = [ix[t * 3] * 3, ix[t * 3 + 1] * 3, ix[t * 3 + 2] * 3];
        const d = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1]);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((x - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (y - p[a + 1])) / d;
        const l2 = ((p[b] - p[a]) * (y - p[a + 1]) - (x - p[a]) * (p[b + 1] - p[a + 1])) / d;
        const l0 = 1 - l1 - l2;
        if (l0 < -1e-7 || l1 < -1e-7 || l2 < -1e-7) continue;
        const z = l0 * p[a + 2] + l1 * p[b + 2] + l2 * p[c + 2];
        if (best && z <= best.z) continue;
        const n = [0, 0, 0];
        [l0, l1, l2].forEach((l, k) => {
          const v = vid[ix[t * 3 + k]] * 3;
          for (let q = 0; q < 3; q++) n[q] += l * vn[v + q];
        });
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        best = { z, nx: n[0] / len, ny: n[1] / len, nz: Math.max(n[2] / len, 0.05) };
      }
      return best;
    },
  };
}

type Stats = { total: number; steep: number };

/** Extruda `cs` de t0 a t1 (em relação à superfície), afina a malha e deforma cada vértice para a superfície: ponto + t × normal. */
function conform(k: <D extends { delete(): void }>(o: D) => D, cs: CS, t0: number, t1: number, idx: SurfaceIndex, len: number, stats: Stats): Solid {
  const prism = k(k(cs.extrude(t1 - t0)).translate([0, 0, t0]));
  return k(
    k(prism.refineToLength(len)).warpBatch((v, n) => {
      for (let i = 0; i < n; i++) {
        const [x, y, t] = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
        const h = idx.sample(x, y);
        if (!h) continue;
        stats.total++;
        if (h.nz < STEEP_COS) stats.steep++;
        v[i * 3] = x + h.nx * t;
        v[i * 3 + 1] = y + h.ny * t;
        v[i * 3 + 2] = h.z + h.nz * t;
      }
    }),
  );
}

const solidOf = (M: ManifoldToplevel, m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

/**
 * Aplica os decais na peça principal (a única do 1º modelo) pela superfície que está por cima na origem:
 * relevo (parte nova por cor, sem entrar na peça), gravado, embutido (a cor ocupa o que foi tirado) e vazado
 * (corta reto, no eixo do ponto). Mesmo contrato do `applyDecals` das faces planas.
 */
export function applySurfaceDecals(M: ManifoldToplevel, models: Model[], decals: { decal: Decal; regions: DecalRegions }[]): { models: Model[]; warnings: DecalWarning[] } {
  const active = decals.filter((d) => d.decal.visible !== false && d.regions.length);
  if (!models.length || !active.length) return { models, warnings: [] };
  return scoped((k) => {
    const part = models[0].parts[0];
    const idx = surfaceIndex(part.mesh);
    let body = k(solidOf(M, part.mesh));
    const sil = k(body.project());
    const zb = body.boundingBox();
    const warnings: DecalWarning[] = [];
    const added: Part[] = [];
    let n = 0;
    for (const { decal, regions } of active) {
      const ref = k(M.CrossSection.union(regions.map((r) => r.cs))).bounds();
      const placed = regions.map((r) => ({ color: r.color ?? decal.color, cs: k(placeDecal(r.cs, decal, ref)) }));
      const all = k(M.CrossSection.union(placed.map((p) => p.cs)));
      const area = all.area();
      const onPart = placed.map((p) => ({ color: p.color, cs: k(p.cs.intersect(sil)) })).filter((p) => !p.cs.isEmpty());
      const inside = k(M.CrossSection.union(onPart.map((p) => p.cs)));
      if (area - inside.area() > area * MISS_FRAC) warnings.push({ decalId: decal.id, text: "O desenho sai da peça: a parte de fora não imprime. Mova ou diminua." });
      const line = nozzleMm();
      const opened = k(k(inside.offset(-line / 2, "Round")).offset(line / 2, "Round"));
      if (inside.area() - opened.area() > inside.area() * THIN_FRAC) warnings.push({ decalId: decal.id, text: `Tem traço mais fino que ${nozzleText()} mm (o bico): pode sumir na impressão. Aumente o tamanho.` });
      const len = Math.min(MAX_REFINE_MM, Math.max(MIN_REFINE_MM, decal.width / REFINE_DIV));
      const stats: Stats = { total: 0, steep: 0 };
      for (const p of onPart) {
        if (decal.mode === "cut") {
          body = k(body.subtract(k(k(p.cs.extrude(zb.max[2] - zb.min[2] + 4)).translate([0, 0, zb.min[2] - 2]))));
        } else if (decal.mode === "raised") {
          const relief = k(conform(k, p.cs, -EMBED_MM, decal.depth, idx, len, stats).subtract(body));
          if (!relief.isEmpty()) added.push({ name: `Desenho ${++n}`, color: p.color, mesh: toMesh(relief) });
        } else {
          const cutter = conform(k, p.cs, -decal.depth, OUT_MM, idx, len, stats);
          if (decal.mode === "inlay") {
            const fill = k(body.intersect(cutter));
            if (!fill.isEmpty()) added.push({ name: `Desenho ${++n}`, color: p.color, mesh: toMesh(fill) });
          }
          body = k(body.subtract(cutter));
        }
      }
      if (stats.total && stats.steep / stats.total > STEEP_FRAC) warnings.push({ decalId: decal.id, text: "Pega um trecho muito inclinado (mais de 60°): o desenho estica ali. Mova para a parte mais de frente da curva ou diminua." });
    }
    return { models: [{ ...models[0], parts: [{ ...part, mesh: toMesh(body) }, ...added] }, ...models.slice(1)], warnings };
  });
}

/** Contorno visto de cima (+Z) da peça principal, para o gizmo: a caixa fica centrada no ponto escolhido (o desenho nasce nele). */
export function surfaceFace(M: ManifoldToplevel, models: Model[]) {
  const s = solidOf(M, models[0].parts[0].mesh);
  const cs = s.project();
  try {
    const b = cs.bounds();
    const half = (lo: number, hi: number) => Math.max(5, Math.min(Math.abs(lo), Math.abs(hi)));
    const [hx, hy] = [half(b.min[0], b.max[0]), half(b.min[1], b.max[1])];
    return { outline: cs.toPolygons() as [number, number][][], bounds: { min: [-hx, -hy] as [number, number], max: [hx, hy] as [number, number] }, z: 0, part: models[0].parts[0].name };
  } finally {
    cs.delete();
    s.delete();
  }
}
