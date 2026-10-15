import type { CS, ManifoldToplevel } from "../manifold";
import { medalOutline } from "../medal";
import { outerOnly, scoped } from "../shape2d";
import { roundedRect, type ModelCtx, type ModelOutput } from "./common";
import { buildEjector, fitStamp } from "./brigadeiroEjector";
import { solidMesh } from "./common";

export type CandyShape = "round" | "heart" | "star" | "flower" | "bar" | "art";

export type CandyMoldParams = {
  /** Peso do docinho, g. */
  weight: number;
  /** Densidade do doce, g/cm³ (o brigadeiro fica perto de 1,2). */
  density: number;
  shape: CandyShape;
  /** Altura do docinho (o fundo da cavidade até o êmbolo), mm; a forma se ajusta para caber o peso nessa altura. */
  depth: number;
  wall: number;
  clearance: number;
  /** Texto da marca no êmbolo (se não houver desenho de marca). */
  stampText: string;
  /** "test": a forma de teste de 10 cm³ para pesar e calibrar a densidade. */
  print: "candy" | "test";
  /** O docinho pronto, translúcido, ao lado na prévia (mostra a marca em relevo; não vai para o arquivo). */
  showCandy: boolean;
  frameColor: string;
  ejectorColor: string;
};

export const DEFAULT_CANDY_MOLD: CandyMoldParams = {
  weight: 25,
  density: 1.2,
  shape: "heart",
  depth: 14,
  wall: 1.6,
  clearance: 0.4,
  stampText: "",
  print: "candy",
  showCandy: true,
  frameColor: "#f472b6",
  ejectorColor: "#f8f8f6",
};

const CANDY_COLOR = "#9a5a2b";
const CANDY_GAP = 14; // distância do docinho fantasma à forma
const CANDY_RELIEF = 0.8; // relevo da marca no docinho
const PLATE_H = 2.5; // a espessura do êmbolo (como no Ejetor de brigadeiro)
const TEST_CM3 = 10; // volume da forma de teste
const TEST_DEPTH = 20;
const MIN_SIZE = 16; // abaixo disso a forma não segura o doce
const MM3_PER_CM3 = 1000;
const PETALS = 6;

/** Flor de 6 pétalas redondas em volta de um miolo, sem escala. */
function flower(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D): CS {
  const petal = 4.2, ring = 6;
  const parts: CS[] = [k(M.CrossSection.circle(5.5, 48))];
  for (let i = 0; i < PETALS; i++) {
    const a = (2 * Math.PI * i) / PETALS;
    parts.push(k(M.CrossSection.circle(petal, 32).translate([ring * Math.cos(a), ring * Math.sin(a)])));
  }
  return M.CrossSection.union(parts);
}

/** Contorno de referência do formato (qualquer tamanho): o app só precisa da área e do desenho. */
function baseOutline(ctx: ModelCtx, shape: CandyShape, k: <D extends { delete(): void }>(o: D) => D): CS {
  const { M } = ctx;
  switch (shape) {
    case "heart":
      return medalOutline(M, "heart", 20);
    case "star":
      return medalOutline(M, "star", 20);
    case "flower":
      return flower(M, k);
    case "bar":
      return roundedRect(M, 24, 10, 4);
    case "art":
      if (!ctx.art || ctx.art.isEmpty()) return medalOutline(M, "heart", 20);
      return outerOnly(M, ctx.art);
    default:
      return M.CrossSection.circle(10, 96);
  }
}

const br = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

/**
 * Forma de docinho pelo peso (#220): você diz as gramas e a densidade e o app calcula a cavidade (área × altura = volume).
 * Usa a forma e o êmbolo do Ejetor de brigadeiro e grava a marca no rosto do êmbolo, para o doce sair com ela.
 * "Forma de teste" é uma cavidade de 10 cm³ para pesar e achar a densidade do seu doce.
 */
export function buildCandyMold(ctx: ModelCtx, p: CandyMoldParams): ModelOutput {
  return scoped((k) => {
    const test = p.print === "test";
    const volume = (test ? TEST_CM3 : p.weight / p.density) * MM3_PER_CM3; // mm³
    const depth = test ? TEST_DEPTH : p.depth;
    const shape = test ? "round" : p.shape;
    const base = k(baseOutline(ctx, shape, k));
    const a0 = base.area();
    if (!(a0 > 0)) throw new Error("O desenho não tem área.");
    const s = Math.sqrt(volume / depth / a0); // a cavidade tem exatamente a área que o volume pede
    const scaled = k(base.scale([s, s]));
    const b = scaled.bounds();
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
    const warnings: string[] = [];
    if (Math.min(w, h) < MIN_SIZE) warnings.push(`A forma ficou pequena (${br(Math.min(w, h))} mm): aumente o peso ou diminua a altura do docinho.`);
    if (Math.max(w, h) > 120) warnings.push("A forma ficou grande: aumente a altura do docinho para ela caber na mesa e na mão.");
    const stamp = test ? null : ctx.art2 && !ctx.art2.isEmpty() ? ctx.art2 : p.stampText.trim() ? (() => { const t = ctx.text(p.stampText, 12); return t && k(t); })() : null;
    const out = buildEjector(
      { ...ctx, art: scaled },
      { size: Math.max(w, h), height: depth + PLATE_H, wall: p.wall, clearance: p.clearance, bottom: "flat", frameColor: p.frameColor, ejectorColor: p.ejectorColor },
      { stamp },
    );
    const models = [...out.models];
    if (p.showCandy && !test) {
      // docinho pronto (fantasma), à frente da forma: o formato, a altura e a marca em relevo como o êmbolo deixa
      const centered = k(scaled.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]));
      const plate = k(centered.offset(-p.clearance, "Round"));
      const pb = plate.bounds();
      const mark = stamp && !plate.isEmpty() ? fitStamp(plate, [(pb.min[0] + pb.max[0]) / 2, (pb.min[1] + pb.max[1]) / 2], stamp, false, k) : null;
      const body = k(centered.extrude(depth));
      const candy = mark ? k(k(body.add(k(k(mark.extrude(CANDY_RELIEF)).translate([0, 0, depth])))).translate([0, -(h + CANDY_GAP), 0])) : k(body.translate([0, -(h + CANDY_GAP), 0]));
      models.push({ name: "Docinho (só na prévia)", previewOnly: true, parts: [{ name: "", color: CANDY_COLOR, ghost: true, mesh: solidMesh(candy) }] });
    }
    const grams = (volume / MM3_PER_CM3) * p.density;
    const info = test
      ? `Forma de teste: cabe ${TEST_CM3} cm³. Encha até a borda, sem apertar, e pese: densidade = gramas ÷ ${TEST_CM3}. Digite o resultado em "Densidade do doce".`
      : `Cavidade de ${br(w)} × ${br(h)} mm e ${br(depth, 0)} mm de altura = ${br(volume / MM3_PER_CM3)} cm³: cabe ${br(grams, 0)} g de doce a ${br(p.density, 2)} g/cm³.`;
    return { models, warnings: [info, ...(out.warnings ?? []), ...warnings] };
  });
}
