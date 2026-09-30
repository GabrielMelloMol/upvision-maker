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
/** Sobreposição entre camadas do fundo arredondado (mm), bem abaixo do que a impressora enxerga. */
const OVERLAP = 0.001;

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
    const inner = k(outline.offset(-p.shell, "Round"));
    const floor = Math.max(p.floor, STEP);
    const slices: Solid[] = [];
    // a cavidade acompanha o fundo arredondado (#134): com a cavidade reta, onde o recuo passava da espessura da parede
    // a camada da parede sumia e o resto da parede ficava solto no ar
    const cavity: Solid[] = [layer(inner, H - Math.max(rb, floor), Math.max(rb, floor))];
    // fundo arredondado: a cada camada o contorno recua pelo quarto de círculo de raio rb
    // z pelo índice (somar 0,4 acumula erro e deixava uma fresta de 1e-13 mm entre as camadas); cada camada invade a de
    // cima em OVERLAP: por fora e na cavidade, a de baixo cabe dentro da de cima, então só garante que fiquem coladas
    for (let i = 0; i * STEP < rb - 1e-9; i++) {
      const z = i * STEP;
      const h = Math.min(STEP, rb - z);
      const inset = rb - Math.sqrt(Math.max(0, rb * rb - (rb - z - h / 2) ** 2));
      slices.push(layer(k(outline.offset(-inset, "Round")), h + OVERLAP, z));
      const top = z + h;
      if (top > floor + 1e-9) {
        const from = Math.max(z, floor);
        const hole = k(outline.offset(-(inset + p.shell), "Round"));
        if (!hole.isEmpty()) cavity.push(layer(hole, top - from + OVERLAP, from));
      }
    }
    slices.push(layer(outline, H - rb, rb));
    const outer = k(M.Manifold.union(slices));
    let body = k(outer.subtract(k(M.Manifold.union(cavity))));
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
