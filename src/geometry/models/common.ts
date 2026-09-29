import type { ColorLayer2D } from "../extrude";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { followTransform, outerOnly, scoped } from "../shape2d";
import type { Mesh, Model, Part } from "../types";

/** Texto → região 2D em mm (altura total pedida), centrada; null se vazio. Quem chama dá delete(). */
export type TextFn = (text: string, heightMm: number) => CS | null;

export type ModelCtx = {
  M: ManifoldToplevel;
  text: TextFn;
  /** Desenho enviado pelo usuário (SVG/imagem já vetorizada), em mm, ou null. */
  art: CS | null;
  /** Desenho colorido: uma região por cor, no mesmo sistema de `art` (null = 1 cor). */
  artLayers?: ColorLayer2D[] | null;
  /** Texto em arco (linha de base no raio `r`, em cima ou embaixo); ausente = modelos usam texto reto. */
  arc?: (text: string, heightMm: number, radius: number, side: "top" | "bottom") => CS | null;
  /** Texto na fonte escolhida num campo "font" do modelo (ex.: a letra grande); ausente = use `text`. */
  fontText?: (fontField: string) => TextFn;
};

export type ModelOutput = {
  models: Model[];
  /** Alturas (topo da camada) onde a impressora pausa — vão para o 3MF. */
  pauses?: number[];
  warnings?: string[];
};

/** Região extrudada de `z` a `z + h`, já como malha. */
export function slab(cs: CS, h: number, z = 0): Mesh {
  return scoped((k) => toMesh(k(k(cs.extrude(h)).translate([0, 0, z]))));
}

export const solidMesh = (s: Solid): Mesh => toMesh(s);

export function moveMesh(m: Mesh, dx: number, dy: number, dz = 0): Mesh {
  const p = m.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i] += dx;
    p[i + 1] += dy;
    p[i + 2] += dz;
  }
  return { positions: p, indices: m.indices };
}

export const moveModel = (m: Model, dx: number, dy: number): Model => ({ ...m, parts: m.parts.map((p) => ({ ...p, mesh: moveMesh(p.mesh, dx, dy) })) });

/** Retângulo de cantos arredondados centrado na origem. */
export function roundedRect(M: ManifoldToplevel, w: number, h: number, r: number): CS {
  const rr = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  return scoped((k) => {
    const sq = k(M.CrossSection.square([w - 2 * rr, h - 2 * rr], true));
    return rr > 0 ? sq.offset(rr, "Round", 2, 48) : sq.translate([0, 0]);
  });
}

const BRIDGE_MM = 4;

/** Fundo que contorna o desenho com `border` mm, unindo letras afastadas numa peça só. */
export function backing(M: ManifoldToplevel, cs: CS, border: number): CS {
  return scoped((k) => {
    const out = outerOnly(M, k(k(cs.offset(border + BRIDGE_MM, "Round")).offset(-BRIDGE_MM, "Round")));
    if (out.decompose().map(k).length <= 1) return out;
    k(out);
    return out.hull();
  });
}

/** Une regiões (ignora null). */
export function union(M: ManifoldToplevel, parts: (CS | null)[]): CS {
  return M.CrossSection.union(parts.filter((p): p is CS => p !== null));
}

/** Largura e altura de uma região. */
export function size2(cs: CS): [number, number] {
  const b = cs.bounds();
  return [b.max[0] - b.min[0], b.max[1] - b.min[1]];
}

/**
 * Arte já posicionada (`placed` = `art` escalada/movida) como partes: uma por cor se o desenho for colorido,
 * senão uma só em `color`. Altura `h` a partir de `z`.
 */
export function artParts({ art, artLayers }: ModelCtx, placed: CS, color: string, name: string, h: number, z: number): Part[] {
  if (!art || !artLayers || artLayers.length < 2) return [{ name, color, mesh: slab(placed, h, z) }];
  return scoped((k) =>
    artLayers
      .map((l) => ({ color: l.color, cs: k(k(followTransform(art, placed, l.cs)).intersect(placed)) }))
      .filter((l) => !l.cs.isEmpty())
      .map((l, i) => ({ name: `${name} ${i + 1}`, color: l.color, mesh: slab(l.cs, h, z) })),
  );
}

/** Falta um dado obrigatório (texto, desenho, chave): a interface mostra como estado vazio, não como erro. */
export class MissingInput extends Error {}

/** Exige um desenho enviado. */
export function requireArt(art: CS | null): CS {
  if (!art || art.isEmpty()) throw new MissingInput("Envie um desenho (SVG ou imagem) para ver o modelo.");
  return art;
}

const STAND_TILT_DEG = 12;
const STAND_CLEARANCE = 0.5;

/** Suporte de mesa: bloco com rasgo inclinado onde uma placa de espessura `t` encaixa em pé. */
export function plateStand(M: ManifoldToplevel, width: number, t: number, color: string, y: number): Model {
  const w = width * 0.7, d = 30, h = 12, depth = 8;
  return scoped((k) => {
    const block = k(k(M.Manifold.cube([w, d, h], true)).translate([0, 0, h / 2]));
    const slot = k(k(k(M.Manifold.cube([w + 10, t + STAND_CLEARANCE, 40], true)).translate([0, 0, 20])).rotate([-STAND_TILT_DEG, 0, 0]));
    const cut = k(block.subtract(k(slot.translate([0, 0, h - depth]))));
    return { name: "Suporte", parts: [{ name: "Suporte", color, mesh: moveMesh(solidMesh(cut), 0, y) }] };
  });
}
