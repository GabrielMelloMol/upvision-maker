/**
 * Oclusão de uma superfície (#222): quanto de um ponto da peça "olha para dentro" de uma cavidade (o interior de um copo,
 * de uma caneca ou de um vaso). Lança raios num cone em volta da normal contra a malha, numa grade 3D de triângulos:
 * a fração que bate na própria peça é alta no interior e baixa no lado de fora.
 */
type Vec3 = [number, number, number];
export type Occluder = { fraction(p: Vec3, n: Vec3): number };

const GRID_CELLS = 48;
const RAYS = 16;
const WIDE_COS = Math.cos((70 * Math.PI) / 180); // cone largo (até 70° da normal): pega o fundo de uma cavidade funda
const NARROW_COS = Math.cos((22 * Math.PI) / 180); // cone estreito (até 22°): pega a parede de dentro perto da borda, onde o cone largo escapa pela abertura
const NARROW_RAYS = 8;
const OFFSET_MM = 0.05; // sai um fio da superfície para não bater nela mesma
const EPS = 1e-9;

/** Raios espalhados num cone (espiral de Fibonacci) em torno de +Z; viram os do ponto por rotação. */
const cone = (n: number, minCos: number): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const cosT = 1 - ((i + 0.5) / n) * (1 - minCos);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = i * 2.399963229728653; // ângulo de ouro
    return [sinT * Math.cos(phi), sinT * Math.sin(phi), cosT];
  });
const WIDE = cone(RAYS, WIDE_COS);
const NARROW = cone(NARROW_RAYS, NARROW_COS);

function basis(n: Vec3): [Vec3, Vec3] {
  const h: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const t: Vec3 = [h[1] * n[2] - h[2] * n[1], h[2] * n[0] - h[0] * n[2], h[0] * n[1] - h[1] * n[0]];
  const l = Math.hypot(...t) || 1;
  const u: Vec3 = [t[0] / l, t[1] / l, t[2] / l];
  return [u, [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]];
}

export function buildOccluder(pos: Float32Array, tri: Uint32Array): Occluder {
  const nT = tri.length / 3;
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) [lo[a], hi[a]] = [Math.min(lo[a], pos[i + a]), Math.max(hi[a], pos[i + a])];
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const cell = size / GRID_CELLS;
  const dim: Vec3 = [0, 1, 2].map((a) => Math.max(1, Math.ceil((hi[a] - lo[a]) / cell) + 1)) as Vec3;
  const idx = (x: number, y: number, z: number) => (z * dim[1] + y) * dim[0] + x;
  const cellOf = (v: number, a: number) => Math.min(dim[a] - 1, Math.max(0, Math.floor((v - lo[a]) / cell)));
  // grade em formato CSR: conta, soma, preenche
  const counts = new Uint32Array(dim[0] * dim[1] * dim[2] + 1);
  const span = (t: number) => {
    const m = [lo[0], lo[1], lo[2]].map(() => [Infinity, -Infinity]);
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) [m[a][0], m[a][1]] = [Math.min(m[a][0], pos[tri[t * 3 + k] * 3 + a]), Math.max(m[a][1], pos[tri[t * 3 + k] * 3 + a])];
    return m.map((r, a) => [cellOf(r[0], a), cellOf(r[1], a)]);
  };
  const each = (fn: (c: number, t: number) => void) => {
    for (let t = 0; t < nT; t++) {
      const [sx, sy, sz] = span(t);
      for (let z = sz[0]; z <= sz[1]; z++) for (let y = sy[0]; y <= sy[1]; y++) for (let x = sx[0]; x <= sx[1]; x++) fn(idx(x, y, z), t);
    }
  };
  each((c) => counts[c + 1]++);
  for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
  const fill = counts.slice();
  const list = new Uint32Array(counts[counts.length - 1]);
  each((c, t) => (list[fill[c]++] = t));

  /** Algum triângulo cruza o segmento (o, d, comprimento maxT)? Percorre as células da grade em ordem (DDA). */
  const hits = (o: Vec3, d: Vec3, maxT: number): boolean => {
    let [x, y, z] = [cellOf(o[0], 0), cellOf(o[1], 1), cellOf(o[2], 2)];
    const step = d.map((v) => (v > 0 ? 1 : -1));
    const tMax = [0, 1, 2].map((a) => (Math.abs(d[a]) < EPS ? Infinity : ((d[a] > 0 ? lo[a] + ([x, y, z][a] + 1) * cell : lo[a] + [x, y, z][a] * cell) - o[a]) / d[a]));
    const tDelta = [0, 1, 2].map((a) => (Math.abs(d[a]) < EPS ? Infinity : Math.abs(cell / d[a])));
    for (;;) {
      const c = idx(x, y, z);
      for (let q = counts[c]; q < counts[c + 1]; q++) {
        const t = list[q];
        const [a, b, e] = [tri[t * 3] * 3, tri[t * 3 + 1] * 3, tri[t * 3 + 2] * 3];
        const [e1x, e1y, e1z, e2x, e2y, e2z] = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2], pos[e] - pos[a], pos[e + 1] - pos[a + 1], pos[e + 2] - pos[a + 2]];
        const [px, py, pz] = [d[1] * e2z - d[2] * e2y, d[2] * e2x - d[0] * e2z, d[0] * e2y - d[1] * e2x];
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < EPS) continue;
        const inv = 1 / det;
        const [tx, ty, tz] = [o[0] - pos[a], o[1] - pos[a + 1], o[2] - pos[a + 2]];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const [qx, qy, qz] = [ty * e1z - tz * e1y, tz * e1x - tx * e1z, tx * e1y - ty * e1x];
        const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt > EPS && tt < maxT) return true;
      }
      const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      if (tMax[axis] > maxT) return false;
      if (axis === 0) x += step[0];
      else if (axis === 1) y += step[1];
      else z += step[2];
      tMax[axis] += tDelta[axis];
      if (x < 0 || y < 0 || z < 0 || x >= dim[0] || y >= dim[1] || z >= dim[2]) return false;
    }
  };

  return {
    fraction(p, n) {
      const [u, v] = basis(n);
      const o: Vec3 = [p[0] + n[0] * OFFSET_MM, p[1] + n[1] * OFFSET_MM, p[2] + n[2] * OFFSET_MM];
      const share = (rays: Vec3[]) => {
        let hit = 0;
        for (const c of rays) {
          const d: Vec3 = [0, 1, 2].map((a) => u[a] * c[0] + v[a] * c[1] + n[a] * c[2]) as Vec3;
          if (hits(o, d, size)) hit++;
        }
        return hit / rays.length;
      };
      return Math.max(share(WIDE), share(NARROW));
    },
  };
}
