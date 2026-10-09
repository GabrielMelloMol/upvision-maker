import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { texturePattern, type BgTexture } from "./textures";
import { MissingInput, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import type { Model } from "../types";

/*
 * Azulejo decorativo em relevo e molde para gesso (#116): um padrão (as mesmas texturas das placas, #50) ou um
 * desenho enviado se repete numa placa X × Y que emenda sem costura com a vizinha; o molde é o negativo (a face do
 * relevo para baixo, no fundo), com parede e chanfro de saída, no mesmo princípio do molde de carimbo (#73).
 */
export type TileKind = Exclude<BgTexture, "none">;
export type TileSource = TileKind | "art";
export type TileOutput = "tile" | "mold" | "both" | "grid";

export type ReliefTileParams = {
  kind: TileSource;
  /** Lado do azulejo (mm). */
  width: number;
  height: number;
  /** Passo do padrão (ou lado de cada desenho), em mm. */
  pitch: number;
  /** Espessura da placa lisa e altura do relevo. */
  base: number;
  depth: number;
  output: TileOutput;
  /** Molde: parede em volta, espessura do fundo e folga de saída por lado na boca da cavidade (chanfro). */
  wall: number;
  floor: number;
  draft: number;
  color: string;
  moldColor: string;
};

export const DEFAULT_RELIEF_TILE: ReliefTileParams = {
  kind: "hexagons",
  width: 100,
  height: 100,
  pitch: 12,
  base: 4,
  depth: 2,
  output: "tile",
  wall: 8,
  floor: 4,
  draft: 1.5,
  color: "#f1ece4",
  moldColor: "#0ea5e9",
};

const ART_FILL = 0.8; // fração da célula que o desenho ocupa
const RIM = 3; // altura da borda do molde acima do nível do gesso
const GAP = 10;
const EPS = 0.01;

/** Período (x, y) em mm do padrão `kind` com passo `pitch`: o azulejo cabe um número inteiro deles. */
export function cellOf(kind: TileKind, pitch: number): [number, number] {
  switch (kind) {
    case "stripes":
      return [pitch * Math.SQRT2, pitch * Math.SQRT2];
    case "waves":
      return [pitch * 2, pitch];
    case "hexagons":
      return [(pitch / 2) * Math.sqrt(3), pitch * 1.5];
    case "dots":
      return [pitch, pitch];
    case "checker":
      return [pitch * 2, pitch * 2];
  }
}

/** Listras a 45° ancoradas na origem (as do texturePattern dependem do tamanho da região, e aqui precisam emendar). */
function diagonalStripes(M: ManifoldToplevel, w: number, h: number, pitch: number): CS {
  const s = pitch * Math.SQRT2; // distância entre listras medida na horizontal
  const bands: [number, number][][] = [];
  for (let n = Math.floor(-h / s) - 1; n <= Math.ceil(w / s) + 1; n++) {
    const d = n * s;
    bands.push([[d, 0], [d + s / 2, 0], [d + s / 2 + h, h], [d + h, h]]);
  }
  return scoped((k) => {
    const all = k(new M.CrossSection(bands, "NonZero"));
    return all.intersect(k(M.CrossSection.square([w, h])));
  });
}

/** Padrão de `nx × ny` períodos, de (0, 0) a (nx·px, ny·py), sem escala. Quem chama dá delete(). */
export function rawPattern(M: ManifoldToplevel, kind: TileKind, nx: number, ny: number, pitch: number): CS {
  const [px, py] = cellOf(kind, pitch);
  if (kind === "stripes") return diagonalStripes(M, nx * px, ny * py, pitch);
  return scoped((k) => {
    const region = k(M.CrossSection.square([nx * px, ny * py]));
    return texturePattern(M, region, kind, pitch)!;
  });
}

/** Padrão esticado de leve para o azulejo `w × h` ter períodos inteiros, de (0, 0) a (w, h). Quem chama dá delete(). */
export function periodicPattern(M: ManifoldToplevel, kind: TileKind, w: number, h: number, pitch: number): CS {
  const [px, py] = cellOf(kind, pitch);
  const nx = Math.max(1, Math.round(w / px)), ny = Math.max(1, Math.round(h / py));
  return scoped((k) => {
    const raw = k(rawPattern(M, kind, nx, ny, pitch));
    return raw.scale([w / (nx * px), h / (ny * py)]);
  });
}

/** Desenho enviado repetido numa grade de células quadradas de ~`pitch` mm; cabe um número inteiro delas. */
function artPattern(M: ManifoldToplevel, art: CS, w: number, h: number, pitch: number): CS {
  return scoped((k) => {
    const nx = Math.max(1, Math.round(w / pitch)), ny = Math.max(1, Math.round(h / pitch));
    const cw = w / nx, ch = h / ny;
    const motif = k(fitInto(art, cw * ART_FILL, ch * ART_FILL, 0));
    const copies: CS[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) copies.push(k(motif.translate([(i + 0.5) * cw, (j + 0.5) * ch])));
    return M.CrossSection.union(copies);
  });
}

const rect = (M: ManifoldToplevel, w: number, h: number): CS => M.CrossSection.square([w, h], true);
const mesh = (s: Solid) => solidMesh(s);

/** Azulejo (placa + relevo) com o canto em (0, 0), face do relevo para cima. */
function tileSolid(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D, pattern: CS, p: ReliefTileParams): Solid {
  const centered = k(pattern.translate([-p.width / 2, -p.height / 2]));
  const slab = k(k(rect(M, p.width, p.height)).extrude(p.base));
  const relief = k(k(centered.extrude(p.depth + EPS)).translate([0, 0, p.base - EPS]));
  return k(slab.add(relief));
}

/** Molde: bloco com a cavidade do azulejo de cabeça para baixo (relevo no fundo) e boca chanfrada. */
function moldSolid(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D, pattern: CS, p: ReliefTileParams): Solid {
  const total = p.floor + p.depth + p.base + RIM;
  const block = k(k(rect(M, p.width + 2 * p.wall, p.height + 2 * p.wall)).extrude(total));
  const centered = k(pattern.translate([-p.width / 2, -p.height / 2]));
  const recess = k(k(centered.extrude(p.depth + 2 * EPS)).translate([0, 0, p.floor - EPS]));
  const bodyH = p.base + RIM + EPS;
  const sx = (p.width + 2 * p.draft) / p.width, sy = (p.height + 2 * p.draft) / p.height;
  const body = k(k(k(rect(M, p.width, p.height)).extrude(bodyH, 0, 0, [sx, sy])).translate([0, 0, p.floor + p.depth]));
  return k(block.subtract(k(M.Manifold.union([recess, body]))));
}

/** Nove azulejos juntos (3×3), fundidos numa peça só, para conferir a emenda. */
function gridSolid(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D, tile: Solid, p: ReliefTileParams): Solid {
  const copies: Solid[] = [];
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) copies.push(k(tile.translate([i * p.width, j * p.height, 0])));
  return k(M.Manifold.union(copies));
}

export function buildReliefTile(ctx: ModelCtx, p: ReliefTileParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    let pattern: CS;
    if (p.kind === "art") {
      if (!ctx.art || ctx.art.isEmpty()) throw new MissingInput("Envie um desenho para repetir no azulejo, ou escolha um padrão.");
      pattern = k(artPattern(M, ctx.art, p.width, p.height, p.pitch));
    } else pattern = k(periodicPattern(M, p.kind, p.width, p.height, p.pitch));
    const models: Model[] = [];
    const tile = tileSolid(M, k, pattern, p);
    const mold = p.output === "mold" || p.output === "both" ? moldSolid(M, k, pattern, p) : null;
    if (p.output === "tile" || p.output === "both") models.push({ name: "Azulejo", parts: [{ name: "Azulejo", color: p.color, mesh: mesh(tile) }] });
    if (p.output === "grid") models.push({ name: "Conjunto 3×3", parts: [{ name: "Conjunto 3×3", color: p.color, mesh: mesh(gridSolid(M, k, tile, p)) }] });
    if (mold) {
      const moved = p.output === "both" ? k(mold.translate([(p.width + 2 * p.wall) / 2 + p.width / 2 + GAP, 0, 0])) : mold;
      models.push({ name: "Molde", parts: [{ name: "Molde", color: p.moldColor, mesh: mesh(moved) }] });
    }
    const extent = p.output === "grid" ? Math.max(3 * p.width, 3 * p.height) : Math.max(p.width, p.height) + (mold ? 2 * p.wall : 0);
    const warnings = extent > bedMm() ? [`A peça tem ${Math.round(extent)} mm de lado: passa da mesa de ${bedMm()} mm. Diminua o azulejo.`] : [];
    return { models, warnings };
  });
}
