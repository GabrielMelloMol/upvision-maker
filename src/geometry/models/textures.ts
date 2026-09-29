import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";

export type BgTexture = "none" | "stripes" | "waves" | "hexagons" | "dots" | "checker";

export const BG_TEXTURES: readonly (readonly [BgTexture, string])[] = [
  ["none", "Liso"],
  ["stripes", "Listras"],
  ["waves", "Ondas"],
  ["hexagons", "Hexágonos"],
  ["dots", "Pontos"],
  ["checker", "Xadrez"],
];

const WAVE_SEG = 24; // pontos por onda

/**
 * Padrão 2D (as áreas que afundam) cobrindo `region`, com passo `pitch` mm, já recortado por ela.
 * Listras a 45°, ondas, colmeia, pontos em quincôncio e xadrez; metade da área, mais ou menos, fica rebaixada.
 */
export function texturePattern(M: ManifoldToplevel, region: CS, kind: BgTexture, pitch: number): CS | null {
  if (kind === "none") return null;
  return scoped((k) => {
    const b = region.bounds();
    const [x0, y0, x1, y1] = [b.min[0] - pitch, b.min[1] - pitch, b.max[0] + pitch, b.max[1] + pitch];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const R = Math.hypot(x1 - x0, y1 - y0) / 2;
    const cells: CS[] = [];
    if (kind === "stripes") {
      for (let x = -R; x <= R; x += pitch) cells.push(k(k(k(M.CrossSection.square([pitch / 2, 2 * R], true)).rotate(45)).translate([cx + x * Math.SQRT2, cy])));
    } else if (kind === "waves") {
      const amp = pitch / 3, w = pitch / 2.5;
      for (let y = y0; y <= y1; y += pitch) {
        const top: [number, number][] = [], bottom: [number, number][] = [];
        for (let x = x0; x <= x1 + 1e-9; x += pitch / WAVE_SEG) {
          const yy = y + amp * Math.sin((2 * Math.PI * (x - x0)) / (pitch * 2));
          top.push([x, yy + w / 2]);
          bottom.push([x, yy - w / 2]);
        }
        cells.push(k(new M.CrossSection([[...bottom, ...top.reverse()]], "NonZero")));
      }
    } else if (kind === "hexagons") {
      const r = pitch / 2, dx = r * Math.sqrt(3), dy = r * 1.5;
      for (let j = 0, y = y0; y <= y1; j++, y += dy)
        for (let x = x0 + (j % 2) * (dx / 2); x <= x1; x += dx) cells.push(k(k(M.CrossSection.circle(r * 0.8, 6).rotate(30)).translate([x, y])));
    } else if (kind === "dots") {
      for (let j = 0, y = y0; y <= y1; j++, y += pitch / 2)
        for (let x = x0 + (j % 2) * (pitch / 2); x <= x1; x += pitch) cells.push(k(k(M.CrossSection.circle(pitch / 4, 16)).translate([x, y])));
    } else {
      for (let j = 0, y = y0; y <= y1; j++, y += pitch)
        for (let x = x0 + (j % 2) * pitch; x <= x1; x += 2 * pitch) cells.push(k(k(M.CrossSection.square([pitch, pitch])).translate([x, y])));
    }
    return k(M.CrossSection.union(cells)).intersect(region);
  });
}

/**
 * Rebaixa o padrão no topo de `solid` (face em z = `top`), só dentro de `region`, `depth` mm para baixo.
 * Devolve o sólido novo (quem chama dá delete()) ou uma cópia se não houver textura.
 */
export function recessTexture(M: ManifoldToplevel, solid: Solid, region: CS, top: number, kind: BgTexture, pitch: number, depth: number): Solid {
  return scoped((k) => {
    const pattern = texturePattern(M, region, kind, pitch);
    if (!pattern) return solid.translate([0, 0, 0]);
    k(pattern);
    if (pattern.isEmpty()) return solid.translate([0, 0, 0]);
    return solid.subtract(k(k(pattern.extrude(depth + 0.01)).translate([0, 0, top - depth])));
  });
}
