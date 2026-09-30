import type { CS, ManifoldToplevel } from "./manifold";
import { backing, roundedRect } from "./models/common";
import { heart } from "./models/shapes";
import { fitInto, scoped } from "./shape2d";

/** Formato do quadro por camadas (#100). "subject" = contorno do sujeito recortado pela Silhueta. */
export type LayeredShape = "rect" | "rounded" | "circle" | "heart" | "subject";
/** Furo para pendurar: pingente (argola fina) ou marca-página (cordão/borla). */
export type LayeredHang = "none" | "pendant" | "bookmark";

const ROUNDED = 0.12; // raio do canto em relação ao lado menor
const SMOOTH = 1; // mm: arredonda a escada dos pixels do contorno do sujeito
const HOLE_D = { pendant: 3, bookmark: 5 } as const;
const TAB_WALL = 2.5; // anel em volta do furo
const TAB_GAP = 0.8; // entre o furo e a borda do desenho

/**
 * Região do formato numa imagem de W × H mm centrada na origem; null = retângulo inteiro (sem recorte).
 * `mask` (1 = sujeito) vem por ponto da grade de `cols` × `rows` com passo `cell`.
 */
export function shapeRegion(M: ManifoldToplevel, shape: LayeredShape, W: number, H: number, mask?: Uint8Array | null, cols = 0, rows = 0, cell = 0): CS | null {
  const side = Math.min(W, H);
  if (shape === "rect") return null;
  if (shape === "rounded") return roundedRect(M, W, H, side * ROUNDED);
  if (shape === "circle") return M.CrossSection.circle(side / 2, 128);
  if (shape === "heart") return scoped((k) => fitInto(k(heart(M, H)), W, H, 0));
  if (!mask || !mask.some((v) => v)) throw new Error("Contorno do sujeito: separe o sujeito da foto primeiro.");
  return scoped((k) => {
    const rects: CS[] = [];
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        if (!mask[r * cols + c]) {
          c++;
          continue;
        }
        const start = c;
        while (c < cols && mask[r * cols + c]) c++;
        const x0 = Math.max(-W / 2, start * cell - W / 2 - cell / 2), x1 = Math.min(W / 2, (c - 1) * cell - W / 2 + cell / 2);
        const y = H / 2 - r * cell;
        rects.push(k(M.CrossSection.square([x1 - x0, cell]).translate([x0, Math.max(-H / 2, y - cell / 2)])));
      }
    }
    const raw = k(M.CrossSection.union(rects));
    const frame = k(M.CrossSection.square([W, H], true));
    const smooth = k(k(k(raw.offset(-SMOOTH, "Round")).offset(2 * SMOOTH, "Round")).offset(-SMOOTH, "Round"));
    // ilhas soltas viram uma peça só (ponte pelo contorno), sem passar da imagem
    return k(backing(M, smooth, 0)).intersect(frame);
  });
}

/** Aba com furo acima do topo da região (`top` = y máximo, `cx` = centro em x). Devolve [aba, furo]. */
export function hangTab(M: ManifoldToplevel, hang: Exclude<LayeredHang, "none">, cx: number, top: number): [CS, CS] {
  const r = HOLE_D[hang] / 2;
  const cy = top + r + TAB_GAP;
  return scoped((k) => [k(M.CrossSection.circle(r + TAB_WALL, 64)).translate([cx, cy]), k(M.CrossSection.circle(r, 48)).translate([cx, cy])]);
}
