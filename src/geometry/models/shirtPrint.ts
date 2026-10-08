import type { CS } from "../manifold";
import { fitInto, followTransform, scoped } from "../shape2d";
import type { Part } from "../types";
import { backing, MissingInput, slab, type ModelCtx, type ModelOutput } from "./common";

export type ShirtPrintParams = {
  text: string; // sem desenho, a estampa é do texto
  width: number;
  layers: number; // quantas camadas finas
  layerHeight: number; // o fatiador usa a mesma (vai no perfil)
  mirror: boolean; // espelhada: a face de baixo (da mesa) é a que fica à vista no tecido
  patch: boolean; // fundo contínuo em volta e entre as letras, na mesma espessura
  margin: number; // largura do fundo em volta da arte
  color: string;
  patchColor: string;
};

export const DEFAULT_SHIRT_PRINT: ShirtPrintParams = { text: "Ana", width: 90, layers: 2, layerHeight: 0.15, mirror: true, patch: false, margin: 3, color: "#1c1c1e", patchColor: "#f8f8f6" };

export const MIN_STROKE_MM = 0.8; // mais fino que isso solta na lavagem
const MAX_ISLAND_MM2 = 4; // ilha menor que isso não gruda bem com o ferro

const round = (n: number) => Math.round(n * 1000) / 1000;
/** Espessura total da estampa em mm. */
export const printThickness = (p: Pick<ShirtPrintParams, "layers" | "layerHeight">) => round(p.layers * p.layerHeight);

/**
 * Estampa de camisa: arte ou texto em camada fina (~0,3 mm) para passar a ferro no tecido. Espelhada por padrão, porque
 * a face que encosta na mesa é a que fica à vista depois de colar. Com "fundo", vira um adesivo contínuo de duas cores.
 */
export function buildShirtPrint(ctx: ModelCtx, p: ShirtPrintParams): ModelOutput {
  const { M, art, artLayers, text } = ctx;
  return scoped((k) => {
    const src = art ?? (() => { const t = text(p.text, 100); return t && k(t); })();
    if (!src || src.isEmpty()) throw new MissingInput("Digite o texto ou envie um desenho.");
    const t = printThickness(p);
    const flip = (cs: CS) => (p.mirror ? k(cs.scale([-1, 1])) : cs);
    const fit = k(fitInto(src, p.width, 1e6, 0));
    const placed = flip(fit);
    // cores do desenho, no mesmo lugar do contorno (e espelhadas junto)
    const layers = art && artLayers && artLayers.length > 1 ? artLayers.map((l) => ({ color: l.color, cs: flip(k(k(followTransform(art, fit, l.cs)).intersect(fit))) })).filter((l) => !l.cs.isEmpty()) : null;
    const parts: Part[] = [];
    const design = layers ?? [{ color: p.color, cs: placed }];
    design.forEach((l, i) => parts.push({ name: design.length > 1 ? `Estampa ${i + 1}` : "Estampa", color: l.color, mesh: slab(l.cs, t) }));
    if (p.patch) {
      const film = k(backing(M, placed, p.margin));
      const around = k(film.subtract(placed));
      if (!around.isEmpty()) parts.push({ name: "Fundo", color: p.patchColor, mesh: slab(around, t) });
    }
    const warnings: string[] = [];
    const area = placed.area();
    const opened = k(k(placed.offset(-MIN_STROKE_MM / 2, "Round")).offset(MIN_STROKE_MM / 2, "Round"));
    if (area - opened.area() > area * 0.05) warnings.push(`Tem traço mais fino que ${String(MIN_STROKE_MM).replace(".", ",")} mm: pode soltar na lavagem. Aumente o tamanho ou use uma fonte mais grossa.`);
    const islands = placed.decompose().map(k).filter((c) => c.area() < MAX_ISLAND_MM2).length;
    if (islands && !p.patch) warnings.push(`${islands} pedaço(s) pequeno(s) soltos (menos de ${MAX_ISLAND_MM2} mm²): ligue o fundo para a estampa sair numa peça só, ou eles se perdem ao colar.`);
    if (t > 0.6) warnings.push("Estampa grossa fica dura no tecido: de 0,2 a 0,4 mm costuma dobrar com a camisa.");
    // instruções de uso, como o suporte de celular: aparecem na tela junto da peça
    warnings.push(p.mirror ? "A estampa sai espelhada: a face que fica na mesa é a que fica à vista. Coloque essa face para cima e o lado de cima da impressão contra o tecido." : "Sem espelhar, textos saem ao contrário depois de colada: ligue \"Espelhar\" para letras e números.");
    warnings.push("Para colar: papel manteiga ou pano fino por cima, ferro de passar sem vapor, apertando de 20 a 30 segundos; deixe esfriar antes de soltar o papel. A temperatura depende do filamento e do tecido: teste num retalho.");
    return { models: [{ name: "Estampa de camisa", parts }], warnings };
  });
}

