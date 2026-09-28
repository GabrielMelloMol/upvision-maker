import { QUIET_ZONE } from "../domain/qr";
import type { ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Model } from "./types";

export type QrModelParams = {
  /** Lado da placa (inclui a margem clara). */
  sizeMm: number;
  baseMm: number;
  reliefMm: number;
  /** Margem clara em módulos (a norma pede 4; em peça impressa 2 costuma ler bem). */
  quiet?: number;
  cornerMm?: number;
  baseColor?: string;
  qrColor?: string;
};

export const QR_BASE_COLOR = "#ffffff";
export const QR_DARK_COLOR = "#1c1c1e";
/** Abaixo disso a câmera do celular costuma falhar com peça impressa (bico 0,4). */
export const MIN_MODULE_MM = 1.2;

/**
 * QR em 3D para imprimir em 2 cores: placa clara + módulos escuros em relevo por cima.
 * Módulos vizinhos da mesma linha viram um retângulo só (menos polígonos, geometria limpa).
 */
export function qrModel(M: ManifoldToplevel, matrix: boolean[][], p: QrModelParams, name = "QR Code"): { model: Model; moduleMm: number; warnings: string[] } {
  const quiet = p.quiet ?? QUIET_ZONE;
  const n = matrix.length;
  const mod = p.sizeMm / (n + quiet * 2);
  const half = p.sizeMm / 2;
  const origin = quiet * mod - half; // módulo [0][0] no canto superior esquerdo
  const rects: [number, number][][] = [];
  matrix.forEach((row, r) => {
    for (let c = 0; c < n; c++) {
      if (!row[c]) continue;
      const start = c;
      while (c + 1 < n && row[c + 1]) c++;
      const x0 = origin + start * mod;
      const x1 = origin + (c + 1) * mod;
      const y1 = half - quiet * mod - r * mod;
      const y0 = y1 - mod;
      rects.push([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ]);
    }
  });
  const warnings = mod < MIN_MODULE_MM ? [`Cada módulo ficou com ${mod.toFixed(2).replace(".", ",")} mm: aumente a placa ou encurte o texto (mínimo recomendado ${MIN_MODULE_MM.toString().replace(".", ",")} mm).`] : [];
  const model = scoped((k) => {
    const r = Math.min(p.cornerMm ?? 0, half * 0.9);
    const square = k(M.CrossSection.square([p.sizeMm, p.sizeMm], true));
    const plate = r > 0 ? k(k(square.offset(-r, "Round")).offset(r, "Round")) : square;
    const code = k(new M.CrossSection(rects, "NonZero"));
    return {
      name,
      parts: [
        { name: "Base", color: p.baseColor ?? QR_BASE_COLOR, mesh: toMesh(k(plate.extrude(p.baseMm))) },
        { name: "QR", color: p.qrColor ?? QR_DARK_COLOR, mesh: toMesh(k(k(code.extrude(p.reliefMm)).translate([0, 0, p.baseMm]))) },
      ],
    };
  });
  return { model, moduleMm: mod, warnings };
}
