/*
 * Mosaico (#206): formatos das peças. Todos cabem numa casa quadrada de lado `s` (a peça, já sem a folga), centrada
 * na origem, Y para cima. `rot` gira a peça em passos de 90° no sentido anti-horário, só para desenhar no tabuleiro
 * e nos cartões: a peça impressa é sempre a de `rot = 0`.
 */
export type MosaicShape = "square" | "half" | "quarter" | "triangle" | "circle" | "eye";
export type Pt = [number, number];

export const SHAPES: { id: MosaicShape; label: string; hint: string }[] = [
  { id: "square", label: "Quadrado", hint: "Preenche a casa." },
  { id: "half", label: "Meio-círculo", hint: "Meio disco, com o lado reto numa borda da casa." },
  { id: "quarter", label: "Quarto de círculo", hint: "Preenche o canto da casa, com a curva para fora." },
  { id: "triangle", label: "Triângulo", hint: "Metade da casa, cortada na diagonal." },
  { id: "circle", label: "Círculo", hint: "Disco inscrito na casa." },
  { id: "eye", label: "Olho", hint: "Disco branco com a pupila preta." },
];
export const SHAPE_LABEL: Record<MosaicShape, string> = Object.fromEntries(SHAPES.map((s) => [s.id, s.label])) as Record<MosaicShape, string>;

/** Formatos que giram de verdade (os outros são iguais em qualquer giro). */
export const ROTATES = (s: MosaicShape) => s === "half" || s === "quarter" || s === "triangle";

const ARC_STEPS = 24;

const arc = (cx: number, cy: number, r: number, from: number, to: number, steps = ARC_STEPS): Pt[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

/** Contorno (sentido anti-horário) do formato com `rot = 0`, numa casa de lado `s` centrada na origem. */
export function shapeOutline(shape: MosaicShape, s: number, steps = ARC_STEPS): Pt[] {
  const h = s / 2;
  switch (shape) {
    case "square":
      return [[-h, -h], [h, -h], [h, h], [-h, h]];
    case "triangle":
      return [[-h, -h], [h, -h], [-h, h]];
    case "quarter":
      // canto reto embaixo à esquerda; o arco (raio s) vai da borda de baixo à borda da esquerda
      return [[-h, -h], ...arc(-h, -h, s, 0, Math.PI / 2, steps)];
    case "half":
      // lado reto na borda de baixo; o disco tem diâmetro s
      return arc(0, -h, h, 0, Math.PI, steps);
    case "circle":
    case "eye":
      return arc(0, 0, h, 0, 2 * Math.PI, steps * 2).slice(0, -1);
  }
}

/** Contorno de `shape` girado `rot` × 90° e movido para o centro (cx, cy). */
export function placedOutline(shape: MosaicShape, rot: number, s: number, cx = 0, cy = 0, steps = ARC_STEPS): Pt[] {
  const q = ((Math.round(rot) % 4) + 4) % 4;
  const [c, sn] = [[1, 0], [0, 1], [-1, 0], [0, -1]][q];
  return shapeOutline(shape, s, steps).map(([x, y]) => [cx + x * c - y * sn, cy + x * sn + y * c]);
}

/** Raio da pupila do olho, em fração do lado. */
export const PUPIL = 0.2;

/** Área do formato (mm²), para estimar o enchimento do pote. */
export function shapeArea(shape: MosaicShape, s: number): number {
  switch (shape) {
    case "square": return s * s;
    case "triangle": return (s * s) / 2;
    case "quarter": return (Math.PI * s * s) / 4;
    case "half": return (Math.PI * (s / 2) ** 2) / 2;
    case "circle":
    case "eye": return Math.PI * (s / 2) ** 2;
  }
}
