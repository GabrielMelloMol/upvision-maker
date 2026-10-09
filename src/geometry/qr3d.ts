import { QUIET_ZONE } from "../domain/qr";
import type { ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Model } from "./types";

/** Estilo do relevo do código (#114): plano, pirâmide (cresce para o centro), degraus (anéis) ou ondas (ruído suave). */
export type QrStyle = "flat" | "pyramid" | "steps" | "waves";

export type QrModelParams = {
  style?: QrStyle;
  /** Degraus: quantos anéis do centro à borda. */
  steps?: number;
  /** Ondas: muda o desenho do ruído. */
  seed?: number;
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

/** Nas formas esculpidas a altura nunca cai abaixo desta fração do relevo: o módulo escuro continua existindo. */
export const MIN_HEIGHT_FRACTION = 0.4;
const LEVELS = 6; // alturas distintas (o resto é arredondado), para juntar módulos vizinhos
const NOISE_CELL = 5; // módulos por célula do ruído

export const QR_BASE_COLOR = "#ffffff";
export const QR_DARK_COLOR = "#1c1c1e";
/** Abaixo disso a câmera do celular costuma falhar com peça impressa (bico 0,4). */
export const MIN_MODULE_MM = 1.2;

const hash = (x: number, y: number, seed: number) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Ruído suave de 0 a 1 (valor interpolado numa grade com `NOISE_CELL` módulos por célula). */
export function smoothNoise(c: number, r: number, seed: number): number {
  const x = c / NOISE_CELL, y = r / NOISE_CELL;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const u = smooth(x - x0), v = smooth(y - y0);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), d = hash(x0, y0 + 1, seed), e = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
}

/** Fração (MIN_HEIGHT_FRACTION a 1) da altura do módulo da coluna `c`, linha `r` de um QR n × n. */
export function heightFraction(style: QrStyle, c: number, r: number, n: number, p: { steps?: number; seed?: number } = {}): number {
  if (style === "flat") return 1;
  const mid = (n - 1) / 2;
  const dist = Math.max(Math.abs(c - mid), Math.abs(r - mid)) / (n / 2); // 0 no centro, perto de 1 na borda (quadrado)
  let f: number;
  if (style === "pyramid") f = 1 - dist;
  else if (style === "steps") {
    const rings = Math.max(2, Math.round(p.steps ?? 4));
    f = 1 - Math.min(Math.floor(dist * rings), rings - 1) / (rings - 1);
  } else f = smoothNoise(c, r, p.seed ?? 1);
  return MIN_HEIGHT_FRACTION + (1 - MIN_HEIGHT_FRACTION) * Math.min(Math.max(f, 0), 1);
}

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
  const style = p.style ?? "flat";
  const level = (c: number, r: number) => (style === "flat" ? 0 : Math.round(((heightFraction(style, c, r, n, p) - MIN_HEIGHT_FRACTION) / (1 - MIN_HEIGHT_FRACTION)) * (LEVELS - 1)));
  const byLevel = new Map<number, [number, number][][]>();
  matrix.forEach((row, r) => {
    for (let c = 0; c < n; c++) {
      if (!row[c]) continue;
      const start = c, lv = level(c, r);
      while (c + 1 < n && row[c + 1] && level(c + 1, r) === lv) c++;
      const x0 = origin + start * mod;
      const x1 = origin + (c + 1) * mod;
      const y1 = half - quiet * mod - r * mod;
      const y0 = y1 - mod;
      const list = byLevel.get(lv) ?? [];
      list.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
      byLevel.set(lv, list);
    }
  });
  /** Altura do degrau `lv`: relevo × fração (o plano é um degrau só, com o relevo inteiro). */
  const levelHeight = (lv: number) => (style === "flat" ? p.reliefMm : p.reliefMm * (MIN_HEIGHT_FRACTION + ((1 - MIN_HEIGHT_FRACTION) * lv) / (LEVELS - 1)));
  const warnings = mod < MIN_MODULE_MM ? [`Cada módulo ficou com ${mod.toFixed(2).replace(".", ",")} mm: aumente a placa ou encurte o texto (mínimo recomendado ${MIN_MODULE_MM.toString().replace(".", ",")} mm).`] : [];
  if (style !== "flat") warnings.push("Código esculpido: de cima ele lê como o plano, mas sombras de luz lateral podem atrapalhar. Teste com o celular antes de dar ou vender, e use luz difusa.");
  const model = scoped((k) => {
    const r = Math.min(p.cornerMm ?? 0, half * 0.9);
    const square = k(M.CrossSection.square([p.sizeMm, p.sizeMm], true));
    const plate = r > 0 ? k(k(square.offset(-r, "Round")).offset(r, "Round")) : square;
    const slabs = [...byLevel.entries()].map(([lv, rects]) => k(k(k(new M.CrossSection(rects, "NonZero")).extrude(levelHeight(lv))).translate([0, 0, p.baseMm])));
    const code = slabs.length > 1 ? k(M.Manifold.union(slabs)) : slabs[0];
    return {
      name,
      parts: [
        { name: "Base", color: p.baseColor ?? QR_BASE_COLOR, mesh: toMesh(k(plate.extrude(p.baseMm))) },
        { name: "QR", color: p.qrColor ?? QR_DARK_COLOR, mesh: toMesh(code) },
      ],
    };
  });
  return { model, moduleMm: mod, warnings };
}
