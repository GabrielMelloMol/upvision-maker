import type { CS, Solid } from "../manifold";
import type { Mesh } from "../types";
import { domeArc, type DomeGeo } from "./dome";

type K = <D extends { delete(): void }>(o: D) => D;

/** Junta malhas fechadas separadas numa só (as duas metades da caixa). */
export function mergeMeshes(list: Mesh[]): Mesh {
  const positions = new Float32Array(list.reduce((n, m) => n + m.positions.length, 0));
  const indices = new Uint32Array(list.reduce((n, m) => n + m.indices.length, 0));
  let po = 0, io = 0, base = 0;
  for (const m of list) {
    positions.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + base;
    po += m.positions.length;
    io += m.indices.length;
    base += m.positions.length / 3;
  }
  return { positions, indices };
}

const REFINE_MM = 1.2; // os triângulos da tela plana são cortados até este tamanho para a curva sair lisa
const NEAR_EDGE = 1e-4;

type Seg = { ax: number; ay: number; bx: number; by: number };

/** Distância e ponto mais próximo do contorno, e se o ponto está dentro (regra par-ímpar). */
function boundaryQuery(segs: Seg[]) {
  return (x: number, y: number) => {
    let best = Infinity, qx = 0, qy = 0, inside = false, bs = 0, bt = 0;
    for (let si = 0; si < segs.length; si++) {
      const { ax, ay, bx, by } = segs[si];
      if (ay > y !== by > y && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + t * dx, py = ay + t * dy;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < best) {
        best = d;
        qx = px;
        qy = py;
        bs = si;
        bt = t;
      }
    }
    return { d: Math.sqrt(best), qx, qy, inside, seg: bs, t: bt };
  };
}

const RIDGE_STEP = 0.3;
const RIDGE_SLACK = 0.2;
const PIECE_MM = 1;

/**
 * Para cada pedaço (≤ 1 mm) do contorno, até onde o recuo para dentro vai antes de encontrar o eixo medial (a "crista"
 * do domo naquele ponto). Cada lado de um trecho estreito (a ponta do coração) tem a sua crista, e é nela que as duas
 * metades da tela se encontram: sem isso sobra uma fresta ao longo do eixo.
 */
function ridgeTable(segs: Seg[], query: ReturnType<typeof boundaryQuery>, cap: number): Float32Array[] {
  return segs.map(({ ax, ay, bx, by }) => {
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    const pieces = Math.max(1, Math.ceil(len / PIECE_MM));
    const tx = (bx - ax) / len, ty = (by - ay) / len;
    let nx = -ty, ny = tx; // normal; se aponta para fora, inverte
    const probe = query(ax + (bx - ax) / 2 + nx * 0.05, ay + (by - ay) / 2 + ny * 0.05);
    if (!probe.inside) {
      nx = -nx;
      ny = -ny;
    }
    const out = new Float32Array(pieces);
    for (let i = 0; i < pieces; i++) {
      const u = (i + 0.5) / pieces;
      const qx = ax + (bx - ax) * u, qy = ay + (by - ay) * u;
      let t = RIDGE_STEP;
      for (; t < cap; t += RIDGE_STEP) {
        const r = query(qx + nx * t, qy + ny * t);
        if (!r.inside || r.d < t - RIDGE_SLACK) break;
      }
      out[i] = Math.max(RIDGE_STEP, Math.min(cap, t - RIDGE_STEP));
    }
    return out;
  });
}

/**
 * Deforma uma tela plana (sólido com a base em z = 0) sobre o domo, como a termoformagem faz: cada ponto da tela a `f` mm
 * da borda interna (o limite do domo) vai para onde o perfil está a `f × (comprimento do perfil até a crista ÷ distância
 * até a crista)` da borda, e a espessura segue a normal da superfície. A "crista" é o eixo medial local: nos dois lados
 * de um trecho estreito a tela chega nela e se encontra, sem fresta. A borda de fora do domo fica plana. A superfície é
 * lisa (a tela é subdividida antes), com a malha e o desenho acompanhando. `blend` (0 a 1) deforma só até essa fração, para os quadros da prensagem.
 */
export function warpOntoDome(flat: Solid, inner: CS, g: DomeGeo, k: K, blend = 1): Solid {
  const segs: Seg[] = inner.toPolygons().flatMap((ring) => ring.map(([ax, ay], i) => ({ ax, ay, bx: ring[(i + 1) % ring.length][0], by: ring[(i + 1) % ring.length][1] })));
  const query = boundaryQuery(segs);
  const ridges = ridgeTable(segs, query, g.L);
  const { rho, z: zs, arc } = domeArc(g);
  const total = arc[arc.length - 1];
  const arcAtRho = (r: number): number => {
    let lo = 1, hi = rho.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rho[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const u = (r - rho[lo - 1]) / Math.max(1e-9, rho[lo] - rho[lo - 1]);
    return arc[lo - 1] + u * (arc[lo] - arc[lo - 1]);
  };
  const fine = k(flat.refineToLength(REFINE_MM));
  return k(
    fine.warpBatch((verts, count) => {
      for (let v = 0; v < count; v++) {
        const o = v * 3;
        const x = verts[o], y = verts[o + 1], zf = verts[o + 2];
        const { d, qx, qy, inside, seg, t } = query(x, y);
        if (!inside || d < NEAR_EDGE) continue;
        const pieces = ridges[seg];
        const R = pieces[Math.min(pieces.length - 1, Math.floor(t * pieces.length))];
        const f = Math.min(d, R);
        const fromEdge = (f * (total - arcAtRho(g.L - R))) / R; // comprimento de arco da borda até o ponto
        const target = total - fromEdge; // contado desde o topo
        let lo = 1, hi = arc.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (arc[mid] < target) lo = mid + 1;
          else hi = mid;
        }
        const u = (target - arc[lo - 1]) / Math.max(1e-9, arc[lo] - arc[lo - 1]);
        const r = rho[lo - 1] + u * (rho[lo] - rho[lo - 1]);
        const zd = zs[lo - 1] + u * (zs[lo] - zs[lo - 1]);
        const s = g.L - r;
        const dr = rho[lo - 1] - rho[lo]; // negativo: o perfil vai do topo (ρ = 0) à borda (ρ = L)
        const slope = Math.abs(dr) < 1e-9 ? 1e9 : (zs[lo] - zs[lo - 1]) / dr; // dh/ds, positiva
        const nx = (x - qx) / d, ny = (y - qy) / d; // para dentro
        const inv = 1 / Math.sqrt(1 + slope * slope);
        verts[o] = x + blend * (qx + nx * s - slope * nx * inv * zf - x);
        verts[o + 1] = y + blend * (qy + ny * s - slope * ny * inv * zf - y);
        verts[o + 2] = zf + blend * (zd + inv * zf - zf);
      }
    }),
  );
}
