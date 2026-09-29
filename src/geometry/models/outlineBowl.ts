import type { CS, Solid } from "../manifold";
import { medalOutline } from "../medal";
import { fitInto, outerOnly, scoped } from "../shape2d";
import { artParts, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { BED_MM } from "./gridCutter";

export type OutlineBowlParams = {
  width: number;
  height: number;
  /** Parede. */
  shell: number;
  floor: number;
  bottomRadius: number;
  rimRadius: number;
  /** Desenho em relevo no fundo, por dentro. */
  floorArt: boolean;
  floorArtScale: number;
  relief: number;
  bowlColor: string;
  artColor: string;
};

export const DEFAULT_OUTLINE_BOWL: OutlineBowlParams = {
  width: 90,
  height: 40,
  shell: 1.6,
  floor: 1.6,
  bottomRadius: 6,
  rimRadius: 0.8,
  floorArt: true,
  floorArtScale: 0.5,
  relief: 0.8,
  bowlColor: "#fde68a",
  artColor: "#b45309",
};

/** Degrau das curvas (fundo e borda): uma camada de 0,4 mm, o que a impressora faria de qualquer jeito. */
const STEP = 0.4;
const EXAMPLE = 100;
const MAX_ART_SCALE = 0.8;

/**
 * Cumbuca no contorno de um desenho fechado (#66): a silhueta vira a boca, a parede tem a espessura da casca e o
 * fundo e a borda são arredondados em degraus de uma camada. Sem desenho enviado, usa um coração de exemplo.
 */
export function buildOutlineBowl(ctx: ModelCtx, p: OutlineBowlParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const src: CS = ctx.art && !ctx.art.isEmpty() ? ctx.art : k(medalOutline(M, "heart", EXAMPLE));
    const outline = k(fitInto(k(outerOnly(M, src)), p.width, 1e6, 0));
    const H = p.height;
    const rb = Math.max(0, Math.min(p.bottomRadius, H / 2, p.width / 4));
    const layer = (cs: CS, h: number, z: number): Solid => k(k(cs.extrude(h)).translate([0, 0, z]));
    const slices: Solid[] = [];
    // fundo arredondado: a cada camada o contorno recua pelo quarto de círculo de raio rb
    for (let z = 0; z < rb - 1e-9; z += STEP) {
      const h = Math.min(STEP, rb - z);
      const inset = rb - Math.sqrt(Math.max(0, rb * rb - (rb - z - h / 2) ** 2));
      slices.push(layer(k(outline.offset(-inset, "Round")), h, z));
    }
    slices.push(layer(outline, H - rb, rb));
    const outer = k(M.Manifold.union(slices));
    const inner = k(outline.offset(-p.shell, "Round"));
    const floor = Math.max(p.floor, STEP);
    let body = k(outer.subtract(layer(inner, H, floor)));
    // borda arredondada: tira os cantos de cima da parede em degraus (meia-cana de raio rr)
    const rr = Math.max(0, Math.min(p.rimRadius, p.shell / 2));
    if (rr > 0) {
      const cuts: Solid[] = [];
      for (let z = H - rr; z < H - 1e-9; z += STEP / 2) {
        const h = Math.min(STEP / 2, H - z);
        const cut = rr - Math.sqrt(Math.max(0, rr * rr - (z + h / 2 - (H - rr)) ** 2));
        if (cut <= 0) continue;
        const ring = k(k(outline.subtract(k(outline.offset(-cut, "Round")))).add(k(k(inner.offset(cut, "Round")).subtract(inner))));
        cuts.push(layer(ring, h, z));
      }
      if (cuts.length) body = k(body.subtract(k(M.Manifold.union(cuts))));
    }
    const parts = [{ name: "Cumbuca", color: p.bowlColor, mesh: solidMesh(body) }];
    if (p.floorArt) {
      const ib = inner.bounds();
      const scale = Math.min(p.floorArtScale, MAX_ART_SCALE); // dentro do piso, longe da parede
      const fitted = k(fitInto(src, (ib.max[0] - ib.min[0]) * scale, (ib.max[1] - ib.min[1]) * scale, 0));
      const placed = k(fitted.translate([(ib.min[0] + ib.max[0]) / 2, (ib.min[1] + ib.max[1]) / 2]));
      parts.push(...artParts(ctx, placed, p.artColor, "Desenho no fundo", p.relief, floor));
    }
    const b = outline.bounds();
    const warnings = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) > BED_MM ? [`A cumbuca passa da mesa de ${BED_MM} mm. Diminua a largura.`] : [];
    return { models: [{ name: "Cumbuca", parts }], warnings };
  });
}
