import type { Decal } from "../../geometry/decals";

/** Camada livre de um modelo pronto (#26): um desenho (SVG) ou um texto, com o posicionamento do motor de decais. */
export type Layer = Decal & { kind: "art" | "text"; name: string; svg?: string; text?: string; font?: string };

/** Nome que a pessoa vê: o próprio texto nas camadas de texto. */
export const layerName = (l: Layer) => (l.kind === "text" ? l.text?.trim() || "Texto vazio" : l.name);

export type Bounds = { min: [number, number]; max: [number, number] };

const DEFAULT_WIDTH_FRAC = 0.4; // 40 % da largura da face
const MAX_DEFAULT_WIDTH = 40;
export const DEFAULT_DEPTH = 0.6;
export const SNAP_MM = 1.5; // distância em mm que "gruda" no centro/borda
export const EDGE_MARGIN_MM = 2; // encostar na borda deixa esta folga
const ROTATE_STEP = 15;

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

function base(face: Bounds | null, color: string): Omit<Decal, "id"> {
  const faceW = face ? face.max[0] - face.min[0] : 60;
  return {
    x: face ? (face.min[0] + face.max[0]) / 2 : 0,
    y: face ? (face.min[1] + face.max[1]) / 2 : 0,
    width: Math.round(Math.min(MAX_DEFAULT_WIDTH, faceW * DEFAULT_WIDTH_FRAC)),
    rotation: 0,
    mirror: false,
    mode: "raised",
    depth: DEFAULT_DEPTH,
    color,
    visible: true,
  };
}

export const newArtLayer = (svg: string, name: string, face: Bounds | null, color = "#f97316"): Layer => ({ ...base(face, color), id: newId(), kind: "art", name, svg });
export const newTextLayer = (face: Bounds | null, font = "hanken", color = "#f97316"): Layer => ({ ...base(face, color), id: newId(), kind: "text", name: "Texto", text: "Texto", font });

export const updateLayer = (list: Layer[], id: string, patch: Partial<Layer>) => list.map((l) => (l.id === id ? { ...l, ...patch } : l));
export const removeLayer = (list: Layer[], id: string) => list.filter((l) => l.id !== id);

/** Cópia logo acima, 5 mm deslocada para dar para ver que duplicou. */
export function duplicateLayer(list: Layer[], id: string): { list: Layer[]; id: string | null } {
  const i = list.findIndex((l) => l.id === id);
  if (i < 0) return { list, id: null };
  const copy = { ...list[i], id: newId(), name: `${list[i].name} (cópia)`, x: list[i].x + 5, y: list[i].y - 5 };
  return { list: [...list.slice(0, i + 1), copy, ...list.slice(i + 1)], id: copy.id };
}

/** Sobe (+1) ou desce (−1) na ordem; a última da lista fica por cima. */
export function moveLayer(list: Layer[], id: string, dir: 1 | -1): Layer[] {
  const i = list.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Meia largura e meia altura da caixa de um retângulo w×h girado. */
export function rotatedHalf(w: number, h: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return [(w * c + h * s) / 2, (w * s + h * c) / 2];
}

export type Guides = { x: number[]; y: number[] };

/**
 * Encaixe ao arrastar: o centro da camada gruda no centro da face e as bordas da camada nas bordas da face (com
 * folga). Devolve a posição final e as guias a desenhar. `half` = meia caixa da camada já girada.
 */
export function snapPosition(x: number, y: number, half: [number, number], face: Bounds, tol = SNAP_MM): { x: number; y: number; guides: Guides } {
  const cx = (face.min[0] + face.max[0]) / 2, cy = (face.min[1] + face.max[1]) / 2;
  const xs: [number, number][] = [
    [cx, cx],
    [face.min[0] + EDGE_MARGIN_MM + half[0], face.min[0] + EDGE_MARGIN_MM],
    [face.max[0] - EDGE_MARGIN_MM - half[0], face.max[0] - EDGE_MARGIN_MM],
  ];
  const ys: [number, number][] = [
    [cy, cy],
    [face.min[1] + EDGE_MARGIN_MM + half[1], face.min[1] + EDGE_MARGIN_MM],
    [face.max[1] - EDGE_MARGIN_MM - half[1], face.max[1] - EDGE_MARGIN_MM],
  ];
  const pick = (v: number, opts: [number, number][]) => opts.reduce<[number, number] | null>((best, o) => (Math.abs(o[0] - v) <= tol && (!best || Math.abs(o[0] - v) < Math.abs(best[0] - v)) ? o : best), null);
  const sx = pick(x, xs), sy = pick(y, ys);
  return { x: sx ? sx[0] : x, y: sy ? sy[0] : y, guides: { x: sx ? [sx[1]] : [], y: sy ? [sy[1]] : [] } };
}

/** Giro com Shift: passos de 15°. Sempre em −180…180. */
export function normalizeRotation(deg: number, step = false): number {
  const r = step ? Math.round(deg / ROTATE_STEP) * ROTATE_STEP : Math.round(deg);
  return ((((r + 180) % 360) + 360) % 360) - 180;
}
