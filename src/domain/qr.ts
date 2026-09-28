import { encode } from "uqr";

export type Ecc = "L" | "M" | "Q" | "H";
/** Quiet zone recomendada pela norma (4 módulos) — sem ela muitos leitores falham. */
export const QUIET_ZONE = 4;

/** Módulos do QR (true = escuro), sem quiet zone. */
export function qrMatrix(text: string, ecc: Ecc = "M"): boolean[][] {
  if (!text) throw new Error("Digite o conteúdo do QR Code.");
  return encode(text, { ecc, border: 0 }).data;
}

/** SVG do QR em milímetros (lado total, incluindo quiet zone), 1 unidade = 1 módulo. */
export function qrSvg(text: string, sizeMm: number, ecc: Ecc = "M"): string {
  const m = qrMatrix(text, ecc);
  const n = m.length + QUIET_ZONE * 2;
  let d = "";
  m.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeMm}mm" height="${sizeMm}mm" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
