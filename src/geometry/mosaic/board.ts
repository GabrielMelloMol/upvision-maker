import { bedMm } from "../bed";
import type { CS, ManifoldToplevel } from "../manifold";
import { toMesh } from "../mesh";
import { roundedRect } from "../models/common";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { boardSize, pocketSide, type BoardParams } from "./params";

/*
 * Tabuleiro do mosaico (#206): placa com uma grade de casas quadradas rebaixadas, separadas por uma parede fina.
 * Deitado na mesa, com as casas abertas para cima: sem suporte. O encaixe entre tabuleiros é uma cauda de andorinha
 * extrudada na espessura toda: o tabuleiro de cima desce sobre o de baixo e o da direita sobre o da esquerda.
 */
const TAB_NECK = 6;
const TAB_HEAD = 9;
const TAB_LEN = 4;
const TAB_CLEARANCE = 0.3;
const MIN_BORDER_FOR_JOIN = TAB_LEN + TAB_CLEARANCE + 1.2;

type K = <D extends { delete(): void }>(o: D) => D;

/** Quantas caudas por lado (uma a cada 3 casas, ao menos uma). */
export const tabsOn = (n: number) => Math.max(1, Math.floor(n / 3));

/** Cauda de andorinha com a base na origem, apontando para +x; `grow` engrossa (a folga do encaixe fêmea). */
function dovetail(M: ManifoldToplevel, k: K, grow: number): CS {
  const t = new M.CrossSection([[[-0.01, -TAB_NECK / 2], [TAB_LEN, -TAB_HEAD / 2], [TAB_LEN, TAB_HEAD / 2], [-0.01, TAB_NECK / 2]]], "NonZero");
  return grow > 0 ? k(t).offset(grow, "Miter") : t;
}

/** Posições (centro) de `n` caudas igualmente espaçadas ao longo de um lado de comprimento `len`. */
const spread = (n: number, len: number) => Array.from({ length: n }, (_, i) => -len / 2 + ((i + 0.5) * len) / n);

/** Contorno da placa (quem chama registra): retângulo arredondado, com caudas à direita e embaixo e os vãos delas à esquerda e em cima. */
function outline(M: ManifoldToplevel, k: K, b: BoardParams): CS {
  const [W, H] = boardSize(b);
  if (b.join !== "dovetail") return roundedRect(M, W, H, b.corner);
  const tabs: CS[] = [k(roundedRect(M, W, H, b.corner))];
  const slots: CS[] = [];
  for (const y of spread(tabsOn(b.rows), H)) {
    tabs.push(k(k(dovetail(M, k, 0)).translate([W / 2, y])));
    slots.push(k(k(dovetail(M, k, TAB_CLEARANCE)).translate([-W / 2, y])));
  }
  for (const x of spread(tabsOn(b.cols), W)) {
    tabs.push(k(k(k(dovetail(M, k, 0)).rotate(-90)).translate([x, -H / 2])));
    slots.push(k(k(k(dovetail(M, k, TAB_CLEARANCE)).rotate(-90)).translate([x, H / 2])));
  }
  return k(M.CrossSection.union(tabs)).subtract(k(M.CrossSection.union(slots)));
}

/** Centros das casas, em mm, com a grade centrada na origem (linha 0 em cima, como no desenho). */
export function cellCenters(b: BoardParams): [number, number][] {
  const out: [number, number][] = [];
  const x0 = -((b.cols - 1) * b.cell) / 2, y0 = ((b.rows - 1) * b.cell) / 2;
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) out.push([x0 + c * b.cell, y0 - r * b.cell]);
  return out;
}

export function buildBoard(M: ManifoldToplevel, b: BoardParams): { model: Model; warnings: string[] } {
  const warnings: string[] = [];
  const [W, H] = boardSize(b);
  if (Math.max(W, H) > bedMm()) warnings.push(`O tabuleiro tem ${Math.round(W)} × ${Math.round(H)} mm e passa da mesa de ${bedMm()} mm: diminua as casas ou o tamanho de cada uma.`);
  if (b.join === "dovetail" && b.border < MIN_BORDER_FOR_JOIN) warnings.push(`Para o encaixe entre tabuleiros a borda precisa de pelo menos ${MIN_BORDER_FOR_JOIN.toFixed(1).replace(".", ",")} mm: ele foi desligado.`);
  const join = b.join === "dovetail" && b.border >= MIN_BORDER_FOR_JOIN ? "dovetail" : "none";
  const total = b.floor + b.depth;
  const mesh = scoped((k) => {
    const plate = k(outline(M, k, { ...b, join }));
    const body = k(plate.extrude(total));
    const pocket = pocketSide(b);
    const holes = cellCenters(b).map(([x, y]) => k(k(M.CrossSection.square([pocket, pocket], true)).translate([x, y])));
    const cut = k(k(M.CrossSection.union(holes)).extrude(b.depth + 1));
    return toMesh(k(body.subtract(k(cut.translate([0, 0, b.floor])))));
  });
  return { model: { name: "Tabuleiro", parts: [{ name: "Tabuleiro", color: b.color, mesh }] }, warnings };
}

