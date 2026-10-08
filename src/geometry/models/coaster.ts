import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { fitInto, followTransform, scoped } from "../shape2d";
import type { Mesh, Model, Part } from "../types";
import { backing, moveModel, requireArt, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { modelsBounds } from "../bounds";

export type CoasterShape = "round" | "square" | "hex" | "svg";

export type CoasterParams = {
  shape: CoasterShape;
  size: number; // diâmetro (redondo), lado (quadrado) ou largura entre lados (hexágono); no SVG, o maior lado do desenho
  thickness: number;
  corner: number; // cantos arredondados do quadrado e do hexágono
  content: "text" | "art";
  text: string;
  textHeight: number;
  depth: number; // quanto o desenho entra na face
  borderWidth: number; // anel decorativo na cor do desenho, rente (0 = sem)
  faceDown: boolean; // imprime com o desenho para baixo, na mesa (face lisa); desligado, o desenho fica em cima
  feet: boolean; // rebaixo para pés de silicone adesivos no lado de baixo
  stand: number; // suporte para N porta-copos (0 = sem)
  bodyColor: string;
  artColor: string;
};

export const DEFAULT_COASTER: CoasterParams = {
  shape: "round",
  size: 90,
  thickness: 4.5,
  corner: 6,
  content: "text",
  text: "Casa da Ana",
  textHeight: 14,
  depth: 0.8,
  borderWidth: 2,
  faceDown: true,
  feet: false,
  stand: 0,
  bodyColor: "#1c1c1e",
  artColor: "#f8f8f6",
};

const SEG = 128;
const INSET = 3; // o anel fica a esta distância da borda
const FILL = 0.72; // o desenho ocupa esta fração da largura do porta-copos
const FOOT_D = 8;
const FOOT_DEPTH = 1.2;
const FOOT_RING = 0.64; // posição dos pés, em frações do raio
const SVG_BORDER = 1.6;
const GAP = 8;
const SLOT_CLEARANCE = 1; // folga na largura da fenda (mm)
const SLOT_FLOOR = 3;
const SLOT_WALL = 3;
const SLOT_SHARE = 0.3; // quanto do porta-copos entra na fenda
const SLOT_EXTRA = 1.5;
const MAX_STAND = 6;
const PLA_SOFTENS = "O PLA amolece com bebida quente (acima de uns 55 °C): para café e chá, imprima em PETG.";

/** Hexágono regular com `across` mm entre lados opostos. */
const hexagon = (M: ManifoldToplevel, across: number): CS => M.CrossSection.circle(across / Math.sqrt(3), 6);

/** O contorno do porta-copos centrado na origem. */
function outline(ctx: ModelCtx, p: CoasterParams): CS {
  const { M } = ctx;
  switch (p.shape) {
    case "round":
      return M.CrossSection.circle(p.size / 2, SEG);
    case "square":
      return roundedRect(M, p.size, p.size, Math.min(p.corner, p.size / 2 - 0.5));
    case "hex": {
      const c = Math.min(p.corner, p.size / 4);
      return scoped((k) => (c > 0 ? k(hexagon(M, p.size - 2 * c)).offset(c, "Round", 2, 24) : hexagon(M, p.size)));
    }
    case "svg":
      return scoped((k) => backing(M, k(fitInto(requireArt(ctx.art), p.size - 2 * SVG_BORDER, p.size - 2 * SVG_BORDER, 0)), SVG_BORDER));
  }
}

/** Largura da região onde o nome ou o desenho cabe. */
const innerWidth = (o: CS) => {
  const b = o.bounds();
  return Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]) * FILL;
};

/** Rotação de 180° em volta de X: o lado do desenho vai para a mesa e o rebaixo dos pés fica para cima (sem suporte). */
function flip(m: Mesh, top: number): Mesh {
  const p = m.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i + 1] = -p[i + 1];
    p[i + 2] = top - p[i + 2];
  }
  return { positions: p, indices: m.indices };
}

/** O porta-copos como fica pronto (desenho em cima), depois virado para imprimir com o desenho na mesa (face lisa). */
function coaster(ctx: ModelCtx, p: CoasterParams): { model: Model; width: number; height: number; warnings: string[] } {
  const { M } = ctx;
  return scoped((k) => {
    const out = k(outline(ctx, p));
    const warnings: string[] = [];
    // nome ou arte, centrado e dentro da área útil
    let ink: CS | null = null;
    let inkParts: Part[] | null = null;
    const area = innerWidth(out);
    const top = p.thickness;
    if (p.content === "art" && p.shape !== "svg") {
      const art = requireArt(ctx.art);
      const placed = k(fitInto(art, area, area, 0));
      ink = placed;
      const layers = ctx.artLayers && ctx.artLayers.length > 1 ? ctx.artLayers.map((l) => ({ color: l.color, cs: k(k(followTransform(art, placed, l.cs)).intersect(placed)) })).filter((l) => !l.cs.isEmpty()) : null;
      inkParts = layers ? layers.map((l, i) => ({ name: `Arte ${i + 1}`, color: l.color, mesh: slab(l.cs, p.depth, top - p.depth) })) : null;
    } else if (p.text.trim()) {
      const raw = ctx.text(p.text, p.textHeight);
      if (raw) ink = k(fitInto(k(raw), area, p.textHeight, 0));
    }
    if (p.shape === "svg" && p.content === "art") warnings.push("Forma pelo desenho: o desenho já é o contorno, então o nome vai no meio. Para pôr arte na face, escolha outra forma.");
    // anel decorativo rente
    const ring = p.borderWidth > 0 ? k(k(out.offset(-INSET, "Round", 2, 48)).subtract(k(out.offset(-INSET - p.borderWidth, "Round", 2, 48)))) : null;
    const face = k(M.CrossSection.union([ink, ring].filter((c): c is CS => !!c).map((c) => k(c.translate([0, 0])))));

    const body = k(out.extrude(p.thickness));
    const cut = (s: Solid, from: Solid | null): Solid => (from ? k(s.subtract(from)) : s);
    const pocket = face.isEmpty() ? null : k(k(face.extrude(p.depth)).translate([0, 0, top - p.depth]));
    let shell: Solid = cut(body, pocket);
    if (p.feet) {
      const b = out.bounds();
      const r = (Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2) * FOOT_RING;
      const depth = Math.min(FOOT_DEPTH, p.thickness - 1.5);
      const feet = [45, 135, 225, 315].map((a) => k(k(k(M.Manifold.cylinder(depth + 0.1, FOOT_D / 2, FOOT_D / 2, 32)).translate([0, 0, -0.1])).translate([r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180), 0])));
      shell = k(shell.subtract(k(M.Manifold.union(feet))));
    }
    const turn = (m: Mesh): Mesh => (p.faceDown ? flip(m, top) : m);
    const parts: Part[] = [{ name: "Porta-copos", color: p.bodyColor, mesh: turn(solidMesh(shell)) }];
    if (inkParts) {
      parts.push(...inkParts.map((x) => ({ ...x, mesh: turn(x.mesh) })));
      if (ring) parts.push({ name: "Borda", color: p.artColor, mesh: turn(slab(ring, p.depth, top - p.depth)) });
    } else if (!face.isEmpty()) parts.push({ name: p.content === "art" ? "Arte" : "Nome", color: p.artColor, mesh: turn(slab(face, p.depth, top - p.depth)) });
    const b = out.bounds();
    return { model: { name: "Porta-copos", parts }, width: b.max[0] - b.min[0], height: b.max[1] - b.min[1], warnings };
  });
}

/** Suporte com fendas onde os porta-copos ficam em pé, de lado, lado a lado. */
function stand(ctx: ModelCtx, p: CoasterParams, width: number, height: number): Model {
  const { M } = ctx;
  const n = Math.min(Math.max(Math.round(p.stand), 1), MAX_STAND);
  const slotW = p.thickness + SLOT_CLEARANCE;
  const along = Math.max(width, height) + SLOT_EXTRA;
  const depth = Math.min(width, height) * SLOT_SHARE;
  const L = n * slotW + (n + 1) * SLOT_WALL;
  const W = along + 2 * SLOT_WALL;
  const H = depth + SLOT_FLOOR;
  return scoped((k) => {
    const block = k(k(M.Manifold.cube([L, W, H])).translate([0, 0, 0]));
    const slots = Array.from({ length: n }, (_, i) => k(k(M.Manifold.cube([slotW, along, depth + 1])).translate([SLOT_WALL + i * (slotW + SLOT_WALL), SLOT_WALL, SLOT_FLOOR])));
    return { name: "Suporte", parts: [{ name: "Suporte", color: p.bodyColor, mesh: solidMesh(k(block.subtract(k(M.Manifold.union(slots))))) }] };
  });
}

/**
 * Porta-copos: redondo, quadrado, hexágono ou com o contorno de um desenho, com o nome ou a arte rente em 2 cores e
 * um anel na borda. Imprime com o desenho para baixo (face lisa; dá para desligar), com rebaixo opcional para pés de
 * silicone no lado de cima da impressão, e um suporte opcional com fendas para 2 a 6 unidades.
 */
export function buildCoaster(ctx: ModelCtx, p: CoasterParams): ModelOutput {
  const c = coaster(ctx, p);
  const warnings = [...c.warnings, ...(p.faceDown ? ["Imprima como está: o desenho fica para baixo, na mesa, e sai com a face lisa. Depois é só virar. A prévia mostra o lado de trás."] : []), PLA_SOFTENS];
  if (c.width > bedMm() || c.height > bedMm()) warnings.push(`O porta-copos passa da mesa de ${bedMm()} mm: diminua o tamanho.`);
  const models: Model[] = [c.model];
  let total = c.width;
  if (p.stand > 0) {
    const s = stand(ctx, p, c.width, c.height);
    const sb = modelsBounds([s])!;
    const sw = sb.max[0] - sb.min[0];
    total = c.width + GAP + sw;
    models.push(moveModel(s, c.width / 2 + GAP - sb.min[0], -(sb.max[1] + sb.min[1]) / 2));
    if (total > bedMm()) warnings.push("O porta-copos e o suporte não cabem lado a lado na mesa: imprima cada um numa mesa.");
  }
  // o conjunto fica centrado na origem
  const placed = models.map((m) => moveModel(m, -total / 2 + c.width / 2, 0));
  return { models: placed, warnings };
}
