import { bedMm } from "../bed";
import type { CS } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type GridCutterParams = {
  cellWidth: number;
  cellHeight: number;
  rows: number;
  cols: number;
  /** Altura total (lâmina + aba de apoio). */
  height: number;
  /** Espessura da lâmina. */
  wall: number;
  cornerRadius: number;
  /** Aba de apoio (onde a mão empurra): mais larga que a lâmina, impressa virada para a mesa. */
  flangeHeight: number;
  flangeWidth: number;
  tabs: boolean;
  tabLength: number;
  tabText: string;
  relief: number;
  bodyColor: string;
  textColor: string;
};

export const DEFAULT_GRID_CUTTER: GridCutterParams = {
  cellWidth: 30,
  cellHeight: 30,
  rows: 3,
  cols: 4,
  height: 15,
  wall: 0.8,
  cornerRadius: 2,
  flangeHeight: 2,
  flangeWidth: 2.5,
  tabs: true,
  tabLength: 25,
  tabText: "Doces",
  relief: 0.8,
  bodyColor: "#e11d48",
  textColor: "#ffffff",
};

const TAB_MAX_H = 40;
const TAB_MARGIN = 3;

/**
 * Cortador de retângulos em grade (#63): massa e fondant cortados em lote. Lâmina fina em todas as divisórias,
 * aba de apoio mais grossa embaixo (vai virada para a mesa) e abas de pega nas laterais, com texto em relevo.
 */
export function buildGridCutter({ M, text }: ModelCtx, p: GridCutterParams): ModelOutput {
  return scoped((k) => {
    const rows = Math.max(1, Math.round(p.rows)), cols = Math.max(1, Math.round(p.cols));
    const W = cols * p.cellWidth, H = rows * p.cellHeight;
    const cells = (inset: number): CS =>
      M.CrossSection.union(
        Array.from({ length: rows * cols }, (_, n) => {
          const i = n % cols, j = Math.floor(n / cols);
          const r = k(roundedRect(M, p.cellWidth - inset, p.cellHeight - inset, p.cornerRadius));
          return k(r.translate([-W / 2 + p.cellWidth * (i + 0.5), -H / 2 + p.cellHeight * (j + 0.5)]));
        }),
      );
    const outer = (grow: number) => k(roundedRect(M, W + p.wall + 2 * grow, H + p.wall + 2 * grow, p.cornerRadius + p.wall / 2 + grow));
    const blade = k(outer(0).subtract(k(cells(p.wall))));
    let flange = k(outer(p.flangeWidth).subtract(k(cells(p.wall + 2 * p.flangeWidth))));
    const tabH = Math.min(H, TAB_MAX_H);
    const tabX = (W + p.wall) / 2 + p.flangeWidth + p.tabLength / 2;
    if (p.tabs) {
      const tab = k(roundedRect(M, p.tabLength + p.flangeWidth, tabH, 4));
      flange = k(M.CrossSection.union([flange, k(tab.translate([tabX - p.flangeWidth / 2, 0])), k(tab.translate([-tabX + p.flangeWidth / 2, 0]))]));
    }
    const body = k(k(flange.extrude(p.flangeHeight)).add(k(blade.extrude(p.height))));
    const parts = [{ name: "Cortador", color: p.bodyColor, mesh: solidMesh(body) }];
    const label = p.tabs ? text(p.tabText, 10) : null;
    if (label) {
      const fitted = k(fitInto(k(label), tabH - 2 * TAB_MARGIN, p.tabLength - 2 * TAB_MARGIN, 0));
      const turned = k(fitted.rotate(90)); // lê de baixo para cima na aba
      const both = k(M.CrossSection.union([k(turned.translate([tabX, 0])), k(k(turned.rotate(180)).translate([-tabX, 0]))]));
      parts.push({ name: "Texto", color: p.textColor, mesh: slab(both, p.relief, p.flangeHeight) });
    }
    const totalW = W + p.wall + 2 * p.flangeWidth + (p.tabs ? 2 * p.tabLength : 0);
    const totalH = H + p.wall + 2 * p.flangeWidth;
    const warnings = Math.max(totalW, totalH) > bedMm() ? [`A grade tem ${Math.round(totalW)} × ${Math.round(totalH)} mm: passa da mesa de ${bedMm()} mm. Diminua as células ou as colunas.`] : [];
    return { models: [{ name: "Cortador em grade", parts }], warnings };
  });
}
