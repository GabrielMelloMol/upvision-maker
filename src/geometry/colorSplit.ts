import type { ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { decodePaint, type Tri, type Vec3 } from "./paint";
import { scoped } from "./shape2d";
import type { Read3mf, ReadPart } from "./threemfRead";
import type { Model, Part } from "./types";

/**
 * Separador 3MF por cor (#14, 1ª entrega): cada cor pintada vira um volume sólido que entra na peça `depth` mm
 * a partir da superfície pintada (como o fatiador faz com a pintura), recortado pela própria peça; o que sobra fica
 * na cor do volume. Saída em partes de um objeto (multicor) ou em objetos separados (imprimir cada cor à parte).
 */
export type SplitMode = "parts" | "objects";
export type SplitOptions = { depth: number; mode: SplitMode };
export type ColorInfo = { filament: number; color: string; volume: number };

const PALETTE = ["#f8f8f6", "#d6262e", "#2563eb", "#facc15", "#22a04b", "#7e3fd6", "#f97316", "#1c1c1e"];
const MIN_AREA = 1e-6;
const MAX_LEAVES = 60_000;
const GAP = 10;

const colorOf = (colors: string[], filament: number) => colors[filament - 1] ?? PALETTE[(filament - 1) % PALETTE.length];

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

/** Prismas que entram `depth` mm pela normal de cada triângulo pintado. */
function shellOf(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D, tris: Tri[], depth: number): Solid {
  const prisms: Solid[] = [];
  for (const t of tris) {
    const n = normal(t);
    if (!n) continue;
    const inner = t.map(([x, y, z]) => [x - n[0] * depth, y - n[1] * depth, z - n[2] * depth] as Vec3);
    // um pouco para fora também: o recorte pela peça limpa, e evita fresta por arredondamento
    const outer = t.map(([x, y, z]) => [x + n[0] * 0.01, y + n[1] * 0.01, z + n[2] * 0.01] as Vec3);
    prisms.push(k(M.Manifold.hull([...outer, ...inner])));
  }
  return k(M.Manifold.union(prisms));
}

/** Separa as cores de cada objeto do 3MF lido. */
export function splitByColor(M: ManifoldToplevel, file: Read3mf, o: SplitOptions): { models: Model[]; colors: ColorInfo[]; warnings: string[] } {
  if (!(o.depth > 0)) throw new Error("A profundidade da cor precisa ser maior que zero.");
  const volumes = new Map<number, number>();
  const warnings: string[] = [];
  const models: Model[] = [];
  for (const obj of file.objects) {
    const parts: Part[] = scoped((k) => {
      const out: Part[] = [];
      for (const part of obj.parts) {
        const solid = k(partSolid(M, part));
        const leaves = paintedLeaves(part);
        let rest = solid;
        const pieces: [number, Solid][] = [];
        for (const f of [...leaves.keys()].sort((a, b) => a - b)) {
          const vol = k(shellOf(M, k, leaves.get(f)!, o.depth).intersect(rest));
          if (vol.isEmpty()) continue;
          rest = k(rest.subtract(vol)); // cada ponto fica com uma cor só
          pieces.push([f, vol]);
        }
        pieces.unshift([part.extruder, rest]);
        for (const [f, s] of pieces) {
          if (s.isEmpty()) continue;
          volumes.set(f, (volumes.get(f) ?? 0) + s.volume());
          out.push({ name: f === part.extruder ? part.name : `${part.name} · filamento ${f}`, color: colorOf(file.filamentColors, f), mesh: toMesh(s) });
        }
      }
      return out;
    });
    if (o.mode === "parts") models.push({ name: obj.name, parts });
    else parts.forEach((p) => models.push({ name: `${obj.name} · ${p.name}`, parts: [p] }));
  }
  if (volumes.size < 2) warnings.push("Só uma cor encontrada: o arquivo não tem pintura nem partes de cores diferentes.");
  const placed = o.mode === "objects" ? spreadOnPlate(models) : models;
  const colors = [...volumes].sort((a, b) => a[0] - b[0]).map(([filament, volume]) => ({ filament, color: colorOf(file.filamentColors, filament), volume }));
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
