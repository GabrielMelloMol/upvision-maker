import type { CS, ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { fitInto, scoped, shrinkToFit } from "./shape2d";
import { flatten, parsePath } from "./svgPath";
import type { Model } from "./types";

export type MedalShape = "circle" | "hexagon" | "star" | "shield";

export type MedalParams = {
  shape: MedalShape;
  diameter: number;
  thickness: number; // base
  rim: number; // largura da borda em relevo
  relief: number; // altura de borda, texto e imagem sobre a base
  ribbon: number; // largura da fita (0 = sem alça)
  baseColor: string;
  accentColor: string; // borda + texto
  artColor: string;
};

export const DEFAULT_MEDAL: MedalParams = {
  shape: "circle",
  diameter: 50,
  thickness: 3,
  rim: 2.5,
  relief: 1,
  ribbon: 20,
  baseColor: "#2563eb",
  accentColor: "#f5c542",
  artColor: "#ffffff",
};

const SHIELD = "M-1 1 L1 1 L1 0.1 Q1 -0.6 0 -1 Q-1 -0.6 -1 0.1 Z";
const STAR_ROUND = 1;
const TAB_H = 12;
const SLOT_H = 3.5;

/** Contorno da medalha centrado na origem, com o maior lado = diâmetro. */
export function medalOutline(M: ManifoldToplevel, shape: MedalShape, d: number): CS {
  return scoped((k) => {
    let cs: CS;
    if (shape === "circle") cs = k(M.CrossSection.circle(d / 2, 96));
    else if (shape === "hexagon") cs = k(M.CrossSection.circle(d / 2, 6));
    else if (shape === "shield") cs = k(new M.CrossSection(flatten(parsePath(SHIELD), 0.02), "NonZero"));
    else {
      const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => {
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.5 : 1;
        return [r * Math.cos(a), r * Math.sin(a)];
      });
      const star = k(k(new M.CrossSection([pts], "NonZero")).scale(d / 2));
      cs = k(k(star.offset(-STAR_ROUND, "Round")).offset(STAR_ROUND, "Round")); // pontas arredondadas
    }
    const b = cs.bounds();
    const s = d / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    const moved = k(cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]));
    return moved.scale(s);
  });
}

/**
 * Medalha: base (com alça e rasgo para a fita), destaque (borda + texto) e imagem central, cada um uma parte/cor.
 * `art` e `text` já em mm (Y para cima); aqui só são posicionados e limitados à área interna.
 */
export function buildMedal(M: ManifoldToplevel, p: MedalParams, art: CS | null, text: CS | null): Model {
  return scoped((k) => {
    const d = p.diameter;
    const outline = k(medalOutline(M, p.shape, d));
    const top = outline.bounds().max[1];
    let base = outline;
    if (p.ribbon > 0) {
      const overlap = (p.shape === "star" ? 0.2 : 0.12) * d; // ponta da estrela é fina: alça entra mais
      const tabW = p.ribbon + 8;
      const tab = k(k(M.CrossSection.square([tabW - 4, TAB_H + overlap - 4], true)).offset(2, "Round"));
      const tabY = top + (TAB_H - overlap) / 2;
      const slot = k(M.CrossSection.square([p.ribbon + 1, SLOT_H], true));
      base = k(k(outline.add(k(tab.translate([0, tabY])))).subtract(k(slot.translate([0, top + TAB_H / 2 - 1]))));
    }
    const inner = k(outline.offset(-(p.rim + 1.5), "Round"));
    const rim = k(outline.subtract(k(outline.offset(-p.rim, "Round"))));
    const ib = inner.bounds();
    const innerW = ib.max[0] - ib.min[0];
    const innerH = ib.max[1] - ib.min[1];

    let accent = rim;
    if (text) {
      const t = k(fitInto(text, innerW * 0.8, Math.min(innerH * 0.18, text.bounds().max[1] - text.bounds().min[1]), -innerH * 0.3));
      accent = k(accent.add(k(shrinkToFit(t, inner))));
    }
    const at = (cs: CS) => toMesh(k(k(cs.extrude(p.relief)).translate([0, 0, p.thickness])));
    const parts = [
      { name: "Base", color: p.baseColor, mesh: toMesh(k(base.extrude(p.thickness))) },
      { name: "Destaque", color: p.accentColor, mesh: at(accent) },
    ];
    if (art) {
      const artH = text ? innerH * 0.5 : innerH * 0.7;
      const placed = k(shrinkToFit(k(fitInto(art, innerW * 0.7, artH, text ? innerH * 0.08 : 0)), inner));
      if (!placed.isEmpty()) parts.push({ name: "Imagem", color: p.artColor, mesh: at(placed) });
    }
    return { name: "Medalha", parts };
  });
}
