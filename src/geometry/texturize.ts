import { nozzleMm } from "./bed";
import { solidFromMesh } from "./cutSolid";
import type { ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import { textureById, type TextureId } from "./textureLib";
import type { Model, Part } from "./types";

/**
 * Texturizador (#222): aplica uma textura (de padrão, frase ou imagem) como relevo real na superfície de um STL ou 3MF
 * do cliente. A malha é subdividida até as arestas ficarem bem menores que a textura e cada vértice anda pela sua
 * normal a altura da textura naquele ponto; a área pode ser a peça toda, só laterais, só o topo ou o que foi pincelado,
 * com proteção para a base ficar lisa e para o relevo não criar balanço novo.
 */
type Vec3 = [number, number, number];
export type TextureSource = { kind: "pattern"; id: TextureId } | { kind: "grid"; grid: Float32Array; cols: number; rows: number };
export type Direction = "out" | "in" | "center";
export type Mapping = "box" | "cylinder";
export type Faces = "all" | "sides" | "top";
type Brush = { p: Vec3; r: number };

export type TexturizeOptions = {
  source: TextureSource;
  /** Lado do ladrilho da textura (mm). */
  scale: number;
  /** Altura do relevo (mm). */
  depth: number;
  direction: Direction;
  mapping: Mapping;
  faces: Faces;
  /** Pinceladas (esferas); null = a peça toda, [] = nada pintado ainda. */
  brush: Brush[] | null;
  protectOverhang: boolean;
  flatBase: boolean;
};
export const DEFAULT_TEXTURIZE: TexturizeOptions = {
  source: { kind: "pattern", id: "carbono" },
  scale: 6,
  depth: 0.6,
  direction: "out",
  mapping: "box",
  faces: "all",
  brush: null,
  protectOverhang: true,
  flatBase: true,
};
export type TexturizeInfo = { triangles: number; textured: number };
export type TexturizeResult = { model: Model; warnings: string[]; info: TexturizeInfo };

const SAMPLES_PER_TILE = 8;
const MIN_EDGE_MM = 0.3;
const MAX_EDGE_MM = 1.5;
const MAX_TRIANGLES = 800_000; // no total da peça: a prévia e o fatiador seguram bem
const TRI_PER_AREA = 2.3; // triângulos por (aresta²) depois de dividir
const FLAT_BASE_MM = 0.3;
const SEAM_POWER = 4; // quanto a projeção em caixa prefere o eixo mais de frente

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (v: number) => v - Math.floor(v);

/** Altura (0..1) da textura em (x, y), medidos em ladrilhos. */
function heightAt(src: TextureSource): (x: number, y: number) => number {
  if (src.kind === "pattern") return textureById(src.id).fn;
  const { grid, cols, rows } = src;
  return (x, y) => {
    const [gx, gy] = [fract(x) * cols, fract(y) * rows];
    const [i, j] = [Math.floor(gx), Math.floor(gy)];
    const [fx, fy] = [gx - i, gy - j];
    const at = (a: number, b: number) => grid[(b % rows) * cols + (a % cols)];
    return at(i, j) * (1 - fx) * (1 - fy) + at(i + 1, j) * fx * (1 - fy) + at(i, j + 1) * (1 - fx) * fy + at(i + 1, j + 1) * fx * fy;
  };
}

/** Normais suaves por vértice (média das normais dos triângulos, ponderada pela área). */
function vertexNormals(pos: Float32Array, tri: Uint32Array): Float32Array {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t] * 3, tri[t + 1] * 3, tri[t + 2] * 3];
    const [ux, uy, uz, vx, vy, vz] = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2], pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const f = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const i of [a, b, c]) for (let d = 0; d < 3; d++) n[i + d] += f[d];
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Peso 0..1 de cada vértice: onde a textura vale (área, pincel, base lisa e balanço). */
function weights(pos: Float32Array, nor: Float32Array, minZ: number, o: TexturizeOptions): Float32Array {
  const w = new Float32Array(pos.length / 3).fill(1);
  for (let i = 0; i < w.length; i++) {
    const nz = nor[i * 3 + 2];
    let v = 1;
    if (o.faces === "sides") v *= 1 - smooth(0.5, 0.7, Math.abs(nz));
    else if (o.faces === "top") v *= smooth(0.3, 0.6, nz);
    if (o.brush) {
      let best = 0;
      for (const b of o.brush) {
        const d = Math.hypot(pos[i * 3] - b.p[0], pos[i * 3 + 1] - b.p[1], pos[i * 3 + 2] - b.p[2]);
        best = Math.max(best, 1 - smooth(0.7 * b.r, b.r, d));
      }
      v *= best;
    }
    if (o.protectOverhang && o.direction !== "in") v *= smooth(-0.85, -0.6, nz); // virada para baixo e inclinada: relevo ali viraria balanço
    if (o.flatBase && pos[i * 3 + 2] - minZ < FLAT_BASE_MM && nz < -0.5) v = 0;
    w[i] = v;
  }
  return w;
}

function displacement(pos: Float32Array, nor: Float32Array, w: Float32Array, bb: { min: number[]; max: number[] }, o: TexturizeOptions): Float32Array {
  const H = heightAt(o.source);
  const out = new Float32Array(w.length);
  const [cx, cy] = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2];
  const R = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) / 2 || 1;
  const k = 1 / o.scale;
  for (let i = 0; i < w.length; i++) {
    if (w[i] <= 0) continue;
    const [x, y, z] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    let h: number;
    if (o.mapping === "cylinder") h = H(Math.atan2(y - cy, x - cx) * R * k, z * k);
    else {
      const [ax, ay, az] = [Math.abs(nor[i * 3]) ** SEAM_POWER, Math.abs(nor[i * 3 + 1]) ** SEAM_POWER, Math.abs(nor[i * 3 + 2]) ** SEAM_POWER];
      const s = ax + ay + az || 1;
      h = (ax * H(y * k, z * k) + ay * H(x * k, z * k) + az * H(x * k, y * k)) / s;
    }
    const lift = o.direction === "out" ? h : o.direction === "in" ? h - 1 : h - 0.5;
    out[i] = w[i] * o.depth * lift;
  }
  return out;
}

/**
 * Para onde o vértice anda: pela normal, mas só na horizontal quando a área é "só laterais" ou quando está na quina da base lisa (a
 * quina tem normal inclinada para baixo e empurraria a base), e só na vertical quando a área é "só o topo".
 */
function direction(n: Vec3, heightAboveBase: number, o: TexturizeOptions): Vec3 {
  if (o.faces === "top") return [0, 0, 1];
  const flat = o.faces === "sides" || (o.flatBase && heightAboveBase < FLAT_BASE_MM);
  if (!flat) return n;
  const l = Math.hypot(n[0], n[1]);
  return l < 1e-6 ? [0, 0, 0] : [n[0] / l, n[1] / l, 0];
}

export function texturize(M: ManifoldToplevel, model: Model, o: TexturizeOptions): TexturizeResult {
  const warnings: string[] = [];
  if (o.scale < 2 * nozzleMm()) warnings.push(`A textura é menor que ${(2 * nozzleMm()).toString().replace(".", ",")} mm (duas linhas do bico): o detalhe se perde na impressão. Aumente o tamanho.`);
  if (o.depth < 0.15) warnings.push("Relevo menor que 0,15 mm: mal aparece depois de impresso.");
  if (o.depth > o.scale * 0.6) warnings.push("Relevo fundo demais para o tamanho da textura: pode ficar pontudo e difícil de imprimir.");
  let triangles = 0;
  let reduced = false;
  let textured = 0;
  let total = 0;
  const parts = scoped((k) => {
    const out: Part[] = [];
    const solids = model.parts.map((part) => {
      const r = solidFromMesh(M, part.mesh);
      if (r.holes) warnings.push(`A malha de "${part.name}" tinha ${r.holes} furo${r.holes > 1 ? "s" : ""} e foi consertada antes de texturizar.`);
      const solid = k(r.solid);
      return { part, solid, area: solid.surfaceArea(), tris: part.mesh.indices.length / 3 };
    });
    const totalArea = solids.reduce((s, x) => s + x.area, 0) || 1;
    for (const { part, solid, area, tris } of solids) {
      const bb = solid.boundingBox();
      const share = (MAX_TRIANGLES * area) / totalArea; // a cota de triângulos desta parte
      const edgeByTexture = Math.min(MAX_EDGE_MM, Math.max(MIN_EDGE_MM, o.scale / SAMPLES_PER_TILE));
      const edge = Math.max(edgeByTexture, Math.sqrt((area * TRI_PER_AREA) / share));
      reduced ||= edge > edgeByTexture * 1.01;
      // a malha já tem mais triângulos que a cota: não subdivide (o detalhe do arquivo já basta)
      const fine = tris >= share ? solid : k(solid.refineToLength(edge));
      const mesh = fine.getMesh();
      const pos = new Float32Array(mesh.numProp === 3 ? mesh.vertProperties : mesh.vertProperties.filter((_, i) => i % mesh.numProp < 3));
      const tri = new Uint32Array(mesh.triVerts);
      const nor = vertexNormals(pos, tri);
      const w = weights(pos, nor, bb.min[2], o);
      const d = displacement(pos, nor, w, bb, o);
      const moved = new Float32Array(pos.length);
      for (let i = 0; i < w.length; i++) {
        const dir = direction([nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]], pos[i * 3 + 2] - bb.min[2], o);
        for (let a = 0; a < 3; a++) moved[i * 3 + a] = pos[i * 3 + a] + dir[a] * d[i];
      }
      total += w.length;
      textured += w.reduce((s, v) => s + (v > 0.05 ? 1 : 0), 0);
      triangles += tri.length / 3;
      let result;
      try {
        result = k(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: moved, triVerts: tri })));
      } catch {
        throw new Error("O relevo deixou a malha com erro (relevo fundo demais para esta peça). Diminua a altura do relevo.");
      }
      if (result.isEmpty() || result.volume() <= 0) throw new Error("O relevo deixou a peça sem volume: diminua a altura do relevo.");
      out.push({ ...part, mesh: toMesh(result) });
    }
    return out;
  });
  if (reduced) warnings.push("A peça é grande para o tamanho da textura: reduzi o detalhe para manter o arquivo leve.");
  if (o.brush && o.brush.length === 0) warnings.push("Nada pintado ainda: clique na peça para pintar a área que recebe a textura.");
  return { model: { ...model, parts }, warnings, info: { triangles, textured: total ? textured / total : 0 } };
}
