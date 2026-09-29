import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { medalOutline } from "../medal";
import { fitInto, scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type TextureRollerParams = {
  /** Diâmetro de rolagem (por fora do relevo). */
  diameter: number;
  /** Largura do rolo (comprimento ao longo do eixo). */
  width: number;
  /** tiles: desenho repetido em mosaico; wrap: um desenho esticado em volta. */
  pattern: "tiles" | "wrap";
  tileSize: number;
  /** Fileiras alternadas deslocadas meio ladrilho. */
  brick: boolean;
  /** high: desenho saltado (marca afundada na massa); low: desenho rebaixado (marca em relevo). */
  relief: "high" | "low";
  depth: number;
  ends: "axle" | "handles";
  axleDiameter: number;
  handleDiameter: number;
  handleLength: number;
  color: string;
};

export const DEFAULT_TEXTURE_ROLLER: TextureRollerParams = {
  diameter: 40,
  width: 80,
  pattern: "tiles",
  tileSize: 14,
  brick: true,
  relief: "high",
  depth: 1.5,
  ends: "axle",
  axleDiameter: 8.4,
  handleDiameter: 16,
  handleLength: 35,
  color: "#f5f5f4",
};

const SEGMENTS = 160;
const OVERLAP = 0.3; // o relevo entra um pouco no cilindro para unir
const REFINE_MM = 0.8; // aresta máxima antes de enrolar: curva lisa
const FILL = 0.8; // quanto do ladrilho o desenho ocupa

/** Ladrilhos que fecham a volta exata (sem costura): número inteiro de colunas e fileiras. */
export function rollerGrid(diameter: number, width: number, tileSize: number) {
  const C = Math.PI * diameter;
  const cols = Math.max(1, Math.round(C / tileSize));
  const rows = Math.max(1, Math.round(width / tileSize));
  return { C, cols, rows, cellW: C / cols, cellH: width / rows };
}

/** Desenho no plano desenrolado: x ∈ [0, C) em volta, y ∈ [0, width] ao longo do eixo. */
function flatPattern(M: ManifoldToplevel, art: CS, p: TextureRollerParams, C: number): CS {
  return scoped((k) => {
    const band = k(M.CrossSection.square([C, p.width]));
    if (p.pattern === "wrap") return k(k(fitInto(art, C, p.width, 0)).translate([C / 2, p.width / 2])).intersect(band);
    const g = rollerGrid(p.diameter, p.width, p.tileSize);
    const tile = k(fitInto(art, g.cellW * FILL, g.cellH * FILL, 0));
    const tiles: CS[] = [];
    for (let j = 0; j < g.rows; j++)
      for (let i = 0; i < g.cols; i++) {
        const x = (i + 0.5 + (p.brick && j % 2 ? 0.5 : 0)) * g.cellW;
        const y = (j + 0.5) * g.cellH;
        tiles.push(k(tile.translate([x, y])));
        if (x + g.cellW * FILL / 2 > C) tiles.push(k(tile.translate([x - C, y]))); // o que passa da emenda volta do outro lado
      }
    return k(M.CrossSection.union(tiles)).intersect(band);
  });
}

/** Enrola um sólido do plano (x em volta, y no eixo, z para fora) num cilindro de raio `r0` (eixo = Z). */
function wrap(s: Solid, C: number, r0: number): Solid {
  const fine = s.refineToLength(REFINE_MM);
  const out = fine.warp((v) => {
    const a = (2 * Math.PI * v[0]) / C; // anti-horário: mantém a malha do lado de fora certo
    const r = r0 + v[2];
    const z = v[1];
    v[0] = r * Math.cos(a);
    v[1] = r * Math.sin(a);
    v[2] = z;
  });
  fine.delete();
  return out;
}

/**
 * Rolo de textura para massa, argila e biscoito (#64): o desenho é montado no plano (mosaico com número inteiro de
 * ladrilhos, em tijolo, ou uma imagem esticada) e enrolado no cilindro, sem costura. Imprime em pé; eixo passante
 * para um cabo de madeira ou cabos impressos nas pontas.
 */
export function buildTextureRoller(ctx: ModelCtx, p: TextureRollerParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const R = p.diameter / 2;
    const depth = Math.min(p.depth, R / 3);
    const C = Math.PI * p.diameter;
    const art0: CS = ctx.art && !ctx.art.isEmpty() ? ctx.art : k(medalOutline(M, "star", 20));
    const art = k(art0.scale([-1, 1])); // a massa recebe o espelho do rolo: espelhando aqui, a marca lê certo
    const flat = k(flatPattern(M, art, p, C));
    const slab = k(k(flat.extrude(depth + OVERLAP)).translate([0, 0, -OVERLAP]));
    let roller: Solid;
    if (p.relief === "high") {
      const core = k(M.Manifold.cylinder(p.width, R - depth, R - depth, SEGMENTS));
      roller = k(core.add(k(wrap(slab, C, R - depth))));
    } else {
      const core = k(M.Manifold.cylinder(p.width, R, R, SEGMENTS));
      const cut = k(wrap(k(flat.extrude(depth + OVERLAP)), C, R - depth)); // passa um pouco da superfície
      roller = k(core.subtract(cut));
    }
    if (p.ends === "handles") {
      const hr = Math.min(p.handleDiameter / 2, R - depth - 1);
      const handle = k(M.Manifold.cylinder(p.handleLength, hr, hr, 64));
      roller = k(M.Manifold.union([k(roller.translate([0, 0, p.handleLength])), handle, k(handle.translate([0, 0, p.handleLength + p.width]))]));
    } else {
      roller = k(roller.subtract(k(k(M.Manifold.cylinder(p.width + 2, p.axleDiameter / 2, p.axleDiameter / 2, 64)).translate([0, 0, -1]))));
    }
    const warnings = flat.isEmpty() ? ["O desenho ficou pequeno demais para o ladrilho: aumente o tamanho do ladrilho."] : [];
    return { models: [{ name: "Rolo de textura", parts: [{ name: "Rolo", color: p.color, mesh: solidMesh(roller) }] }], warnings };
  });
}
