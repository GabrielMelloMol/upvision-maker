import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { nozzleMm, nozzleText } from "./bed";
import { toMesh } from "./mesh";
import { outerOnly, scoped } from "./shape2d";
import type { Mesh, Model, Part } from "./types";

/**
 * Camada livre (#26) aplicada na face de cima da peça principal de um modelo pronto: desenho ou texto, posicionado
 * em mm (Y para cima, relativo ao centro da face), em relevo, gravado, vazado ou embutido (a cor entra na peça, rente). A interface (lista de camadas,
 * gizmo) fica no Models.tsx; aqui só a geometria.
 */
export type DecalMode = "raised" | "engraved" | "cut" | "inlay";
export type Decal = {
  id: string;
  x: number;
  y: number;
  width: number; // mm, largura depois de girar = 0°
  rotation: number; // graus, anti-horário
  mirror: boolean;
  mode: DecalMode;
  depth: number; // relevo ou profundidade do gravado (mm)
  color: string; // desenho de 1 cor e textos
  visible?: boolean;
};
/** Formas do decal já prontas (desenho vetorizado ou texto), em qualquer escala; `color` null = cor do decal. */
export type DecalRegions = { color: string | null; cs: CS }[];
export type DecalWarning = { decalId?: string; text: string };

const EPS = 0.02;
const THIN_FRAC = 0.05;
const OUTSIDE_FRAC = 0.01;
const HOLE_GAP = 0.8;

const solidOf = (M: ManifoldToplevel, m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

function topZ(m: Mesh): number {
  let z = -Infinity;
  for (let i = 2; i < m.positions.length; i += 3) z = Math.max(z, m.positions[i]);
  return z;
}

/** Peça principal: a parte com a maior face de cima (área do corte logo abaixo do topo). */
function mainPart(M: ManifoldToplevel, model: Model): { index: number; face: CS; z: number } {
  let best: { index: number; face: CS; z: number } | null = null;
  model.parts.forEach((p, index) => {
    const s = solidOf(M, p.mesh);
    const z = topZ(p.mesh);
    const face = s.slice(z - EPS);
    s.delete();
    if (!best || face.area() > best.face.area()) {
      best?.face.delete();
      best = { index, face, z };
    } else face.delete();
  });
  if (!best) throw new Error("Modelo sem peças.");
  return best;
}

/** Face de cima da peça principal do 1º modelo: contornos (com furos), caixa, altura e nome (para o gizmo). */
export function decalFace(M: ManifoldToplevel, models: Model[]) {
  const m = mainPart(M, models[0]);
  try {
    const b = m.face.bounds();
    return { outline: m.face.toPolygons() as [number, number][][], bounds: { min: [b.min[0], b.min[1]], max: [b.max[0], b.max[1]] }, z: m.z, part: models[0].parts[m.index].name };
  } finally {
    m.face.delete();
  }
}

/** Forma LOCAL do decal: centrada na origem e com a largura pedida (sem posição, giro nem espelho). */
export function decalShape(cs: CS, width: number, ref = cs.bounds()): CS {
  const w = ref.max[0] - ref.min[0];
  const moved = cs.translate([-(ref.min[0] + ref.max[0]) / 2, -(ref.min[1] + ref.max[1]) / 2]);
  const out = moved.scale(w > 0 ? width / w : 1);
  moved.delete();
  return out;
}

/** Forma no lugar: local → espelho → giro → posição. `ref` = caixa do desenho inteiro (todas as cores juntas). */
export function placeDecal(cs: CS, d: Pick<Decal, "x" | "y" | "width" | "rotation" | "mirror">, ref: ReturnType<CS["bounds"]>): CS {
  return scoped((k) => {
    let c = k(decalShape(cs, d.width, ref));
    if (d.mirror) c = k(c.scale([-1, 1]));
    if (d.rotation) c = k(c.rotate(d.rotation));
    return c.translate([d.x, d.y]);
  });
}

/**
 * Aplica os decais na peça principal: relevo vira parte nova (uma por cor), gravado afunda a peça, vazado
 * atravessa e embutido troca a camada de cima da peça pela cor do desenho (o mesmo volume, rente à face). Avisos por decal: sai da peça, traço mais fino que 0,4 mm, encostando em furo/argola.
 */
export function applyDecals(M: ManifoldToplevel, models: Model[], decals: { decal: Decal; regions: DecalRegions }[]): { models: Model[]; warnings: DecalWarning[] } {
  const active = decals.filter((d) => d.decal.visible !== false && d.regions.length);
  if (!models.length || !active.length) return { models, warnings: [] };
  return scoped((k) => {
    const main = mainPart(M, models[0]);
    k(main.face);
    const face = main.face;
    const holes = k(k(outerOnly(M, face)).subtract(face));
    const warnings: DecalWarning[] = [];
    let body = k(solidOf(M, models[0].parts[main.index].mesh));
    const added: Part[] = [];
    let n = 0;
    for (const { decal, regions } of active) {
      const ref = k(M.CrossSection.union(regions.map((r) => r.cs))).bounds();
      const placed = regions.map((r) => ({ color: r.color ?? decal.color, cs: k(placeDecal(r.cs, decal, ref)) }));
      const all = k(M.CrossSection.union(placed.map((p) => p.cs)));
      const area = all.area();
      if (k(all.subtract(face)).area() > area * OUTSIDE_FRAC) warnings.push({ decalId: decal.id, text: "O desenho sai da peça: a parte de fora não imprime." });
      const line = nozzleMm(); // o bico: traço mais fino que isso some
      const opened = k(k(all.offset(-line / 2, "Round")).offset(line / 2, "Round"));
      if (area - opened.area() > area * THIN_FRAC) warnings.push({ decalId: decal.id, text: `Tem traço mais fino que ${nozzleText()} mm (o bico): pode sumir na impressão. Aumente o tamanho.` });
      if (!holes.isEmpty() && !k(all.intersect(k(holes.offset(HOLE_GAP, "Round")))).isEmpty()) warnings.push({ decalId: decal.id, text: "O desenho encosta num furo ou na argola." });
      const inside = placed.map((p) => ({ color: p.color, cs: k(p.cs.intersect(face)) })).filter((p) => !p.cs.isEmpty());
      if (decal.mode === "raised") {
        for (const p of inside) added.push({ name: `Desenho ${++n}`, color: p.color, mesh: toMesh(k(k(p.cs.extrude(decal.depth)).translate([0, 0, main.z]))) });
      } else if (decal.mode === "inlay") {
        // a cor ocupa o mesmo lugar do material tirado: interseção do desenho extrudado com a peça (como o Separador)
        for (const p of inside) {
          const prism = k(k(p.cs.extrude(decal.depth + EPS)).translate([0, 0, main.z - decal.depth]));
          const fill = k(body.intersect(prism));
          if (fill.isEmpty()) continue;
          added.push({ name: `Desenho ${++n}`, color: p.color, mesh: toMesh(fill) });
          body = k(body.subtract(prism));
        }
      } else {
        const cut = k(M.CrossSection.union(inside.map((p) => p.cs)));
        const h = decal.mode === "cut" ? main.z + 2 : decal.depth + EPS;
        const z0 = decal.mode === "cut" ? -1 : main.z - decal.depth;
        body = k(body.subtract(k(k(cut.extrude(h)).translate([0, 0, z0]))));
      }
    }
    const parts = models[0].parts.map((p, i) => (i === main.index ? { ...p, mesh: toMesh(body) } : p));
    return { models: [{ ...models[0], parts: [...parts, ...added] }, ...models.slice(1)], warnings };
  });
}
