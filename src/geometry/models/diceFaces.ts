/**
 * Dados de RPG (#105), parte pura: vértices de cada sólido, faces (achadas pelo próprio casco convexo, sem tabela de
 * faces), a face de apoio na mesa, a numeração com faces opostas somando n+1 e o centro de cada face para o conteúdo.
 * Sem Manifold: tudo é conta com vetores, então dá para testar sem carregar o motor 3D.
 */
export type V3 = [number, number, number];

export type DieKind = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
export const DIE_KINDS: readonly DieKind[] = ["d4", "d6", "d8", "d10", "d12", "d20"];
export const FACE_COUNT: Record<DieKind, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

const PHI = (1 + Math.sqrt(5)) / 2;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => mul(a, 1 / len(a));

/** Combinações de sinais de (x, y, z). */
const signs = (x: number, y: number, z: number): V3[] => [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz): V3 => [sx * x, sy * y, sz * z])));

/** Vértices do sólido, centrado na origem, em escala qualquer. */
export function dieVertices(kind: DieKind): V3[] {
  switch (kind) {
    case "d4":
      return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    case "d6":
      return signs(1, 1, 1);
    case "d8":
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case "d10": {
      // trapezoedro pentagonal: duas pontas e dois anéis de 5 pontos desencontrados em 36°. As faces são pipas planas
      // quando a altura do anel vale (1 − cos 36°) / (1 + cos 36°) da altura da ponta.
      const c = Math.cos(Math.PI / 5);
      const z0 = (1 - c) / (1 + c);
      const ring = (k: number, z: number): V3 => [Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5), z];
      return [[0, 0, 1], [0, 0, -1], ...Array.from({ length: 5 }, (_, k): V3 => ring(k, z0)), ...Array.from({ length: 5 }, (_, k): V3 => ring(k + 0.5, -z0))];
    }
    case "d12":
      return [...signs(1, 1, 1), ...[-1, 1].flatMap((a) => [-1, 1].flatMap((b): V3[] => [[0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]]))];
    case "d20":
      return [-1, 1].flatMap((a) => [-1, 1].flatMap((b): V3[] => [[0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]]));
  }
}

export type Face = { n: V3; d: number; verts: V3[]; area: number };

/** Faces do sólido convexo: cada plano que deixa todos os pontos de um lado, com os vértices ordenados no sentido anti-horário visto de fora. */
export function polyFaces(P: V3[]): Face[] {
  const scale = Math.max(...P.map(len));
  const eps = 1e-7 * scale;
  const faces: Face[] = [];
  for (let i = 0; i < P.length; i++)
    for (let j = i + 1; j < P.length; j++)
      for (let k = j + 1; k < P.length; k++) {
        let n = cross(sub(P[j], P[i]), sub(P[k], P[i]));
        if (len(n) < eps * eps) continue;
        n = unit(n);
        let d = dot(n, P[i]);
        let above = false;
        let below = false;
        for (const p of P) {
          const s = dot(n, p) - d;
          if (s > eps) above = true;
          else if (s < -eps) below = true;
        }
        if (above && below) continue;
        if (above) {
          n = mul(n, -1);
          d = -d;
        }
        if (faces.some((f) => dot(f.n, n) > 1 - 1e-9 && Math.abs(f.d - d) < eps * 10)) continue;
        const verts = P.filter((p) => Math.abs(dot(n, p) - d) < eps * 10);
        const c = mul(verts.reduce(add, [0, 0, 0] as V3), 1 / verts.length);
        const u = unit(sub(verts[0], c));
        const w = cross(n, u);
        verts.sort((a, b) => Math.atan2(dot(sub(a, c), w), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), w), dot(sub(b, c), u)));
        let area = 0;
        for (let m = 1; m < verts.length - 1; m++) area += len(cross(sub(verts[m], verts[0]), sub(verts[m + 1], verts[0]))) / 2;
        faces.push({ n, d, verts, area });
      }
  return faces;
}

/** Gira os pontos para a 1ª face maior ficar de bruços na mesa (normal para baixo). */
export function restOnFace(P: V3[]): V3[] {
  const faces = polyFaces(P);
  const bottom = faces.reduce((best, f) => (f.area > best.area + 1e-9 ? f : best), faces[0]);
  const target: V3 = [0, 0, -1];
  const v = cross(bottom.n, target);
  const c = dot(bottom.n, target);
  let R: number[][];
  if (c > 1 - 1e-12) R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  else if (c < -1 + 1e-12) R = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
  else {
    const k = 1 / (1 + c);
    R = [
      [1 - k * (v[1] ** 2 + v[2] ** 2), -v[2] + k * v[0] * v[1], v[1] + k * v[0] * v[2]],
      [v[2] + k * v[0] * v[1], 1 - k * (v[0] ** 2 + v[2] ** 2), -v[0] + k * v[1] * v[2]],
      [-v[1] + k * v[0] * v[2], v[0] + k * v[1] * v[2], 1 - k * (v[0] ** 2 + v[1] ** 2)],
    ];
  }
  return P.map((p): V3 => [dot(R[0] as V3, p), dot(R[1] as V3, p), dot(R[2] as V3, p)]);
}

export type DieShape = {
  points: V3[];
  /** Faces na ordem de leitura: de cima para baixo e, na mesma altura, em volta do eixo. */
  faces: Face[];
  /** Raio da esfera que encosta nas faces e da que passa pelos vértices. */
  inradius: number;
  circumradius: number;
  /** Altura do apoio: a face de baixo fica em z = −bottom. */
  bottom: number;
};

/**
 * O sólido na escala pedida, apoiado numa face. `size` é a distância entre faces opostas (no d4, a altura da ponta
 * até a face de baixo), o jeito de falar do tamanho de um dado.
 */
export function dieShape(kind: DieKind, size: number): DieShape {
  const rested = restOnFace(dieVertices(kind));
  const zs = rested.map((p) => p[2]);
  const scale = size / (Math.max(...zs) - Math.min(...zs));
  const points = rested.map((p) => mul(p, scale));
  const faces = polyFaces(points).sort((a, b) => b.n[2] - a.n[2] || (Math.abs(a.n[2] - b.n[2]) < 1e-6 ? Math.atan2(a.n[1], a.n[0]) - Math.atan2(b.n[1], b.n[0]) : 0));
  return { points, faces, inradius: Math.min(...faces.map((f) => f.d)), circumradius: Math.max(...points.map(len)), bottom: -Math.min(...points.map((p) => p[2])) };
}

/** Número de cada face (mesma ordem de `faces`): faces opostas somam o maior mais o menor (7 no d6, 21 no d20). */
export function faceNumbers(faces: Face[], first: number): number[] {
  const n = faces.length;
  const out: (number | null)[] = Array(n).fill(null);
  const opposite = faces.map((f, i) => faces.findIndex((g, j) => j !== i && dot(f.n, g.n) < -0.9999));
  let k = 0;
  faces.forEach((_, i) => {
    if (out[i] !== null) return;
    out[i] = first + k;
    const o = opposite[i];
    if (o >= 0 && out[o] === null) out[o] = first + (n - 1 - k);
    k++;
  });
  return out as number[];
}

export type FaceFrame = {
  /** Eixos da face: x para a direita de quem olha de fora, y para cima (o alto do dado), z para fora. */
  ex: V3;
  ey: V3;
  n: V3;
  /** Onde o conteúdo fica (centro do maior círculo que cabe na face), em coordenadas da face. */
  pole: [number, number];
  /** Raio desse círculo. */
  radius: number;
};

/** Eixos da face e o melhor lugar para o conteúdo (o centro do maior círculo que cabe no polígono). */
export function faceFrame(f: Face): FaceFrame {
  const n = f.n;
  const up: V3 = Math.abs(n[2]) > 0.999 ? [0, 1, 0] : unit(sub([0, 0, 1], mul(n, n[2])));
  const ex = cross(up, n);
  const poly = f.verts.map((v): [number, number] => [dot(v, ex), dot(v, up)]);
  const margin = (x: number, y: number) => {
    let m = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const l = Math.hypot(bx - ax, by - ay);
      m = Math.min(m, ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / l);
    }
    return m;
  };
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  let best: [number, number] = [0, 0];
  let box = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let round = 0; round < 3; round++) {
    const steps = 24;
    let top = -Infinity;
    for (let i = 0; i <= steps; i++)
      for (let j = 0; j <= steps; j++) {
        const x = box[0] + ((box[1] - box[0]) * i) / steps;
        const y = box[2] + ((box[3] - box[2]) * j) / steps;
        const m = margin(x, y);
        if (m > top) {
          top = m;
          best = [x, y];
        }
      }
    const dx = (box[1] - box[0]) / steps;
    const dy = (box[3] - box[2]) / steps;
    box = [best[0] - dx, best[0] + dx, best[1] - dy, best[1] + dy];
  }
  return { ex, ey: up, n, pole: best, radius: Math.max(margin(best[0], best[1]), 0) };
}
