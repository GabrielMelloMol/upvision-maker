import type { CS, ManifoldToplevel } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { MissingInput, roundedRect, size2, type ModelCtx, type ModelOutput, type TextFn } from "./common";
import { splitModelToBed } from "./splitBed";

export type NamesPanelParams = {
  names: string; // separados por vírgula, ponto e vírgula ou linha
  title: string;
  width: number;
  height: number;
  titleHeight: number;
  thickness: number;
  relief: number;
  margin: number;
  holes: boolean;
  plateColor: string;
  textColor: string;
};

export const DEFAULT_NAMES_PANEL: NamesPanelParams = {
  names: "Ana, Bruno, Carla, Davi, Elisa, Felipe, Gabi, Heitor, Isa, João, Kátia, Léo",
  title: "Turma 2026",
  width: 200,
  height: 140,
  titleHeight: 16,
  thickness: 3,
  relief: 1,
  margin: 8,
  holes: true,
  plateColor: "#1c1c1e",
  textColor: "#f8f8f6",
};

const BED_MM = 256;
const GAP_FRAC = 0.3; // espaço entre linhas/colunas, em fração da altura do texto
const MIN_TEXT_MM = 5;
const HOLE_R = 2.5;
const MEASURE_H = 10;

export const parseNames = (s: string) => s.split(/[\n,;]/).map((n) => n.trim()).filter(Boolean);

/**
 * Melhor grade para `n` nomes numa área `w × h`: a que deixa o texto mais alto. `aspect` = largura/altura do
 * nome mais comprido. Devolve colunas, linhas e altura do texto.
 */
export function bestGrid(n: number, w: number, h: number, aspect: number): { cols: number; rows: number; textH: number } {
  let best = { cols: 1, rows: n, textH: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    // cada célula: texto de altura t, largura t·aspect, com espaço de GAP_FRAC·t entre células
    const t = Math.min(h / (rows + (rows - 1) * GAP_FRAC), w / (cols * aspect + (cols - 1) * GAP_FRAC * 2));
    if (t > best.textH) best = { cols, rows, textH: t };
  }
  return best;
}

function layoutNames(M: ManifoldToplevel, text: TextFn, names: string[], w: number, h: number, cy: number, k: <D extends { delete(): void }>(o: D) => D) {
  const shapes = names.map((n) => k(text(n, MEASURE_H)!));
  const aspect = Math.max(...shapes.map((c) => size2(c)[0] / MEASURE_H));
  const g = bestGrid(names.length, w, h, aspect);
  const cellW = w / g.cols, cellH = h / g.rows;
  const placed = shapes.map((c, i) => {
    const col = i % g.cols, row = Math.floor(i / g.cols);
    const x = -w / 2 + cellW * (col + 0.5), y = cy + h / 2 - cellH * (row + 0.5);
    return k(k(fitInto(c, cellW - g.textH * GAP_FRAC * 2, g.textH, 0)).translate([x, y]));
  });
  return { cs: k(M.CrossSection.union(placed)), textH: g.textH };
}

/**
 * Painel de nomes (turma, família, equipe): placa com título opcional e os nomes em grade automática, com o
 * maior tamanho de letra que cabe; furos para pendurar. Maior que a mesa, sai em partes (cada uma com as cores).
 */
export function buildNamesPanel({ M, text }: ModelCtx, p: NamesPanelParams): ModelOutput {
  const names = parseNames(p.names);
  if (!names.length) throw new MissingInput("Digite os nomes, separados por vírgula ou um por linha.");
  return scoped((k) => {
    const warnings: string[] = [];
    const plate2d = k(roundedRect(M, p.width, p.height, p.margin / 2));
    const innerW = p.width - 2 * p.margin;
    let top = p.height / 2 - p.margin;
    const texts: CS[] = [];
    const t = p.title.trim() ? text(p.title, p.titleHeight) : null;
    if (t) {
      texts.push(k(fitInto(k(t), innerW, p.titleHeight, top - p.titleHeight / 2)));
      top -= p.titleHeight * (1 + GAP_FRAC * 2);
    }
    const areaH = top - (-p.height / 2 + p.margin);
    if (areaH <= MIN_TEXT_MM) throw new Error("Não sobra espaço para os nomes: aumente a altura da placa ou diminua o título.");
    const grid = layoutNames(M, text, names, innerW, areaH, (top + (-p.height / 2 + p.margin)) / 2, k);
    texts.push(grid.cs);
    if (grid.textH < MIN_TEXT_MM) warnings.push(`Com ${names.length} nomes a letra fica com ${grid.textH.toFixed(1)} mm: aumente a placa para ler bem.`);

    let base = k(plate2d.extrude(p.thickness));
    if (p.holes) {
      const y = p.height / 2 - p.margin / 2;
      for (const x of [-p.width / 2 + p.margin, p.width / 2 - p.margin]) base = k(base.subtract(k(k(M.Manifold.cylinder(p.thickness * 3, HOLE_R, HOLE_R, 24)).translate([x, y, -p.thickness]))));
    }
    const relief = k(k(k(M.CrossSection.union(texts)).extrude(p.relief)).translate([0, 0, p.thickness]));
    const models = splitModelToBed(M, "Painel", [
      { name: "Placa", color: p.plateColor, solid: base },
      { name: "Nomes", color: p.textColor, solid: relief },
    ], BED_MM);
    if (models.length > 1) warnings.push(`Maior que a mesa de ${BED_MM} mm: o painel saiu em ${models.length} partes para colar lado a lado.`);
    return { models, warnings };
  });
}
