import type { Mesh, Model } from "./types";
import { read3mf, type Read3mf } from "./threemfRead";
import { readBinaryStl } from "./stlRead";

/**
 * Modelo próprio (#113): leitura de STL/3MF como `Model`, faces planas para escolher onde pôr o decal e o
 * movimento que põe a face escolhida virada para cima (para o motor de decais de cima da peça servir em qualquer face).
 */
export type Vec3 = [number, number, number];

const COPLANAR_COS = Math.cos((1 * Math.PI) / 180);
const COPLANAR_MM = 0.05;
const MIN_FACE_MM2 = 20;
const MAX_FACES = 60;
const EXTREME_MM = 0.05;
const PICK_NORMAL_COS = 0.98;
const PICK_PLANE_MM = 0.5;
const PALETTE = ["#d4d4d8", "#d6262e", "#2563eb", "#facc15", "#22a04b", "#7e3fd6", "#f97316", "#1c1c1e"];

export type PlanarFace = {
  /** Estável para a mesma malha: parte, normal e posição do plano. */
  id: string;
  part: number;
  normal: Vec3;
  /** Distância do plano à origem ao longo da normal. */
  offset: number;
  area: number;
  centroid: Vec3;
  triangles: number[];
  /** Nenhum ponto da peça passa deste plano para fora (dá para pôr o decal por cima). */
  extreme: boolean;
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function vertex(m: Mesh, i: number): Vec3 {
  return [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
}
const tri = (m: Mesh, t: number): [Vec3, Vec3, Vec3] => [vertex(m, m.indices[t * 3]), vertex(m, m.indices[t * 3 + 1]), vertex(m, m.indices[t * 3 + 2])];


/** STL em texto ("solid … facet … vertex x y z"): vértices iguais unidos, como o binário. */
export function readAsciiStl(text: string): Mesh {
  const pos: number[] = [];
  const index = new Map<string, number>();
  const idx: number[] = [];
  for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)) {
    const v = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!v.every(Number.isFinite)) throw new Error("STL com números inválidos.");
    const key = v.join(",");
    let i = index.get(key);
    if (i === undefined) {
      i = pos.length / 3;
      index.set(key, i);
      pos.push(...v);
    }
    idx.push(i);
  }
  if (!idx.length || idx.length % 3) throw new Error("STL vazio ou inválido.");
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

const isAsciiStl = (b: Uint8Array) => {
  const head = new TextDecoder().decode(b.subarray(0, 5)).toLowerCase() === "solid";
  const binaryLength = b.byteLength >= 84 ? 84 + new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(80, true) * 50 : -1;
  return head && binaryLength !== b.byteLength;
};

/** STL binário ou 3MF → modelo (cada parte do 3MF na cor do filamento). */
export function readOwnFile(bytes: Uint8Array, fileName: string): Model {
  if (/\.stl$/i.test(fileName)) return { name: fileName.replace(/\.[^.]+$/, ""), parts: [{ name: "Peça", color: PALETTE[0], mesh: isAsciiStl(bytes) ? readAsciiStl(new TextDecoder().decode(bytes)) : readBinaryStl(bytes) }] };
  if (/\.3mf$/i.test(fileName)) return modelFrom3mf(read3mf(bytes), fileName);
  throw new Error("Envie um arquivo .stl ou .3mf.");
}

/** 3MF lido → modelo com uma parte por parte do arquivo, na cor do filamento (a pintura por cor não é lida aqui). */
export function modelFrom3mf(file: Read3mf, fileName: string): Model {
  const name = fileName.replace(/\.[^.]+$/, "");
  const parts = file.objects.flatMap((o) => o.parts.map((p) => ({ name: p.name || o.name || "Peça", color: file.filamentColors[p.extruder - 1] ?? PALETTE[(Math.max(p.extruder, 1) - 1) % PALETTE.length], mesh: p.mesh })));
  if (!parts.length) throw new Error("O 3MF não tem nenhuma peça.");
  return { name, parts };
}

/** Faces planas grandes de todas as partes (triângulos vizinhos e coplanares juntos), da maior para a menor. */
export function planarFaces(model: Model): PlanarFace[] {
  const found: PlanarFace[] = [];
  model.parts.forEach((part, pi) => {
    const m = part.mesh;
    const n = m.indices.length / 3;
    const normals: (Vec3 | null)[] = [];
    const areas: number[] = [];
    for (let t = 0; t < n; t++) {
      const [a, b, c] = tri(m, t);
      const cr = cross(sub(b, a), sub(c, a));
      const len = Math.hypot(...cr);
      areas.push(len / 2);
      normals.push(len > 1e-9 ? [cr[0] / len, cr[1] / len, cr[2] / len] : null);
    }
    const planeD = (t: number) => dot(normals[t]!, tri(m, t)[0]);
    // vizinhos por aresta
    const edges = new Map<string, number[]>();
    for (let t = 0; t < n; t++)
      for (let k = 0; k < 3; k++) {
        const i = m.indices[t * 3 + k], j = m.indices[t * 3 + ((k + 1) % 3)];
        const key = i < j ? `${i}_${j}` : `${j}_${i}`;
        (edges.get(key) ?? edges.set(key, []).get(key)!).push(t);
      }
    const group = new Int32Array(n).fill(-1);
    for (let seed = 0; seed < n; seed++) {
      if (group[seed] !== -1 || !normals[seed]) continue;
      const stack = [seed];
      group[seed] = seed;
      const members: number[] = [];
      while (stack.length) {
        const t = stack.pop()!;
        members.push(t);
        for (let k = 0; k < 3; k++) {
          const i = m.indices[t * 3 + k], j = m.indices[t * 3 + ((k + 1) % 3)];
          for (const u of edges.get(i < j ? `${i}_${j}` : `${j}_${i}`) ?? []) {
            if (group[u] !== -1 || !normals[u]) continue;
            if (dot(normals[u]!, normals[seed]!) < COPLANAR_COS || Math.abs(planeD(u) - planeD(seed)) > COPLANAR_MM) continue;
            group[u] = seed;
            stack.push(u);
          }
        }
      }
      const area = members.reduce((s, t) => s + areas[t], 0);
      if (area < MIN_FACE_MM2) continue;
      const centroid: Vec3 = [0, 0, 0];
      for (const t of members) {
        const [a, b, c] = tri(m, t);
        for (let k = 0; k < 3; k++) centroid[k] += (areas[t] * (a[k] + b[k] + c[k])) / 3;
      }
      const c = centroid.map((v) => v / area) as Vec3;
      const normal = normals[seed]!;
      const offset = dot(normal, c);
      const id = `${pi}:${normal.map((v) => v.toFixed(3)).join(",")}:${offset.toFixed(2)}`;
      found.push({ id, part: pi, normal, offset, area, centroid: c, triangles: members, extreme: true });
    }
  });
  const faces = found.sort((a, b) => b.area - a.area).slice(0, MAX_FACES);
  // "para fora": nada da peça (nem das outras partes) passa do plano
  return faces.map((f) => {
    let top = -Infinity;
    for (const p of model.parts) for (let i = 0; i < p.mesh.positions.length; i += 3) top = Math.max(top, f.normal[0] * p.mesh.positions[i] + f.normal[1] * p.mesh.positions[i + 1] + f.normal[2] * p.mesh.positions[i + 2]);
    return { ...f, extreme: top <= f.offset + EXTREME_MM };
  });
}

/** Distância do ponto ao triângulo (Ericson, "Real-Time Collision Detection"). */
function pointTriDistance(p: Vec3, [a, b, c]: [Vec3, Vec3, Vec3]): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const closest = ((): Vec3 => {
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b);
    const d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return [a[0] + (ab[0] * d1) / (d1 - d3), a[1] + (ab[1] * d1) / (d1 - d3), a[2] + (ab[2] * d1) / (d1 - d3)];
    const cp = sub(p, c);
    const d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return [a[0] + (ac[0] * d2) / (d2 - d6), a[1] + (ac[1] * d2) / (d2 - d6), a[2] + (ac[2] * d2) / (d2 - d6)];
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
    }
    const denom = 1 / (va + vb + vc);
    const v = vb * denom, w = vc * denom;
    return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  })();
  return Math.hypot(...sub(p, closest));
}

/** A face plana que o clique atingiu: mesma direção da normal, plano junto do ponto e o triângulo mais próximo. */
export function faceAtPoint(model: Model, faces: PlanarFace[], point: Vec3, normal: Vec3): PlanarFace | null {
  let best: { face: PlanarFace; d: number } | null = null;
  for (const f of faces) {
    if (dot(f.normal, norm(normal)) < PICK_NORMAL_COS || Math.abs(dot(f.normal, point) - f.offset) > PICK_PLANE_MM) continue;
    const mesh = model.parts[f.part].mesh;
    const d = Math.min(...f.triangles.map((t) => pointTriDistance(point, tri(mesh, t))));
    if (!best || d < best.d) best = { face: f, d };
  }
  return best && best.d <= PICK_PLANE_MM * 2 ? best.face : null;
}

/** Eixos da face vista de fora: `u` para a direita, `v` para cima (o "para cima" do mundo, ou Y se a face é horizontal). */
export function faceAxes(normal: Vec3): { u: Vec3; v: Vec3; n: Vec3 } {
  const n = norm(normal);
  const ref: Vec3 = Math.abs(n[2]) < 0.99 ? [0, 0, 1] : [0, 1, 0];
  const k = dot(ref, n);
  const v = norm([ref[0] - k * n[0], ref[1] - k * n[1], ref[2] - k * n[2]]);
  return { u: cross(v, n), v, n };
}

/** Gira e move a malha: p' = R (p − centro), com R levando (u, v, n) a (X, Y, Z); a face fica em z = 0, olhando para cima. */
export function toFaceFrame(mesh: Mesh, face: PlanarFace): Mesh {
  const { u, v, n } = faceAxes(face.normal);
  const out = new Float32Array(mesh.positions.length);
  for (let i = 0; i < out.length; i += 3) {
    const p = sub([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]], face.centroid);
    out[i] = dot(u, p);
    out[i + 1] = dot(v, p);
    out[i + 2] = dot(n, p);
  }
  return { positions: out, indices: mesh.indices };
}

/** O inverso de `toFaceFrame`: devolve a malha ao lugar e à posição originais. */
export function fromFaceFrame(mesh: Mesh, face: PlanarFace): Mesh {
  const { u, v, n } = faceAxes(face.normal);
  const out = new Float32Array(mesh.positions.length);
  for (let i = 0; i < out.length; i += 3) {
    const [x, y, z] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
    for (let k = 0; k < 3; k++) out[i + k] = u[k] * x + v[k] * y + n[k] * z + face.centroid[k];
  }
  return { positions: out, indices: mesh.indices };
}

/** Largura e altura da face (nos eixos `u` e `v`), em mm. */
export function faceSize(model: Model, face: PlanarFace): [number, number] {
  const { u, v } = faceAxes(face.normal);
  const m = model.parts[face.part].mesh;
  let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const t of face.triangles)
    for (const p of tri(m, t)) {
      u0 = Math.min(u0, dot(u, p));
      u1 = Math.max(u1, dot(u, p));
      v0 = Math.min(v0, dot(v, p));
      v1 = Math.max(v1, dot(v, p));
    }
  return [u1 - u0, v1 - v0];
}

const HIGHLIGHT_LIFT_MM = 0.04; // pouco para a medida da prévia não mudar (arredonda no décimo)
/** Só para a prévia: a face escolhida pintada, um fio acima da peça (não vai para o arquivo). */
export function faceHighlight(model: Model, face: PlanarFace, color: string): Model {
  const m = model.parts[face.part].mesh;
  const pos = new Float32Array(face.triangles.length * 9);
  face.triangles.forEach((t, i) =>
    tri(m, t).forEach((p, k) => {
      for (let a = 0; a < 3; a++) pos[i * 9 + k * 3 + a] = p[a] + face.normal[a] * HIGHLIGHT_LIFT_MM;
    }),
  );
  const indices = Uint32Array.from({ length: face.triangles.length * 3 }, (_, i) => i);
  return { name: "Face escolhida", parts: [{ name: "Face escolhida", color, mesh: { positions: pos, indices } }] };
}

/** Para onde a face aponta, em palavras. */
export function faceDirection(normal: Vec3): string {
  const [x, y, z] = normal;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (Math.max(ax, ay, az) < 0.95) return "inclinada";
  if (az >= ax && az >= ay) return z > 0 ? "para cima" : "para baixo";
  if (ax >= ay) return x > 0 ? "para a direita" : "para a esquerda";
  return y > 0 ? "para trás" : "para a frente";
}
