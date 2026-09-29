import type { CS, ManifoldToplevel } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { moveMesh, roundedRect, size2, slab, solidMesh, type ModelCtx, type ModelOutput, type TextFn } from "./common";

export type PhotoSize = "10x15" | "15x10" | "polaroid" | "custom";

export type PhotoHolderParams = {
  photo: PhotoSize;
  photoWidth: number; // medida livre: largura da foto em pé na fenda
  photoThickness: number;
  clearance: number;
  tilt: number; // inclinação da foto para trás (graus)
  depth: number; // profundidade da base
  height: number; // altura da base
  text: string;
  textHeight: number;
  spacing: number; // espaço extra entre letras (mm)
  textThickness: number;
  baseColor: string;
  textColor: string;
};

export const DEFAULT_PHOTO_HOLDER: PhotoHolderParams = {
  photo: "15x10",
  photoWidth: 100,
  photoThickness: 0.3,
  clearance: 0.8,
  tilt: 8,
  depth: 35,
  height: 18,
  text: "Família",
  textHeight: 12,
  spacing: 0,
  textThickness: 2,
  baseColor: "#f8f8f6",
  textColor: "#c9a227",
};

/** Largura da foto em pé na fenda (mm). */
const PHOTO_W: Record<Exclude<PhotoSize, "custom">, number> = { "10x15": 100, "15x10": 150, polaroid: 88 };
const END = 10; // base passa da foto de cada lado
const SLOT_DEPTH_FRAC = 0.6; // fenda desce até esta fração da altura
const SLOT_Y_FRAC = 0.15; // fenda um pouco atrás do meio
const GAP = 8;

/** Texto com espaço extra entre as letras (letra a letra; sem espaço, o texto inteiro com o kerning da fonte). */
export function spacedText(M: ManifoldToplevel, text: TextFn, s: string, h: number, spacing: number): CS | null {
  if (!spacing) return text(s, h);
  return scoped((k) => {
    const chars = [...s.trim()];
    let x = 0;
    const placed: CS[] = [];
    const space = h * 0.3;
    for (const ch of chars) {
      const g = ch.trim() ? text(ch, h) : null;
      if (!g) {
        x += space + spacing;
        continue;
      }
      const [w] = size2(k(g));
      const b = g.bounds();
      placed.push(k(g.translate([x - b.min[0], 0])));
      x += w + spacing;
    }
    if (!placed.length) return null;
    const all = k(M.CrossSection.union(placed));
    const b = all.bounds();
    return all.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
  });
}

/**
 * Porta-foto: base com fenda inclinada para a foto (10×15, 15×10, polaroid ou medida livre) e texto em relevo
 * impresso à parte, noutra cor, para colar na frente. A base sai de cabeça para baixo: a face de cima fica lisa.
 */
export function buildPhotoHolder({ M, text }: ModelCtx, p: PhotoHolderParams): ModelOutput {
  return scoped((k) => {
    const photoW = p.photo === "custom" ? p.photoWidth : PHOTO_W[p.photo];
    const L = photoW + 2 * END;
    let base = k(k(roundedRect(M, L, p.depth, 3)).extrude(p.height));
    // fenda: caixa fina inclinada para trás, da face de cima até SLOT_DEPTH_FRAC da altura
    const slotH = p.height * SLOT_DEPTH_FRAC;
    const slot = k(
      k(k(M.Manifold.cube([photoW + p.clearance, p.photoThickness + p.clearance, slotH * 2], true)).rotate([-p.tilt, 0, 0])).translate([0, p.depth * SLOT_Y_FRAC, p.height]),
    );
    base = k(base.subtract(slot));
    // de cabeça para baixo (gira em X), apoiada na mesa
    const flipped = k(k(base.rotate([180, 0, 0])).translate([0, 0, p.height]));
    const models = [{ name: "Base", parts: [{ name: "Base", color: p.baseColor, mesh: solidMesh(flipped) }] }];
    const warnings = ["A base sai de cabeça para baixo para a face de cima ficar lisa; o texto sai à parte para colar na frente."];
    const raw = spacedText(M, text, p.text, p.textHeight, p.spacing);
    if (raw) {
      const t = k(fitInto(k(raw), L - 2 * END, Math.min(p.textHeight, p.height - 2), 0));
      const [, th] = size2(t);
      models.push({ name: "Texto", parts: [{ name: "Texto", color: p.textColor, mesh: moveMesh(slab(t, p.textThickness), 0, -p.depth / 2 - GAP - th / 2) }] });
      if (size2(raw)[0] > L - 2 * END + 0.01) warnings.push("O texto foi reduzido para caber na frente da base.");
    }
    return { models, warnings };
  });
}
