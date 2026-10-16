import type { ManifoldToplevel } from "./manifold";
import type { K } from "./planeCut";
import type { SurfaceMap } from "./surfaceDecal";
import type { Mesh } from "./types";

/**
 * Enrolar (#245): o desenho dá a volta na peça como o rótulo de uma garrafa, sem esticar. A peça é vista como uma superfície de
 * revolução em torno de um eixo (copo, caneca, garrafa, vaso, cone, esfera): o desenho (u, v) em mm vira, na superfície, o arco
 * u ao longo da volta (com o raio de cada linha) e o arco v ao longo do perfil. O tamanho real das letras se mantém na volta toda.
 * Tudo no sistema local da peça: o ponto escolhido na origem, a normal dele em +Z.
 */
type V3 = [number, number, number];
type Pt = [number, number];

const SLAB_STEPS = 3; // rodadas de ajuste do círculo, tirando o que destoa (a alça de uma caneca, por exemplo)
const FIT_WINDOW_MM = 45; // pontos da fatia a menos disso do ponto escolhido entram no ajuste do círculo
const MIN_FIT_POINTS = 12;
const MAX_RADIUS_MM = 2000; // acima disso a superfície é praticamente plana: não há o que enrolar
const FIT_REL_TOL = 0.05; // erro do círculo em fração do raio
const PROFILE_STEP_MM = 0.4;
const PROFILE_JUMP_MM = 2.5; // um degrau maior que isso (borda, ombro vivo) termina o perfil
const MIN_ROW_RADIUS = 0.05; // linha mais fina que isso (fração do raio do ponto) é o polo: não enrola ali
const AXIS_TILT_MIN = 0.3;
const TWO_PI = Math.PI * 2;
const WRAP_FULL = 0.98; // acima disso do comprimento da volta o desenho já encosta nele mesmo

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Triângulos da malha em coordenadas (θ, z) em torno do eixo, numa grade 2D; devolve o raio e a normal na posição pedida. */
type Hit = { r: number; n: V3 };
type RevolveIndex = { at(theta: number, z: number): Hit[] };

type Circle = { cx: number; cy: number; R: number; rms: number };

/** Círculo pelos mínimos quadrados (Kåsa) sobre pontos do plano. */
function fitCircle(pts: Pt[]): Circle | null {
  if (pts.length < 3) return null;
  let [sx, sy, sxx, syy, sxy, sxz, syz, sz] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  const n = pts.length;
  // resolve [sxx sxy sx; sxy syy sy; sx sy n] · [A B C] = [sxz syz sz]
  const m = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-9) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  const [A, B, C] = [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  const [cx, cy] = [A / 2, B / 2];
  const R2 = C + cx * cx + cy * cy;
  if (!(R2 > 0)) return null;
  const R = Math.sqrt(R2);
  const rms = Math.sqrt(pts.reduce((s, [x, y]) => s + (Math.hypot(x - cx, y - cy) - R) ** 2, 0) / n);
  return { cx, cy, R, rms };
}

const FACING_MIN = 0.35; // só entram na fatia as faces que olham para o mesmo lado do ponto escolhido (a parede de dentro de um copo fica de fora)
const SLICE_NUDGE_MM = 3.7e-4; // a fatia sai um fio fora do plano: um anel de vértices exatamente nele não pode zerar as travessias
const IN_PLANE_MIN = 0.2;
const CHECK_OFFSETS_MM = [-16, -8, 8, 16];
const CHECK_MIN_POINTS = 8;
const CHECK_FRACTION = 0.7; // face quase paralela à fatia (tampa) não diz nada sobre a volta

/** Pontos onde a malha cruza o plano z' = 0 (perpendicular ao eixo, pelo ponto escolhido), já em (e1, e2), só das faces que olham como o ponto. */
function sliceThroughAnchor(mesh: Mesh, a: V3, e1: V3, e2: V3, offset = 0): Pt[] {
  const { positions: p, indices: ix } = mesh;
  const out: Pt[] = [];
  const d = (i: number) => p[i * 3] * a[0] + p[i * 3 + 1] * a[1] + p[i * 3 + 2] * a[2] - offset - SLICE_NUDGE_MM;
  for (let t = 0; t < ix.length; t += 3) {
    const [A, B, C2] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
    const [ux, uy, uz, vx, vy, vz] = [p[B] - p[A], p[B + 1] - p[A + 1], p[B + 2] - p[A + 2], p[C2] - p[A], p[C2 + 1] - p[A + 1], p[C2 + 2] - p[A + 2]];
    const tn: V3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const inPlane = Math.hypot(dot(tn, e1), dot(tn, e2));
    if (inPlane < IN_PLANE_MIN * Math.hypot(...tn) || dot(tn, e1) < FACING_MIN * inPlane) continue;
    for (let e = 0; e < 3; e++) {
      const [i, j] = [ix[t + e], ix[t + ((e + 1) % 3)]];
      const [di, dj] = [d(i), d(j)];
      if (di * dj >= 0 || di === dj) continue;
      const f = di / (di - dj);
      const q: V3 = [p[i * 3] + (p[j * 3] - p[i * 3]) * f, p[i * 3 + 1] + (p[j * 3 + 1] - p[i * 3 + 1]) * f, p[i * 3 + 2] + (p[j * 3 + 2] - p[i * 3 + 2]) * f];
      const pt: Pt = [dot(q, e1), dot(q, e2)];
      if (Math.hypot(pt[0], pt[1]) <= FIT_WINDOW_MM) out.push(pt);
    }
  }
  return out;
}

export type WrapFit = {
  /** O eixo (a), o raio do ponto (e1) e a volta (e2) do desenho, em coordenadas locais. */
  a: V3;
  e1: V3;
  e2: V3;
  /** Centro do círculo no plano (e1, e2) e o raio dele no ponto escolhido. */
  cx: number;
  cy: number;
  R: number;
  /** +1 / −1: o ângulo cresce (ou diminui) quando o desenho anda para +u. */
  sigma: 1 | -1;
  phi0: number;
  index: RevolveIndex;
  /** Perfil ao longo do eixo a partir do ponto: altura, raio e comprimento do arco. */
  profile: { z: number[]; r: number[]; s: number[] };
};

export type WrapResult = { fit: WrapFit } | { fail: string };

/**
 * Ajusta o eixo de revolução em torno do ponto escolhido (na origem do quadro local). `axis` = direção do eixo em coordenadas
 * locais. Falha com o motivo (em português) quando a superfície ali não é redonda em torno desse eixo.
 */
export function fitWrap(mesh: Mesh, axis: V3): WrapResult {
  let a = unit(axis);
  if (a[1] < -1e-6 || (Math.abs(a[1]) <= 1e-6 && a[0] < 0)) a = [-a[0], -a[1], -a[2]]; // "para cima" no quadro do desenho
  const out: V3 = [0, 0, 1];
  const o1 = [out[0] - dot(out, a) * a[0], out[1] - dot(out, a) * a[1], out[2] - dot(out, a) * a[2]] as V3;
  if (Math.hypot(...o1) < AXIS_TILT_MIN) return { fail: "O eixo escolhido aponta para o ponto: escolha outro eixo." };
  const e1 = unit(o1);
  const e2 = cross(a, e1);
  let pts = sliceThroughAnchor(mesh, a, e1, e2);
  if (pts.length < MIN_FIT_POINTS) return { fail: "Não achei a volta da peça neste ponto com o eixo escolhido (superfície plana ou o eixo está errado)." };
  let c = fitCircle(pts);
  for (let i = 0; i < SLAB_STEPS && c; i++) {
    const tol = Math.max(0.5, FIT_REL_TOL * c.R);
    const keep = pts.filter(([x, y]) => Math.abs(Math.hypot(x - c!.cx, y - c!.cy) - c!.R) <= tol);
    if (keep.length < MIN_FIT_POINTS) break;
    pts = keep;
    c = fitCircle(pts);
  }
  if (!c || c.R > MAX_RADIUS_MM || c.R < 1) return { fail: "A superfície neste ponto é plana (ou reta nesse eixo): não há o que enrolar. Use Projetar." };
  if (c.rms > FIT_REL_TOL * c.R + 0.2) return { fail: "A superfície neste ponto não é redonda em torno desse eixo: o Enrolar só serve para copo, garrafa, vaso, cone e esfera. Use Projetar, ou escolha outro eixo." };
  if (Math.abs(Math.hypot(c.cx, c.cy) - c.R) > Math.max(0.6, 0.03 * c.R)) return { fail: "O ponto escolhido não está na volta da peça: clique de novo na superfície." };
  const phi0 = Math.atan2(0 - c.cy, 0 - c.cx);
  const sigma: 1 | -1 = Math.cos(phi0) >= 0 ? 1 : -1; // a tangente no ponto aponta para +e2 quando cos(φ0) > 0
  const index = buildRevolveIndex(mesh, a, e1, e2, c.cx, c.cy, phi0, sigma);
  const profile = buildProfile(index, c.R);
  if (profile.z.length < 3) return { fail: "Não consegui seguir a peça para cima e para baixo a partir deste ponto." };
  if (!roundAlongAxis(mesh, a, e1, e2, c.cx, c.cy, profile)) return { fail: "A peça não é redonda em torno desse eixo (as outras alturas não fecham o mesmo círculo): escolha outro eixo. O Enrolar só serve para copo, garrafa, vaso, cone e esfera." };
  return { fit: { a, e1, e2, cx: c.cx, cy: c.cy, R: c.R, sigma, phi0, index, profile } };
}

/** As fatias acima e abaixo do ponto também são círculos em torno do mesmo centro, com o raio do perfil? Pega o eixo errado (uma garrafa "deitada em X"). */
function roundAlongAxis(mesh: Mesh, a: V3, e1: V3, e2: V3, cx: number, cy: number, profile: WrapFit["profile"]): boolean {
  let tested = 0, bad = 0;
  for (const off of CHECK_OFFSETS_MM) {
    if (off < profile.z[0] || off > profile.z[profile.z.length - 1]) continue;
    const pts = sliceThroughAnchor(mesh, a, e1, e2, off);
    if (pts.length < CHECK_MIN_POINTS) continue;
    let k = 0;
    while (k < profile.z.length - 1 && profile.z[k + 1] < off) k++;
    const r = profile.r[k];
    const tol = Math.max(0.5, FIT_REL_TOL * 1.6 * r);
    const good = pts.filter(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= tol).length;
    tested++;
    if (good / pts.length < CHECK_FRACTION) bad++;
  }
  return tested === 0 || bad * 2 <= tested; // metade ou menos das fatias fora do círculo ainda passa (borda, ombro)
}

function buildRevolveIndex(mesh: Mesh, a: V3, e1: V3, e2: V3, cx: number, cy: number, phi0: number, sigma: 1 | -1): RevolveIndex {
  const { positions: p, indices: ix } = mesh;
  const nV = p.length / 3;
  // vértice → (θ, z, r) e normal de vértice (média das faces, ponderada pela área)
  const th = new Float64Array(nV), zz = new Float64Array(nV), rr = new Float64Array(nV);
  const nor = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const q: V3 = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
    const [dx, dy] = [dot(q, e1) - cx, dot(q, e2) - cy];
    zz[i] = dot(q, a);
    rr[i] = Math.hypot(dx, dy);
    th[i] = sigma * Math.atan2(Math.sin(Math.atan2(dy, dx) - phi0), Math.cos(Math.atan2(dy, dx) - phi0)); // (−π, π] em torno do ponto
  }
  for (let t = 0; t < ix.length; t += 3) {
    const [A, B, C] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
    const [ux, uy, uz, vx, vy, vz] = [p[B] - p[A], p[B + 1] - p[A + 1], p[B + 2] - p[A + 2], p[C] - p[A], p[C + 1] - p[A + 1], p[C + 2] - p[A + 2]];
    const f = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const i of [ix[t], ix[t + 1], ix[t + 2]]) for (let d = 0; d < 3; d++) nor[i * 3 + d] += f[d];
  }
  // triângulos no plano (θ, z); os que cruzam a emenda (θ = ±π) entram também deslocados de 2π
  type Tri = { v: [number, number, number]; t: [number, number, number] };
  const tris: Tri[] = [];
  let [zMin, zMax] = [Infinity, -Infinity];
  for (let t = 0; t < ix.length; t += 3) {
    const v: [number, number, number] = [ix[t], ix[t + 1], ix[t + 2]];
    if (v.some((i) => rr[i] < 1e-3)) continue; // passa pelo eixo (tampa): sem ângulo
    const ts = v.map((i) => th[i]) as [number, number, number];
    const shifts = Math.max(...ts) - Math.min(...ts) > Math.PI ? [ts.map((x) => (x < 0 ? x + TWO_PI : x)), ts.map((x) => (x > 0 ? x - TWO_PI : x))] : [ts];
    for (const s of shifts) tris.push({ v, t: s as [number, number, number] });
    for (const i of v) [zMin, zMax] = [Math.min(zMin, zz[i]), Math.max(zMax, zz[i])];
  }
  const NG = Math.max(16, Math.min(512, Math.ceil(Math.sqrt(tris.length / 2))));
  const [gx, gy] = [NG, NG];
  const zSpan = zMax - zMin || 1;
  const cellOf = (th0: number) => Math.min(gx - 1, Math.max(0, Math.floor(((th0 + Math.PI * 1.001) / (TWO_PI * 1.002)) * gx)));
  const cellZ = (z: number) => Math.min(gy - 1, Math.max(0, Math.floor(((z - zMin) / zSpan) * gy)));
  const cells: number[][] = Array.from({ length: gx * gy }, () => []);
  tris.forEach((tr, ti) => {
    const zs = tr.v.map((i) => zz[i]);
    const [t0, t1, z0, z1] = [Math.min(...tr.t), Math.max(...tr.t), Math.min(...zs), Math.max(...zs)];
    if (t1 < -Math.PI * 1.001 || t0 > Math.PI * 1.001) return;
    for (let x = cellOf(t0); x <= cellOf(t1); x++) for (let y = cellZ(z0); y <= cellZ(z1); y++) cells[y * gx + x].push(ti);
  });
  return {
    at(theta, z) {
      if (z < zMin || z > zMax || Math.abs(theta) > Math.PI * 1.001) return [];
      const hits: Hit[] = [];
      for (const ti of cells[cellZ(z) * gx + cellOf(theta)]) {
        const { v, t } = tris[ti];
        const [z0, z1, z2] = [zz[v[0]], zz[v[1]], zz[v[2]]];
        const d = (t[1] - t[0]) * (z2 - z0) - (t[2] - t[0]) * (z1 - z0);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((theta - t[0]) * (z2 - z0) - (t[2] - t[0]) * (z - z0)) / d;
        const l2 = ((t[1] - t[0]) * (z - z0) - (theta - t[0]) * (z1 - z0)) / d;
        const l0 = 1 - l1 - l2;
        if (l0 < -1e-7 || l1 < -1e-7 || l2 < -1e-7) continue;
        const r = l0 * rr[v[0]] + l1 * rr[v[1]] + l2 * rr[v[2]];
        const n: V3 = [0, 1, 2].map((q) => l0 * nor[v[0] * 3 + q] + l1 * nor[v[1] * 3 + q] + l2 * nor[v[2] * 3 + q]) as V3;
        hits.push({ r, n: unit(n) });
      }
      return hits;
    },
  };
}

/** Perfil (raio por altura) ao longo da linha do ponto escolhido, subindo e descendo enquanto a peça continua; s = comprimento do arco. */
function buildProfile(index: RevolveIndex, R: number): WrapFit["profile"] {
  const walk = (dir: 1 | -1) => {
    const out: { z: number; r: number }[] = [];
    let prev = R;
    for (let i = 1; i < 4000; i++) {
      const z = dir * i * PROFILE_STEP_MM;
      const hits = index.at(0, z);
      if (!hits.length) break;
      const best = hits.reduce((b, h) => (Math.abs(h.r - prev) < Math.abs(b.r - prev) ? h : b));
      if (Math.abs(best.r - prev) > PROFILE_JUMP_MM) break;
      out.push({ z, r: best.r });
      prev = best.r;
    }
    return out;
  };
  const up = walk(1), down = walk(-1);
  const zs = [...down.reverse(), { z: 0, r: R }, ...up];
  const s: number[] = new Array(zs.length).fill(0);
  const i0 = down.length;
  for (let i = i0 + 1; i < zs.length; i++) s[i] = s[i - 1] + Math.hypot(zs[i].z - zs[i - 1].z, zs[i].r - zs[i - 1].r);
  for (let i = i0 - 1; i >= 0; i--) s[i] = s[i + 1] - Math.hypot(zs[i + 1].z - zs[i].z, zs[i + 1].r - zs[i].r);
  return { z: zs.map((q) => q.z), r: zs.map((q) => q.r), s };
}

/** Altura e raio de uma linha a `v` mm de arco do ponto (interpola o perfil); null fora do perfil. */
function rowAt(fit: WrapFit, v: number): { z: number; r: number } | null {
  const { z, r, s } = fit.profile;
  if (v < s[0] || v > s[s.length - 1]) return null;
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid] <= v) lo = mid;
    else hi = mid;
  }
  const f = s[hi] === s[lo] ? 0 : (v - s[lo]) / (s[hi] - s[lo]);
  return { z: z[lo] + (z[hi] - z[lo]) * f, r: r[lo] + (r[hi] - r[lo]) * f };
}

/** Faixa útil do desenho: u de −π a π raios do ponto, v do começo ao fim do perfil. */
function wrapDomain(fit: WrapFit) {
  const s = fit.profile.s;
  return { u: Math.PI * fit.R * 0.999, v0: s[0], v1: s[s.length - 1] };
}

export function wrapMap(M: ManifoldToplevel, fit: WrapFit): SurfaceMap {
  const d = wrapDomain(fit);
  const c3: V3 = [fit.e1[0] * fit.cx + fit.e2[0] * fit.cy, fit.e1[1] * fit.cx + fit.e2[1] * fit.cy, fit.e1[2] * fit.cx + fit.e2[2] * fit.cy];
  return {
    sample(u, v) {
      const row = rowAt(fit, v);
      if (!row) return null;
      const rho = Math.max(row.r, MIN_ROW_RADIUS * fit.R);
      const theta = u / rho; // o arco u tem o mesmo comprimento em toda linha
      const hits = fit.index.at(theta, row.z);
      if (!hits.length) return null;
      const h = hits.reduce((b, x) => (Math.abs(x.r - row.r) < Math.abs(b.r - row.r) ? x : b));
      const phi = fit.phi0 + fit.sigma * theta;
      const [cp, sp] = [Math.cos(phi), Math.sin(phi)];
      const pos: V3 = [0, 1, 2].map((q) => c3[q] + fit.a[q] * row.z + h.r * (cp * fit.e1[q] + sp * fit.e2[q])) as V3;
      return { pos, n: h.n, steep: false };
    },
    domain: (k: K) => k(M.CrossSection.square([2 * d.u, d.v1 - d.v0]).translate([-d.u, d.v0])),
    steepText: null,
    check: (b) => (b.max[0] - b.min[0] > wrapLimit(fit) * WRAP_FULL ? `O desenho é mais largo que a volta da peça (${Math.round(wrapLimit(fit))} mm): as pontas se encontram. Diminua.` : null),
    outsideText: "O desenho passa do fim da peça (em cima, embaixo ou além da volta): a parte de fora não imprime. Mova ou diminua.",
  };
}

/** Largura do desenho em volta, para o aviso de "dá mais que a volta". */
function wrapLimit(fit: WrapFit): number {
  return 2 * Math.PI * fit.R;
}


/** Contorno do desenho no gizmo: a faixa útil (volta × perfil), com a caixa centrada no ponto escolhido para o desenho nascer nele. */
export function wrapFace(fit: WrapFit, part: string) {
  const d = wrapDomain(fit);
  const half = (lo: number, hi: number) => Math.max(5, Math.min(Math.abs(lo), Math.abs(hi)));
  const [hu, hv] = [d.u, half(d.v0, d.v1)];
  return {
    outline: [[[-d.u, d.v0], [d.u, d.v0], [d.u, d.v1], [-d.u, d.v1]]] as [number, number][][],
    bounds: { min: [-hu, -hv] as [number, number], max: [hu, hv] as [number, number] },
    z: 0,
    part,
  };
}
