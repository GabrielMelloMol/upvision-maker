import type { CS, ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { outerOnly, scoped } from "./shape2d";
import type { Model } from "./types";

export type ReliefMode = "auto" | "lines" | "holes";

export type CutterParams = {
  blade: number; // espessura da lâmina (mm)
  height: number; // altura total do cortador
  rimWidth: number; // largura da borda de apoio, para fora da lâmina
  rimHeight: number;
  stamp: boolean;
  clearance: number; // folga do carimbo para entrar no cortador
  plate: number; // espessura da placa do carimbo
  relief: number; // altura do relevo do carimbo
  edgeMargin: number; // faixa junto à borda sem relevo
  reliefMode: ReliefMode;
};

export const DEFAULT_CUTTER: CutterParams = {
  blade: 0.8,
  height: 15,
  rimWidth: 4,
  rimHeight: 2,
  stamp: true,
  clearance: 0.6,
  plate: 2.5,
  relief: 2,
  edgeMargin: 1.5,
  reliefMode: "auto",
};

export const CUTTER_COLOR = "#2563eb";
export const STAMP_COLOR = "#f97316";
const GAP_MM = 10;
const MIN_RELIEF_AREA = 1; // mm²

/**
 * Cortador de biscoito a partir de um desenho em mm (Y para cima).
 * Impresso com a borda de apoio na mesa e a lâmina para cima; o carimbo com o relevo para cima.
 * Espelhe o desenho antes (fitWidth mirror) para a massa sair na orientação do desenho.
 */
export function buildCutter(M: ManifoldToplevel, design: CS, p: CutterParams): { models: Model[]; warnings: string[] } {
  return scoped((k) => {
    const warnings: string[] = [];
    const filled = k(outerOnly(M, design));
    if (filled.isEmpty()) throw new Error("O desenho não tem área para formar o cortador.");

    const blade = k(k(filled.offset(p.blade, "Round")).subtract(filled));
    const rim = k(k(filled.offset(p.blade + p.rimWidth, "Round")).subtract(filled));
    const cutter = k(M.Manifold.union(k(blade.extrude(p.height)), k(rim.extrude(p.rimHeight))));
    const models: Model[] = [{ name: "Cortador", parts: [{ name: "Cortador", color: CUTTER_COLOR, mesh: toMesh(cutter) }] }];

    if (p.stamp) {
      const plate = k(filled.offset(-p.clearance, "Round"));
      if (plate.isEmpty()) throw new Error("Desenho pequeno demais para o carimbo caber no cortador.");
      const inner = k(filled.offset(-p.edgeMargin, "Round"));
      const relief = stampRelief(M, design, inner, p.reliefMode, k);
      if (relief.area() < MIN_RELIEF_AREA) warnings.push("Sem desenho interno para o carimbo marcar: ele sai liso.");
      let stamp = k(plate.extrude(p.plate));
      if (!relief.isEmpty()) stamp = k(stamp.add(k(k(relief.extrude(p.relief)).translate([0, 0, p.plate]))));
      const cb = cutter.boundingBox();
      const sb = stamp.boundingBox();
      const moved = k(stamp.translate([cb.max[0] - sb.min[0] + GAP_MM, 0, 0]));
      models.push({ name: "Carimbo", parts: [{ name: "Carimbo", color: STAMP_COLOR, mesh: toMesh(moved) }] });
    }
    return { models, warnings };
  });
}

export type K = <D extends { delete(): void }>(o: D) => D;

/** Linhas: partes do desenho que não são o contorno externo. Vazados: o que é branco dentro da silhueta. */
export function stampRelief(M: ManifoldToplevel, design: CS, inner: CS, mode: ReliefMode, k: K): CS {
  const lines = () => {
    const parts = design.decompose().map(k);
    const areas = parts.map((c) => k(outerOnly(M, c)).area());
    const outline = areas.indexOf(Math.max(...areas));
    const rest = k(M.CrossSection.union(parts.filter((_, i) => i !== outline)));
    return k(rest.intersect(inner));
  };
  const holes = () => k(inner.subtract(design));
  if (mode === "lines") return lines();
  if (mode === "holes") return holes();
  const l = lines();
  return l.area() >= MIN_RELIEF_AREA ? l : holes();
}
