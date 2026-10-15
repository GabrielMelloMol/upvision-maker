import type { CS, ManifoldToplevel } from "../manifold";
import { outerOnly, scoped } from "../shape2d";

type K = <D extends { delete(): void }>(o: D) => D;
type Pt = [number, number];

export type ThermoShape = "heart" | "star" | "flower" | "circle" | "square" | "ball" | "egg";
export const SHAPE_LABELS: readonly (readonly [ThermoShape, string])[] = [
  ["heart", "Coração"],
  ["star", "Estrela"],
  ["flower", "Flor"],
  ["circle", "Círculo"],
  ["square", "Quadrado arredondado"],
  ["ball", "Bola de Natal"],
  ["egg", "Ovo de Páscoa"],
];
export type SymSide = "keep" | "left" | "right";

const SEGS = 96;
const circlePts = (n: number, f: (t: number) => Pt): Pt[] => Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2));

/** Contorno do formato em unidades quaisquer, simétrico pelo eixo vertical (x = 0), Y para cima. */
function outline(M: ManifoldToplevel, shape: ThermoShape, k: K): CS {
  const poly = (pts: Pt[]) => k(new M.CrossSection([pts], "NonZero"));
  switch (shape) {
    case "circle":
      return k(M.CrossSection.circle(50, SEGS));
    case "square":
      return k(k(M.CrossSection.square([60, 60], true)).offset(20, "Round"));
    case "heart":
      return poly(circlePts(SEGS * 2, (t) => [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]));
    case "egg":
      return poly(circlePts(SEGS, (t) => [40 * Math.cos(t) * (1 - 0.14 * Math.sin(t)), 54 * Math.sin(t)]));
    case "star": {
      const pts = circlePts(10, (t) => {
        const i = Math.round((t / (Math.PI * 2)) * 10);
        const r = i % 2 === 0 ? 50 : 27;
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        return [r * Math.cos(a), r * Math.sin(a)];
      });
      // pontas e vales arredondados: a estrela "gordinha" da referência
      const star = poly(pts);
      return k(k(k(star.offset(-4, "Round")).offset(8, "Round")).offset(-4, "Round"));
    }
    case "flower": {
      const petals = Array.from({ length: 5 }, (_, i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return k(k(M.CrossSection.circle(24, SEGS)).translate([30 * Math.cos(a), 30 * Math.sin(a)]));
      });
      return k(M.CrossSection.union([...petals, k(M.CrossSection.circle(28, SEGS))]));
    }
    case "ball": {
      const body = k(M.CrossSection.circle(50, SEGS));
      const cap = k(k(M.CrossSection.square([16, 14], true)).translate([0, 50]));
      return k(body.add(cap));
    }
  }
}

/** Centraliza no eixo vertical e na altura e ajusta a largura (mm): a silhueta entra com o eixo de simetria em x = 0. */
export function fitSilhouette(cs: CS, widthMm: number): CS {
  const b = cs.bounds();
  const w = b.max[0] - b.min[0];
  if (!(w > 0)) throw new Error("A silhueta está vazia.");
  return scoped((k) => {
    const moved = k(cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]));
    return moved.scale(widthMm / w);
  });
}

/** Formato pronto no tamanho pedido. Quem chama apaga o resultado. */
export function presetSilhouette(M: ManifoldToplevel, shape: ThermoShape, widthMm: number): CS {
  return scoped((k) => fitSilhouette(outline(M, shape, k), widthMm));
}

/** Silhueta de uma imagem/SVG/texto: só o contorno de fora (sem furos), com o espaço entre partes fechado. */
export function silhouetteFromDesign(M: ManifoldToplevel, design: CS, widthMm: number, bridgeMm = 2): CS {
  return scoped((k) => {
    const closed = k(k(design.offset(bridgeMm, "Round")).offset(-bridgeMm, "Round"));
    return fitSilhouette(outerOnly(M, closed), widthMm);
  });
}

const HALF = 1e4;
/** A silhueta com a metade escolhida espelhada sobre o eixo x = 0 (mesmo molde para as duas metades da caixa). */
export function symmetrize(M: ManifoldToplevel, cs: CS, side: SymSide): CS {
  if (side === "keep") return cs.translate([0, 0]);
  return scoped((k) => {
    const half = k(k(M.CrossSection.square([HALF, 2 * HALF])).translate(side === "left" ? [-HALF, -HALF] : [0, -HALF]));
    const kept = k(cs.intersect(half));
    return M.CrossSection.union([kept, k(kept.mirror([1, 0]))]);
  });
}

/** Quanto a silhueta difere do próprio espelho (fração da área, 0 = simétrica). */
export function asymmetry(cs: CS): number {
  return scoped((k) => {
    const mirror = k(cs.mirror([1, 0]));
    const diff = k(cs.subtract(mirror)).area() + k(mirror.subtract(cs)).area();
    return cs.area() > 0 ? diff / (2 * cs.area()) : 0;
  });
}

export const ASYMMETRY_WARN = 0.03;
