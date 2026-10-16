import type { ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { decodePaint, type Tri, type Vec3 } from "./paint";
import { scoped } from "./shape2d";
import { nozzleText } from "./bed";
import { JobCancelled, type Hooks } from "./jobs";
import { colorName } from "./colorName";
import { autoSelections, colorClusters, DEFAULT_TOLERANCE, hasMaterialColors, regionTriangles, triOf, type ColorSelection } from "./colorRegions";
import { minStrokeMm } from "./textCheck";
import type { Read3mf, ReadPart } from "./threemfRead";
import type { Model, Part } from "./types";

/**
 * Separador 3MF por cor (#14, 1ª entrega): cada cor pintada vira um volume sólido que entra na peça `depth` mm
 * a partir da superfície pintada (como o fatiador faz com a pintura), recortado pela própria peça; o que sobra fica
 * na cor do volume. Saída em partes de um objeto (multicor) ou em objetos separados (imprimir cada cor à parte).
 */
export type SplitMode = "parts" | "objects";
export type SplitOptions = {
  depth: number;
  mode: SplitMode;
  /** Arquivo que pinta por material: o que separar (sem isso, todos os grupos de cor menos o maior). */
  selections?: ColorSelection[];
  tolerance?: number;
  /** Objetos separados: deixa cada um onde estava no arquivo, em vez de afastar e apoiar na mesa. */
  keepPosition?: boolean;
  /** Progresso por parte e por cor, e cancelamento (a tela mostra a barra e o botão Cancelar). */
  hooks?: Hooks;
};
export type ColorInfo = { filament: number; color: string; volume: number };

const PALETTE = ["#f8f8f6", "#d6262e", "#2563eb", "#facc15", "#22a04b", "#7e3fd6", "#f97316", "#1c1c1e"];
const MIN_AREA = 1e-6;
const MAX_LEAVES = 60_000;
const GAP = 10;
/** Normal com |z| abaixo disto = face de lado (a cor entra na horizontal e vira parede). */
const SIDE_NZ = 0.7;

/** Fragmento menor que isto (mm³) não imprime e o fatiador recusa o objeto: sobra de corte raspando a superfície. */
const MIN_SHARD_MM3 = 4; // 2 × 2 × 1 mm: menos que isso o fatiador nem põe no G-code
const FILE_PRECISION = 1e4;
const SIMPLIFY_MM = 0.01;

/**
 * Tira os fragmentos minúsculos de um volume (conta quantos saíram). O arquivo guarda float32: confere como o fatiador vai
 * ler (vértices que o arredondamento junta) e só então separa os pedaços, senão sobram "peças" de volume zero.
 */
function withoutShards(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D, s: Solid, dropped: { n: number }): Solid {
  const mesh = toMesh(s);
  const written = mesh.positions.map((v) => Math.round(v * FILE_PRECISION) / FILE_PRECISION); // o 3MF grava com 4 casas
  const m = new M.Mesh({ numProp: 3, vertProperties: written, triVerts: mesh.indices });
  m.merge();
  let rounded: Solid;
  try {
    rounded = k(M.Manifold.ofMesh(m));
  } catch {
    return s; // o arredondamento quebrou a malha: segue com o volume original
  }
  const parts = k(rounded.simplify(SIMPLIFY_MM)).decompose().map(k); // simplify junta vértices a menos de 0,01 mm: some com as lâminas de espessura quase zero
  const keep = parts.filter((c) => c.volume() >= MIN_SHARD_MM3);
  dropped.n += parts.length - keep.length;
  return keep.length === parts.length ? k(rounded.simplify(SIMPLIFY_MM)) : k(M.Manifold.union(keep));
}

const colorOf = (colors: string[], filament: number, extra?: Map<number, string>) => extra?.get(filament) ?? colors[filament - 1] ?? PALETTE[(filament - 1) % PALETTE.length];

function normal([a, b, c]: Tri): Vec3 | null {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n);
  return len / 2 < MIN_AREA ? null : [n[0] / len, n[1] / len, n[2] / len];
}

/** Sólido da parte; recusa malha aberta ou com erros (não dá para separar com segurança). */
export function partSolid(M: ManifoldToplevel, part: ReadPart): Solid {
  const mesh = new M.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices });
  mesh.merge();
  const broken = () => new Error(`A peça "${part.name}" tem a malha aberta ou com erros (não-manifold). Use "Reparar" no Bambu Studio/Orca ou Netfabb e tente de novo.`);
  let s: Solid;
  try {
    s = M.Manifold.ofMesh(mesh);
  } catch {
    throw broken(); // o manifold recusa na hora ("Not manifold")
  }
  if (s.status() !== "NoError" || s.isEmpty()) {
    s.delete();
    throw broken();
  }
  return s;
}

/** Cor por material: cada seleção vira um filamento novo (depois dos do arquivo); os triângulos escolhidos entram como folhas pintadas. */
function materialLeaves(part: ReadPart, picks: { sel: ColorSelection; filament: number; obj: number; partIndex: number }[], tol: number): Map<number, Tri[]> {
  const out = new Map<number, Tri[]>();
  const taken = new Set<number>();
  let count = 0;
  for (const { sel, filament, obj, partIndex } of picks) {
    const seed = sel.seed && sel.seed.obj === obj && sel.seed.part === partIndex ? sel.seed : undefined;
    if (sel.scope === "touching" && !seed) continue;
    const tris = regionTriangles(part, { ...sel, seed }, tol, taken);
    count += tris.length;
    if (count > MAX_LEAVES) throw new Error("Região de cor detalhada demais para separar aqui (mais de 60 mil triângulos).");
    tris.forEach((t) => taken.add(t));
    if (tris.length) out.set(filament, tris.map((t) => triOf(part, t)));
  }
  return out;
}

/** Folhas pintadas da parte agrupadas por filamento (0 = sem pintura vira a extrusora da parte). */
function paintedLeaves(part: ReadPart): Map<number, Tri[]> {
  const out = new Map<number, Tri[]>();
  if (!part.paint) return out;
  const { positions: p, indices: ix } = part.mesh;
  let count = 0;
  part.paint.forEach((code, t) => {
    if (!code) return;
    const tri = [0, 1, 2].map((k) => [p[ix[t * 3 + k] * 3], p[ix[t * 3 + k] * 3 + 1], p[ix[t * 3 + k] * 3 + 2]]) as Tri;
    for (const leaf of decodePaint(code, tri)) {
      const f = leaf.state || part.extruder;
      if (f === part.extruder) continue;
      if (++count > MAX_LEAVES) throw new Error("Pintura detalhada demais para separar aqui (mais de 60 mil triângulos pintados).");
      if (!out.has(f)) out.set(f, []);
      out.get(f)!.push(leaf.tri);
    }
  });
  return out;
}

const posKey = ([x, y, z]: Vec3) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
const FLAT_COS = 0.9999; // triângulos vizinhos mais planos que isto não deixam fresta
const MAX_FAN = 16;
const GROW_MM = 0.03;

/**
 * Prismas que entram `depth` mm pela normal de cada triângulo pintado, mais um calço em cada aresta e vértice onde a
 * normal muda: sem ele os prismas vizinhos deixam frestas em cunha, que viram lâminas finas de volume zero na peça.
 */
function shellOf(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D, tris: Tri[], depth: number): Solid {
  const prisms: Solid[] = [];
  const normals = tris.map(normal);
  const inner = (v: Vec3, n: Vec3) => [v[0] - n[0] * depth, v[1] - n[1] * depth, v[2] - n[2] * depth] as Vec3;
  const byEdge = new Map<string, number[]>();
  const byVertex = new Map<string, number[]>();
  tris.forEach((t, i) => {
    const n = normals[i];
    if (!n) return;
    // um pouco para fora também: o recorte pela peça limpa, e evita fresta por arredondamento
    // e um fio para os lados: a parede que encosta na região pintada deixa de ser coplanar com a lateral do prisma (que deixava fiapos de volume zero)
    const c = [0, 1, 2].map((d) => (t[0][d] + t[1][d] + t[2][d]) / 3);
    const grown = t.map((v) => {
      const d = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
      const l = Math.hypot(...d) || 1;
      return [v[0] + (d[0] / l) * GROW_MM, v[1] + (d[1] / l) * GROW_MM, v[2] + (d[2] / l) * GROW_MM] as Vec3;
    });
    const outer = grown.map(([x, y, z]) => [x + n[0] * 0.01, y + n[1] * 0.01, z + n[2] * 0.01] as Vec3);
    prisms.push(k(M.Manifold.hull([...outer, ...grown.map((v) => inner(v, n))])));
    for (let e = 0; e < 3; e++) {
      const [ka, kb] = [posKey(t[e]), posKey(t[(e + 1) % 3])];
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      (byEdge.get(ek) ?? byEdge.set(ek, []).get(ek)!).push(i);
      (byVertex.get(ka) ?? byVertex.set(ka, []).get(ka)!).push(i);
    }
  });
  const bend = (a: number, b: number) => {
    const [na, nb] = [normals[a]!, normals[b]!];
    return na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2] < FLAT_COS;
  };
  for (const [ek, list] of byEdge) {
    if (list.length !== 2 || !bend(list[0], list[1])) continue;
    const [ka, kb] = ek.split("|");
    const verts = tris[list[0]].filter((v) => posKey(v) === ka || posKey(v) === kb);
    if (verts.length !== 2) continue;
    prisms.push(k(M.Manifold.hull([...verts, ...verts.map((v) => inner(v, normals[list[0]]!)), ...verts.map((v) => inner(v, normals[list[1]]!))])));
  }
  for (const list of byVertex.values()) {
    if (list.length < 2 || list.length > MAX_FAN || !list.some((i) => bend(list[0], i))) continue;
    const v = tris[list[0]].find((p) => byVertex.get(posKey(p)) === list)!;
    prisms.push(k(M.Manifold.hull([v, ...list.map((i) => inner(v, normals[i]!))])));
  }
  return k(M.Manifold.union(prisms));
}

/** Separa as cores de cada objeto do 3MF lido. */
export function splitByColor(M: ManifoldToplevel, file: Read3mf, o: SplitOptions): { models: Model[]; colors: ColorInfo[]; warnings: string[] } {
  if (!(o.depth > 0)) throw new Error("A profundidade da cor precisa ser maior que zero.");
  const volumes = new Map<number, number>();
  const warnings: string[] = [];
  // arquivo que pinta por material: cada cor escolhida ganha um filamento depois dos que o arquivo já usa
  const tol = o.tolerance ?? DEFAULT_TOLERANCE;
  const byMaterial = hasMaterialColors(file);
  const selections = byMaterial ? (o.selections ?? autoSelections(colorClusters(file, tol))) : [];
  const firstNew = Math.max(file.filamentColors.length, ...file.objects.flatMap((x) => x.parts.map((p) => p.extruder))) + 1;
  const extraColor = new Map(selections.map((s, i) => [firstNew + i, s.color]));
  // o grupo maior fica na peça base, na cor dele
  const base = colorClusters(file, tol)[0]?.color;
  if (byMaterial && base) file.objects.forEach((x) => x.parts.forEach((p) => !p.paint && p.triColors && extraColor.set(p.extruder, base)));
  let thinSide = false;
  const dropped = { n: 0 };
  const models: Model[] = [];
  const totalParts = file.objects.reduce((n, x) => n + x.parts.length, 0) || 1;
  let partsDone = 0;
  const at = (frac: number, stage: string) => {
    if (o.hooks?.cancelled?.()) throw new JobCancelled();
    o.hooks?.progress?.(Math.min(1, (partsDone + frac) / totalParts), stage);
  };
  file.objects.forEach((obj, objIndex) => {
    const parts: Part[] = scoped((k) => {
      const out: Part[] = [];
      obj.parts.forEach((part, partIndex) => {
        at(0, "Conferindo a malha");
        const solid = k(partSolid(M, part));
        at(0.2, "Achando as cores");
        const leaves = part.triColors && !part.paint ? materialLeaves(part, selections.map((sel, i) => ({ sel, filament: firstNew + i, obj: objIndex, partIndex })), tol) : paintedLeaves(part);
        let rest = solid;
        const pieces: [number, Solid][] = [];
        const keys = [...leaves.keys()].sort((a, b) => a - b);
        for (const [n, f] of keys.entries()) {
          at(0.25 + (0.5 * n) / (keys.length || 1), "Separando as cores");
          const vol = k(shellOf(M, k, leaves.get(f)!, o.depth).intersect(rest));
          if (vol.isEmpty()) continue;
          thinSide ||= o.depth < minStrokeMm() && leaves.get(f)!.some((t) => Math.abs(normal(t)?.[2] ?? 1) < SIDE_NZ);
          rest = k(rest.subtract(vol)); // cada ponto fica com uma cor só
          pieces.push([f, vol]);
        }
        pieces.unshift([part.extruder, rest]);
        at(0.75, "Limpando as peças");
        for (const [f, raw] of pieces) {
          if (raw.isEmpty()) continue;
          const s = withoutShards(M, k, raw, dropped);
          if (s.isEmpty()) continue;
          volumes.set(f, (volumes.get(f) ?? 0) + s.volume());
          const isBase = f === part.extruder;
          out.push({ name: isBase ? part.name : `${part.name} · ${extraColor.has(f) ? `cor ${colorName(extraColor.get(f)!)}` : `filamento ${f}`}`, color: colorOf(file.filamentColors, f, extraColor), mesh: toMesh(s) });
        }
        partsDone += 1;
      });
      return out;
    });
    if (o.mode === "parts") models.push({ name: obj.name, parts });
    else parts.forEach((p) => models.push({ name: `${obj.name} · ${p.name}`, parts: [p] }));
  });
  if (thinSide)
    warnings.push(`Com ${String(o.depth).replace(".", ",")} mm de profundidade, a cor pintada nas laterais fica mais fina que a linha do bico (${nozzleText(minStrokeMm())} mm) e some no fatiador: use ${nozzleText(minStrokeMm())} mm ou mais.`);
  if (dropped.n) warnings.push(`Tirei ${dropped.n} fragmento${dropped.n > 1 ? "s" : ""} minúsculo${dropped.n > 1 ? "s" : ""} (menos de ${MIN_SHARD_MM3} mm³) que sobraram do corte: não imprimem e o fatiador recusaria o objeto.`);
  if (volumes.size < 2) warnings.push("Só uma cor encontrada: o arquivo não tem pintura nem partes de cores diferentes.");
  const placed = o.mode === "objects" && !o.keepPosition ? spreadOnPlate(models) : models;
  const colors = [...volumes].sort((a, b) => a[0] - b[0]).map(([filament, volume]) => ({ filament, color: colorOf(file.filamentColors, filament, extraColor), volume }));
  return { models: placed, colors, warnings };
}

/** Objetos separados: lado a lado, cada um apoiado na mesa. */
function spreadOnPlate(models: Model[]): Model[] {
  let x = 0;
  return models.map((m) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity;
    for (const p of m.parts)
      for (let i = 0; i < p.mesh.positions.length; i += 3) {
        x0 = Math.min(x0, p.mesh.positions[i]);
        x1 = Math.max(x1, p.mesh.positions[i]);
        z0 = Math.min(z0, p.mesh.positions[i + 2]);
      }
    const dx = x - x0;
    x += x1 - x0 + GAP;
    return {
      ...m,
      parts: m.parts.map((p) => {
        const pos = p.mesh.positions.slice();
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += dx;
          pos[i + 2] -= z0;
        }
        return { ...p, mesh: { ...p.mesh, positions: pos } };
      }),
    };
  });
}
