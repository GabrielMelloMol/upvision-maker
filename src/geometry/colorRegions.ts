import { colorName } from "./colorName";
import type { Model, Part } from "./types";
import type { Read3mf, ReadPart } from "./threemfRead";
import type { Tri, Vec3 } from "./paint";

/**
 * Regiões de cor de um 3MF que pinta por material (colorgroup/basematerials: Blender, Meshmixer, ZBrush, Meshy…):
 * cores parecidas viram um grupo (tolerância em % da distância RGB), e uma região pode ser só a que toca no
 * triângulo clicado (juntar só o que encosta) ou todas as áreas daquela cor.
 */
type ColorScope = "all" | "touching";
export type ColorSelection = {
  color: string;
  scope: ColorScope;
  /** Triângulo clicado (objeto, parte, triângulo): sem ele a seleção vale para a cor inteira. */
  seed?: { obj: number; part: number; tri: number };
};
export type ColorCluster = { color: string; area: number; share: number };

export const DEFAULT_TOLERANCE = 8; // % de 441 (a maior distância RGB)
const MAX_RGB = Math.hypot(255, 255, 255);
const MAX_CLUSTERS = 24;

export type Rgb = [number, number, number];
const rgbOf = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const hexOf = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const within = (a: Rgb, b: Rgb, tolPct: number) => dist(a, b) <= (tolPct / 100) * MAX_RGB;
/** Duas cores (#rrggbb) estão no mesmo grupo para essa tolerância? */
export const sameColor = (a: string, b: string, tolPct: number) => within(rgbOf(a), rgbOf(b), tolPct);

/** O 3MF pinta por material (e não pelo pincel do fatiador)? */
export const hasMaterialColors = (file: Read3mf) => file.objects.some((o) => o.parts.some((p) => p.triColors && !p.paint));

function triArea(part: ReadPart, t: number): number {
  const { positions: p, indices: ix } = part.mesh;
  const [a, b, c] = [ix[t * 3] * 3, ix[t * 3 + 1] * 3, ix[t * 3 + 2] * 3];
  const [ux, uy, uz, vx, vy, vz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2], p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

/** Grupos de cor do arquivo, do maior (por área) ao menor; cada cor entra no grupo mais antigo que estiver dentro da tolerância. */
export function colorClusters(file: Read3mf, tolPct: number): ColorCluster[] {
  const byColor = new Map<string, number>();
  for (const o of file.objects)
    for (const p of o.parts) {
      if (!p.triColors || p.paint) continue;
      p.triColors.forEach((c, t) => c && byColor.set(c, (byColor.get(c) ?? 0) + triArea(p, t)));
    }
  const sorted = [...byColor].sort((a, b) => b[1] - a[1]);
  const clusters: { rgb: Rgb; area: number; weighted: Rgb }[] = [];
  for (const [hex, area] of sorted) {
    const rgb = rgbOf(hex);
    const home = clusters.find((c) => within(c.rgb, rgb, tolPct));
    if (home) {
      home.area += area;
      home.weighted = [0, 1, 2].map((i) => home.weighted[i] + rgb[i] * area) as Rgb;
    } else if (clusters.length < MAX_CLUSTERS) clusters.push({ rgb, area, weighted: rgb.map((v) => v * area) as Rgb });
    else clusters.sort((a, b) => b.area - a.area)[clusters.length - 1].area += area; // sobra: vai para o menor grupo
  }
  const total = clusters.reduce((s, c) => s + c.area, 0) || 1;
  return clusters
    .sort((a, b) => b.area - a.area)
    .map((c) => ({ color: hexOf(c.weighted.map((v) => v / c.area) as Rgb), area: c.area, share: c.area / total }));
}

/** Seleção automática: todos os grupos menos o maior, que fica como base da peça. */
export const autoSelections = (clusters: ColorCluster[]): ColorSelection[] => clusters.slice(1).map((c) => ({ color: c.color, scope: "all" }));

/** Triângulos que compartilham vértice com cada triângulo (vizinhança por vértice, o suficiente para "tocar"). */
function vertexNeighbors(part: ReadPart): (t: number) => number[] {
  const nT = part.mesh.indices.length / 3;
  const at = new Map<number, number[]>();
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) (at.get(part.mesh.indices[t * 3 + k]) ?? at.set(part.mesh.indices[t * 3 + k], []).get(part.mesh.indices[t * 3 + k])!).push(t);
  return (t) => [0, 1, 2].flatMap((k) => at.get(part.mesh.indices[t * 3 + k]) ?? []);
}

/** Triângulos da região: com `touching`, só os que se ligam ao `seed` passando por triângulos da mesma cor; com `all`, todos da cor. */
export function regionTriangles(part: ReadPart, sel: ColorSelection, tolPct: number, taken?: Set<number>): number[] {
  if (!part.triColors) return [];
  const target = rgbOf(sel.color);
  const ok = (t: number) => !!part.triColors![t] && !taken?.has(t) && within(rgbOf(part.triColors![t]), target, tolPct);
  const nT = part.mesh.indices.length / 3;
  if (sel.scope === "all") return Array.from({ length: nT }, (_, t) => t).filter(ok);
  if (!sel.seed || !ok(sel.seed.tri)) return [];
  const near = vertexNeighbors(part);
  const seen = new Set<number>([sel.seed.tri]);
  const stack = [sel.seed.tri];
  while (stack.length) {
    for (const u of near(stack.pop()!)) {
      if (seen.has(u) || !ok(u)) continue;
      seen.add(u);
      stack.push(u);
    }
  }
  return [...seen];
}

export function triOf(part: ReadPart, t: number): Tri {
  const { positions: p, indices: ix } = part.mesh;
  return [0, 1, 2].map((k) => [p[ix[t * 3 + k] * 3], p[ix[t * 3 + k] * 3 + 1], p[ix[t * 3 + k] * 3 + 2]] as Vec3) as Tri;
}

/** O triângulo mais perto de um ponto (clique na prévia), com o objeto e a parte dele e a cor que tem. */
export function nearestTriangle(file: Read3mf, point: Vec3): { obj: number; part: number; tri: number; color: string | null } | null {
  let best: { obj: number; part: number; tri: number; d: number } | null = null;
  file.objects.forEach((o, oi) =>
    o.parts.forEach((p, pi) => {
      const { positions: pos, indices: ix } = p.mesh;
      for (let t = 0; t < ix.length / 3; t++) {
        const c = [0, 1, 2].map((k) => (pos[ix[t * 3] * 3 + k] + pos[ix[t * 3 + 1] * 3 + k] + pos[ix[t * 3 + 2] * 3 + k]) / 3);
        const d = (c[0] - point[0]) ** 2 + (c[1] - point[1]) ** 2 + (c[2] - point[2]) ** 2;
        if (!best || d < best.d) best = { obj: oi, part: pi, tri: t, d };
      }
    }),
  );
  if (!best) return null;
  const b = best as { obj: number; part: number; tri: number };
  return { ...b, color: file.objects[b.obj].parts[b.part].triColors?.[b.tri] || null };
}

/** Prévia do arquivo como veio: uma parte por grupo de cor (mesma posição do arquivo), para clicar e escolher. */
export function colorPreview(file: Read3mf, tolPct: number, selected: ColorSelection[] = []): Model[] {
  const clusters = colorClusters(file, tolPct);
  const centers = clusters.map((c) => rgbOf(c.color));
  const chosen = new Set(selected.map((s) => s.color));
  return file.objects.map((o) => {
    const parts: Part[] = [];
    for (const p of o.parts) {
      if (!p.triColors) {
        parts.push({ name: p.name, color: "#d4d4d8", mesh: p.mesh });
        continue;
      }
      const groups = new Map<number, number[]>();
      p.triColors.forEach((c, t) => {
        const rgb = c ? rgbOf(c) : centers[0] ?? ([200, 200, 200] as Rgb);
        const i = centers.findIndex((x) => within(x, rgb, tolPct));
        (groups.get(i) ?? groups.set(i, []).get(i)!).push(t);
      });
      for (const [i, tris] of groups) {
        const idx = new Uint32Array(tris.length * 3);
        tris.forEach((t, n) => idx.set(p.mesh.indices.subarray(t * 3, t * 3 + 3), n * 3));
        const color = clusters[i]?.color ?? "#cccccc";
        parts.push({ name: chosen.has(color) ? `Separar ${colorName(color)}` : `Cor ${colorName(color)}`, color, mesh: { positions: p.mesh.positions, indices: idx } });
      }
    }
    return { name: o.name, parts };
  });
}
