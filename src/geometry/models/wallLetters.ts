import { bedMm } from "../bed";
import type { CS, Solid } from "../manifold";
import { fitInto, outerOnly, scoped } from "../shape2d";
import type { Model } from "../types";
import { MissingInput, moveModel, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { pinHoles, splitToBed } from "./splitBed";

export type WallLettersParams = {
  text: string;
  height: number; // altura das letras na parede
  layers: 1 | 2 | 3;
  offset: number; // quanto cada camada de baixo sobra em volta da de cima
  thickness: number; // espessura da camada de baixo
  layerThickness: number; // espessura das camadas de cima
  template: boolean;
  color1: string; // camada de baixo
  color2: string;
  color3: string;
};

export const DEFAULT_WALL_LETTERS: WallLettersParams = {
  text: "FESTA",
  height: 300,
  layers: 2,
  offset: 4,
  thickness: 8,
  layerThickness: 3,
  template: true,
  color1: "#1c1c1e",
  color2: "#c9a227",
  color3: "#f8f8f6",
};

const PIN_R = 1.0; // pino de filamento de 1,75 mm com folga
const TEMPLATE_W = 20;
const TEMPLATE_T = 0.8;
const MARK_W = 1.2; // risco no gabarito onde cada letra começa e termina
const MARK_H = 10;
const GAP = 15;

/**
 * Letras soltas para parede: o texto na altura pedida, uma peça por letra, com 1 a 3 camadas em offset (cores
 * diferentes). Letra maior que a mesa sai em partes com furos para pino de filamento. Gabarito: tira fina com
 * um risco onde cada letra começa e termina, para colar alinhado.
 */
export function buildWallLetters({ M, text }: ModelCtx, p: WallLettersParams): ModelOutput {
  return scoped((k) => {
    const raw = text(p.text, p.height);
    if (!raw) throw new MissingInput("Digite o texto das letras.");
    const word = k(fitInto(k(raw), 1e6, p.height, 0));
    const pad = p.offset * (p.layers - 1);
    // cada componente de fora é uma letra (as que se tocam, como em cursiva, ficam juntas)
    const letters = k(outerOnly(M, word)).decompose().map(k).map((outer) => k(outer.intersect(word)));
    letters.sort((a, b) => a.bounds().min[0] - b.bounds().min[0]);
    const colors = [p.color1, p.color2, p.color3];
    const models: Model[] = [];
    let split = 0;
    letters.forEach((L, i) => {
      // camada c (0 = de baixo) = letra com offset (layers − 1 − c)·offset; furos da letra mantidos
      const layers: { cs: CS; z: number; h: number }[] = [];
      let z = 0;
      for (let c = 0; c < p.layers; c++) {
        const off = p.offset * (p.layers - 1 - c);
        const h = c === 0 ? p.thickness : p.layerThickness;
        layers.push({ cs: off ? k(L.offset(off, "Round")) : L, z, h });
        z += h;
      }
      const solids: Solid[] = layers.map((l) => k(k(l.cs.extrude(l.h)).translate([0, 0, l.z])));
      const base = k(pinHoles(M, solids[0], bedMm(), PIN_R, p.thickness / 2));
      const pieces = splitToBed(M, base, bedMm()).map(k);
      if (pieces.length > 1) split++;
      // a camada de baixo manda na grade: cada pedaço leva as camadas de cima que caem nele
      pieces.forEach((b0, j) => {
        const bb = b0.boundingBox();
        const box = k(k(M.Manifold.cube([bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], 1e4])).translate([bb.min[0], bb.min[1], -5e3]));
        const parts = [b0, ...solids.slice(1).map((s) => k(s.intersect(box)))]
          .map((s, c) => ({ name: `Camada ${c + 1}`, color: colors[c], mesh: solidMesh(s) }))
          .filter((q) => q.mesh.indices.length);
        models.push({ name: `Letra ${i + 1}${pieces.length > 1 ? `.${j + 1}` : ""}`, parts });
      });
    });
    const warnings: string[] = [];
    if (split) warnings.push(`${split} letra(s) passam da mesa de ${bedMm()} mm e saíram em partes: una com cola e um pedaço de filamento de 1,75 mm nos furos.`);

    if (p.template) {
      const wb = word.bounds();
      const len = wb.max[0] - wb.min[0] + 2 * pad;
      const strip = k(k(M.CrossSection.square([len, TEMPLATE_W], true)).translate([(wb.min[0] + wb.max[0]) / 2, 0]));
      const marks = letters.flatMap((L) => {
        const b = L.bounds();
        return [b.min[0], b.max[0]].map((x) => k(k(M.CrossSection.square([MARK_W, MARK_H], true)).translate([x, TEMPLATE_W / 2 - MARK_H / 2])));
      });
      const tpl2d = k(strip.subtract(k(M.CrossSection.union(marks))));
      const tpl = k(tpl2d.extrude(TEMPLATE_T));
      const segs = splitToBed(M, tpl, bedMm()).map(k);
      segs.forEach((s, j) =>
        models.push(moveModel({ name: `Gabarito${segs.length > 1 ? ` ${j + 1}` : ""}`, parts: [{ name: "Gabarito", color: p.color1, mesh: solidMesh(s) }] }, 0, wb.min[1] - pad - GAP - TEMPLATE_W / 2 - j * (TEMPLATE_W + GAP))),
      );
      warnings.push("Gabarito: cole a tira na parede com fita, alinhe cada letra entre os riscos dela e retire a tira depois.");
    }
    return { models, warnings };
  });
}
