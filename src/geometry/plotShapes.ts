/**
 * Formas prontas para a caneta (#320): linhas Y para cima, em qualquer escala (a camada ajusta a largura).
 * `n` = lados do polígono, pontas da estrela, voltas da espiral ou ondas; `ratio` = altura ÷ largura.
 */
type Pt = [number, number];
type Line = { pts: Pt[]; closed: boolean };

export const SHAPES = [
  ["circle", "Círculo"],
  ["rect", "Retângulo"],
  ["triangle", "Triângulo"],
  ["polygon", "Polígono"],
  ["star", "Estrela"],
  ["heart", "Coração"],
  ["spiral", "Espiral"],
  ["wave", "Onda"],
  ["line", "Linha"],
] as const;
export type ShapeKind = (typeof SHAPES)[number][0];
export type Shape = { kind: ShapeKind; n: number; ratio: number };
export const SHAPE_DEFAULT: Shape = { kind: "circle", n: 5, ratio: 1 };
/** Quais formas usam cada ajuste (a tela mostra só os que valem). */
export const SHAPE_USES: Record<ShapeKind, { n?: [string, number, number]; ratio?: boolean }> = {
  circle: { ratio: true },
  rect: { ratio: true },
  triangle: { ratio: true },
  polygon: { n: ["Lados", 3, 12] },
  star: { n: ["Pontas", 3, 12] },
  heart: {},
  spiral: { n: ["Voltas", 1, 20] },
  wave: { n: ["Ondas", 1, 20], ratio: true },
  line: {},
};

const SEG = 96;
const ring = (k: number, f: (t: number) => Pt): Pt[] => Array.from({ length: k }, (_, i) => f((i / k) * 2 * Math.PI));

export function shapeLines(s: Shape): Line[] {
  const n = Math.round(s.n);
  const r = s.ratio > 0 ? s.ratio : 1;
  switch (s.kind) {
    case "circle":
      return [{ pts: ring(SEG, (t) => [Math.cos(t), Math.sin(t) * r]), closed: true }];
    case "rect":
      return [{ pts: [[0, 0], [1, 0], [1, r], [0, r]], closed: true }];
    case "triangle":
      return [{ pts: [[0, 0], [1, 0], [0.5, r]], closed: true }];
    case "polygon":
      return [{ pts: ring(n, (t) => [Math.cos(t + Math.PI / 2), Math.sin(t + Math.PI / 2)]), closed: true }];
    case "star":
      return [{ pts: Array.from({ length: 2 * n }, (_, i): Pt => {
        const a = Math.PI / 2 + (i * Math.PI) / n;
        const k = i % 2 ? 0.4 : 1; // pontas e vales
        return [Math.cos(a) * k, Math.sin(a) * k];
      }), closed: true }];
    case "heart":
      // curva clássica do coração (x = 16 sen³t …), ponta para baixo
      return [{ pts: ring(SEG, (t) => [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]), closed: true }];
    case "spiral": {
      const k = SEG * n;
      return [{ pts: Array.from({ length: k + 1 }, (_, i): Pt => {
        const t = (i / k) * n * 2 * Math.PI;
        const rr = i / k;
        return [Math.cos(t) * rr, Math.sin(t) * rr];
      }), closed: false }];
    }
    case "wave": {
      const k = 48 * n;
      return [{ pts: Array.from({ length: k + 1 }, (_, i): Pt => [i / k, (Math.sin((i / k) * n * 2 * Math.PI) * r) / 2]), closed: false }];
    }
    case "line":
      return [{ pts: [[0, 0], [1, 0]], closed: false }];
  }
}
