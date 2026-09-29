import { qrMatrix } from "../../domain/qr";
import type { CS } from "../manifold";
import { qrModel } from "../qr3d";
import { fitInto, outerOnly, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { artParts, backing, MissingInput, moveMesh, plateStand, size2, slab, solidMesh, union, type ModelCtx, type ModelOutput } from "./common";
import { ornament, type Ornament } from "./shapes";
import { recessTexture, type BgTexture } from "./textures";

export type SignMount = "none" | "stand" | "hang";

export type LayeredSignParams = {
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  dx1: number;
  dx2: number;
  dx3: number;
  dx4: number;
  font1: string; // fonte de cada linha
  font2: string;
  font3: string;
  font4: string;
  c1: string;
  c2: string;
  c3: string;
  c4: string;
  overlap: number; // fração da altura da linha seguinte que sobe sobre a anterior
  relief: number; // altura da 1ª linha sobre a base
  layerStep: number; // cada linha seguinte sobe mais isto (fica por cima nas sobreposições)
  fillHoles: boolean;
  artHeight: number; // imagem ao lado do texto (se enviada)
  artColor: string;
  qr: string; // link ou texto do QR ao lado (vazio = sem QR)
  qrSize: number;
  qrColor: string;
  ornament: "none" | Ornament;
  ornamentSize: number;
  ornamentColor: string;
  border: number;
  baseThickness: number;
  baseColor: string;
  mount: SignMount;
  /** Textura rebaixada no fundo (#50). */
  texture: BgTexture;
  texturePitch: number;
  textureDepth: number;
};

export const DEFAULT_LAYERED_SIGN: LayeredSignParams = {
  line1: "Feliz",
  line2: "Aniversário",
  line3: "",
  line4: "",
  h1: 28,
  h2: 22,
  h3: 16,
  h4: 16,
  dx1: 0,
  dx2: 0,
  dx3: 0,
  dx4: 0,
  font1: "pacifico",
  font2: "hanken",
  font3: "hanken",
  font4: "hanken",
  c1: "#d6262e",
  c2: "#1c1c1e",
  c3: "#2563eb",
  c4: "#16a34a",
  overlap: 0.2,
  relief: 1.2,
  layerStep: 0.6,
  fillHoles: false,
  artHeight: 40,
  artColor: "#c9a227",
  qr: "",
  qrSize: 30,
  qrColor: "#1c1c1e",
  ornament: "none",
  ornamentSize: 16,
  ornamentColor: "#d6262e",
  border: 4,
  baseThickness: 3,
  baseColor: "#f8f8f6",
  mount: "stand",
  texture: "none",
  texturePitch: 6,
  textureDepth: 0.6,
};

const LINES = [1, 2, 3, 4] as const;
const GAP = 4; // entre imagem/enfeite e o texto
const HANG_R = 2;
const HANG_INSET = 5;
const BED_MM = 256;
const TEX_MARGIN = 1.5;

/**
 * Letreiro em camadas: até 4 linhas de texto, cada uma com cor, tamanho e deslocamento próprios, empilhadas com
 * sobreposição (a linha de baixo fica por cima nas partes em que se cruzam), imagem opcional à esquerda, enfeite à
 * direita e base com contorno automático. Um volume por cor; fica em pé (suporte) ou pendura (2 furos).
 */
export function buildLayeredSign(ctx: ModelCtx, p: LayeredSignParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    // linhas empilhadas de cima para baixo, com a sobreposição pedida
    const lines: { cs: CS; color: string }[] = [];
    let cursor = 0;
    for (const i of LINES) {
      const s = String(p[`line${i}`]);
      const h = p[`h${i}`];
      const raw = (ctx.fontText?.(`font${i}`) ?? ctx.text)(s, h);
      if (!raw) continue;
      let cs = k(raw);
      if (p.fillHoles) cs = k(outerOnly(M, cs));
      const b = cs.bounds();
      const top = lines.length ? cursor + p.overlap * h : 0;
      lines.push({ cs: k(cs.translate([p[`dx${i}`] - (b.min[0] + b.max[0]) / 2, top - b.max[1]])), color: p[`c${i}`] });
      cursor = top - (b.max[1] - b.min[1]);
    }
    if (!lines.length) throw new MissingInput("Digite pelo menos uma linha de texto.");
    const textAll = k(union(M, lines.map((l) => l.cs)));
    const tb = textAll.bounds();
    const cy = (tb.min[1] + tb.max[1]) / 2;

    const parts: Part[] = [];
    // cada linha: só o que não fica embaixo das linhas seguintes; as seguintes sobem layerStep a mais
    lines.forEach((l, i) => {
      const above = lines.slice(i + 1).map((x) => x.cs);
      const visible = above.length ? k(l.cs.subtract(k(union(M, above)))) : l.cs;
      if (!visible.isEmpty()) parts.push({ name: `Linha ${i + 1}`, color: l.color, mesh: slab(visible, p.relief + i * p.layerStep, p.baseThickness) });
    });

    const extras: CS[] = [];
    const warnings: string[] = [];
    if (ctx.art) {
      const placed = k(fitInto(ctx.art, 1e6, p.artHeight, cy));
      const [aw] = size2(placed);
      const moved = k(placed.translate([tb.min[0] - GAP - aw / 2, 0]));
      extras.push(moved);
      parts.push(...artParts(ctx, moved, p.artColor, "Imagem", p.relief, p.baseThickness));
    }
    let right = tb.max[0];
    if (p.qr.trim()) {
      const qr = qrModel(M, qrMatrix(p.qr.trim()), { sizeMm: p.qrSize, baseMm: p.baseThickness, reliefMm: p.relief, quiet: 0, qrColor: p.qrColor });
      const x = right + GAP + p.qrSize / 2;
      extras.push(k(M.CrossSection.square([p.qrSize, p.qrSize], true).translate([x, cy])));
      parts.push({ name: "QR", color: p.qrColor, mesh: moveMesh(qr.model.parts[1].mesh, x, cy) });
      warnings.push(...qr.warnings);
      right = x + p.qrSize / 2;
    }
    if (p.ornament !== "none") {
      const o = k(ornament(M, p.ornament, p.ornamentSize));
      const [ow] = size2(o);
      const moved = k(o.translate([right + GAP + ow / 2, tb.max[1] - p.ornamentSize / 2]));
      extras.push(moved);
      parts.push({ name: "Enfeite", color: p.ornamentColor, mesh: slab(moved, p.relief, p.baseThickness) });
    }

    let base = k(backing(M, k(union(M, [textAll, ...extras])), p.border));
    if (p.mount === "hang") {
      const bb = base.bounds();
      const y = bb.max[1] - HANG_INSET;
      const holes = [0.25, 0.75].map((f) => k(M.CrossSection.circle(HANG_R, 32).translate([bb.min[0] + (bb.max[0] - bb.min[0]) * f, y])));
      const room = k(base.offset(-(HANG_R + 1), "Round"));
      const inside = holes.filter((h) => k(h.subtract(room)).isEmpty());
      if (inside.length < 2) warnings.push("Não coube um furo de pendurar em cada lado da base: aumente a borda ou use o suporte.");
      if (inside.length) base = k(base.subtract(k(union(M, inside))));
    }
    // textura no fundo visível da base (fora do texto, da imagem e do enfeite)
    const texRegion = k(k(base.offset(-Math.min(TEX_MARGIN, p.border / 2), "Round")).subtract(k(k(union(M, [textAll, ...extras])).offset(TEX_MARGIN, "Round"))));
    const baseSolid = k(recessTexture(M, k(base.extrude(p.baseThickness)), texRegion, p.baseThickness, p.texture, p.texturePitch, p.textureDepth));
    const models: Model[] = [{ name: "Letreiro", parts: [{ name: "Base", color: p.baseColor, mesh: solidMesh(baseSolid) }, ...parts] }];
    const [W, H] = size2(base);
    if (p.mount === "stand") models.push(plateStand(M, W, p.baseThickness, p.baseColor, base.bounds().min[1] - 25));
    if (Math.max(W, H) > BED_MM) warnings.push(`O letreiro tem ${Math.round(W)} × ${Math.round(H)} mm: passa da mesa de ${BED_MM} mm. Diminua as alturas das linhas.`);
    return { models, warnings };
  });
}
