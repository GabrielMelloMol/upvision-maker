import type { CS, Solid } from "../manifold";
import type { Mesh } from "../types";
import { domeArc, stretchOf, type DomeGeo } from "./dome";

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
    let best = Infinity, qx = 0, qy = 0, inside = false;
    for (const { ax, ay, bx, by } of segs) {
      if (ay > y !== by > y && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + t * dx, py = ay + t * dy;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < best) {
        best = d;
        qx = px;
        qy = py;
      }
    }
    return { d: Math.sqrt(best), qx, qy, inside };
  };
}

/**
 * Deforma uma tela plana (sólido com a base em z = 0) sobre o domo, como a termoformagem faz: cada ponto da tela a `f` mm
 * da borda interna (o limite do domo) vai para onde o perfil está a `S × (L − f)` de comprimento de arco do topo, e a
 * espessura segue a normal da superfície. A borda de fora do domo fica plana. A superfície é lisa (a tela é subdividida
 * antes), com a malha e o desenho acompanhando.
 */
export function warpOntoDome(flat: Solid, inner: CS, g: DomeGeo, k: K): Solid {
  const segs: Seg[] = inner.toPolygons().flatMap((ring) => ring.map(([ax, ay], i) => ({ ax, ay, bx: ring[(i + 1) % ring.length][0], by: ring[(i + 1) % ring.length][1] })));
  const query = boundaryQuery(segs);
  const { rho, z: zs, arc } = domeArc(g);
  const { S } = stretchOf(g);
  const total = arc[arc.length - 1];
  const fine = k(flat.refineToLength(REFINE_MM));
  return k(
    fine.warpBatch((verts, count) => {
      for (let v = 0; v < count; v++) {
        const o = v * 3;
        const x = verts[o], y = verts[o + 1], zf = verts[o + 2];
        const { d, qx, qy, inside } = query(x, y);
        if (!inside || d < NEAR_EDGE) continue;
        const f = Math.min(d, g.L);
        const a = Math.min(total, S * (g.L - f));
        let lo = 1, hi = arc.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (arc[mid] < a) lo = mid + 1;
          else hi = mid;
        }
        const u = (a - arc[lo - 1]) / Math.max(1e-9, arc[lo] - arc[lo - 1]);
        const r = rho[lo - 1] + u * (rho[lo] - rho[lo - 1]);
        const zd = zs[lo - 1] + u * (zs[lo] - zs[lo - 1]);
        const s = g.L - r;
        const dr = rho[lo - 1] - rho[lo]; // negativo: o perfil vai do topo (ρ = 0) à borda (ρ = L)
        const slope = Math.abs(dr) < 1e-9 ? 1e9 : (zs[lo] - zs[lo - 1]) / dr; // dh/ds, positiva
        const nx = (x - qx) / d, ny = (y - qy) / d; // para dentro
        const inv = 1 / Math.sqrt(1 + slope * slope);
        verts[o] = qx + nx * s - slope * nx * inv * zf;
        verts[o + 1] = qy + ny * s - slope * ny * inv * zf;
        verts[o + 2] = zd + inv * zf;
      }
    }),
  );
}
