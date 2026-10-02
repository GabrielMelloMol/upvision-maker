import { transform } from "../geometry/models/toolFitLayout";
import type { Sheet, ToolOutline } from "./types";

/**
 * Contornos de exemplo (#169) enquanto a foto (PhotoStep, da Forja) não chega: três ferramentas tortas numa A4,
 * como a foto entrega (mm, anti-horário, origem no canto da folha).
 */
export const A4: Sheet = { widthMm: 210, heightMm: 297 };

type Pt = [number, number];
const roundHole = (cx: number, cy: number, r: number): Pt[] =>
  Array.from({ length: 16 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 8), cy + r * Math.sin((i * Math.PI) / 8)] as Pt);

const SCREWDRIVER: Pt[] = [[0, -13], [100, -13], [104, -3], [184, -3], [186, 0], [184, 3], [104, 3], [100, 13], [0, 13], [-4, 9], [-4, -9]];
const WRENCH: Pt[] = [[0, -12], [12, -12], [18, -6], [140, -6], [146, -12], [158, -12], [164, -4], [152, -4], [152, 4], [164, 4], [158, 12], [146, 12], [140, 6], [18, 6], [12, 12], [0, 12], [-6, 0]];
const SCISSORS: Pt[] = [[0, -28], [50, -28], [62, -8], [170, -1], [170, 1], [62, 8], [50, 28], [0, 28], [-8, 14], [-8, -14]];

const place = (o: ToolOutline, deg: number, x: number, y: number) => transform(o, (deg * Math.PI) / 180, x, y);

export const EXAMPLE_OUTLINES: ToolOutline[] = [
  place({ id: "chave-de-fenda", label: "Chave de fenda", points: SCREWDRIVER, heightMm: 26 }, 72, 60, 30),
  place({ id: "chave-combinada", label: "Chave combinada", points: WRENCH, heightMm: 6 }, 95, 115, 40),
  place({ id: "tesoura", label: "Tesoura", points: SCISSORS, holes: [roundHole(22, -13, 10), roundHole(22, 13, 10)], heightMm: 10 }, 80, 185, 60),
];
