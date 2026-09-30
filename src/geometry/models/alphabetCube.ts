import { bedMm } from "../bed";
import type { ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model } from "../types";
import { MissingInput, moveModel, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type AlphabetCubeParams = {
  kit: string; // kit de um nome: um cubo por letra (vazio = um cubo com as 6 faces abaixo)
  face1: string; // frente, direita, trás, esquerda, topo, baixo
  face2: string;
  face3: string;
  face4: string;
  face5: string;
  face6: string;
  size: number;
  radius: number; // cantos arredondados
  depth: number; // profundidade do desenho da face (preenchido na outra cor, rente)
  bodyColor: string;
  faceColor: string;
};

export const DEFAULT_ALPHABET_CUBE: AlphabetCubeParams = {
  kit: "",
  face1: "A",
  face2: "B",
  face3: "C",
  face4: "1",
  face5: "2",
  face6: "♥",
  size: 40,
  radius: 4,
  depth: 1.2,
  bodyColor: "#f8f8f6",
  faceColor: "#2563eb",
};

const FACE_FILL = 0.62; // o desenho ocupa esta fração da face
const GAP = 8;
const SMALL_MM = 45; // abaixo disso o cubo cabe na boca de criança pequena
const SPHERE_SEG = 24;

/** Rotações (graus) que levam a face de cima para cada face, com o desenho de pé para quem olha de fora. */
const FACES: [number, number, number][][] = [
  [[90, 0, 0]], // frente (−Y)
  [[90, 0, 0], [0, 0, 90]], // direita (+X)
  [[90, 0, 0], [0, 0, 180]], // trás (+Y)
  [[90, 0, 0], [0, 0, -90]], // esquerda (−X)
  [], // topo
  [[0, 180, 0]], // baixo (girar em Y: quem olha de baixo lê sem espelhar)
];

/** Cubo de lado `s` centrado na origem, com cantos de raio `r` (casco de 8 esferas). */
function roundedCube(M: ManifoldToplevel, s: number, r: number): Solid {
  const rr = Math.min(Math.max(r, 0.01), s / 2 - 0.01);
  const c = s / 2 - rr;
  return scoped((k) => M.Manifold.hull([-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => k(k(M.Manifold.sphere(rr, SPHERE_SEG)).translate([x * c, y * c, z * c])))))));
}

/** Um cubo: corpo com os 6 desenhos afundados e os desenhos, rentes, noutra cor. */
function cube(ctx: ModelCtx, faces: string[], p: AlphabetCubeParams, name: string): Model | null {
  const { M, text } = ctx;
  return scoped((k) => {
    const side = p.size * FACE_FILL;
    const glyphs: Solid[] = [];
    faces.forEach((s, i) => {
      const raw = text(s, side);
      if (!raw) return;
      const cs = k(fitInto(k(raw), side, side, 0));
      let g = k(k(cs.extrude(p.depth + 0.01)).translate([0, 0, p.size / 2 - p.depth]));
      for (const r of FACES[i]) g = k(g.rotate(r));
      glyphs.push(g);
    });
    if (!glyphs.length) return null;
    const body = k(roundedCube(M, p.size, p.radius));
    const art = k(k(M.Manifold.union(glyphs)).intersect(body));
    const lift = (s: Solid) => solidMesh(k(s.translate([0, 0, p.size / 2])));
    return { name, parts: [{ name: "Cubo", color: p.bodyColor, mesh: lift(k(body.subtract(art))) }, { name: "Desenho", color: p.faceColor, mesh: lift(art) }] };
  });
}

/**
 * Cubo alfabeto: cantos arredondados, um desenho (letra, número ou emoji como ♥ ⭐) em cada uma das 6 faces,
 * afundado e preenchido rente noutra cor, então imprime em qualquer face sem suporte. Kit de nome: um cubo por
 * letra, com a letra nas 6 faces.
 */
export function buildAlphabetCube(ctx: ModelCtx, p: AlphabetCubeParams): ModelOutput {
  const letters = [...p.kit.replace(/\s/g, "")];
  const sets = letters.length ? letters.map((ch) => ({ name: ch, faces: Array(6).fill(ch) })) : [{ name: "Cubo", faces: [p.face1, p.face2, p.face3, p.face4, p.face5, p.face6] }];
  const models = sets.map((s) => cube(ctx, s.faces, p, s.name)).filter((m): m is Model => !!m);
  if (!models.length) throw new MissingInput("Digite o que vai em cada face (ou o nome do kit).");
  const step = p.size + GAP;
  const laid = models.map((m, i) => moveModel(m, (i - (models.length - 1) / 2) * step, 0));
  const warnings = [p.size < SMALL_MM ? "Cubo pequeno: não é brinquedo para menores de 3 anos (risco de engasgo)." : "Brinquedo: para menores de 3 anos, use cubos de 45 mm ou mais e confira se nada solta."];
  if (models.length * step - GAP > bedMm()) warnings.push(`O kit passa da mesa de ${bedMm()} mm numa fila: imprima em mais de uma vez ou diminua o cubo.`);
  return { models: laid, warnings };
}
