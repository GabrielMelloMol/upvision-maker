import type { CS } from "./manifold";
import { scoped } from "./shape2d";

/** Traço mínimo que um bico 0,4 mm imprime. */
export const MIN_STROKE_MM = 0.4;
/** Fração da área que pode sumir na abertura (cantos vivos sempre perdem um pouco). */
const THIN_LOSS_FRAC = 0.03;
/** Peça menor que isto (fração da área total) é pingo de i ou acento, não letra solta. */
const DOT_FRAC = 0.08;

export type TextCheck = { thin: boolean; pieces: number };

/**
 * Checa o texto já em mm: `thin` quando algum traço tem menos de 0,4 mm (some na abertura morfológica
 * −0,2/+0,2 mm) e `pieces` = quantas partes grandes o texto tem (letras que não se tocam).
 */
export function checkText(cs: CS): TextCheck {
  return scoped((k) => {
    const area = cs.area();
    if (area <= 0) return { thin: false, pieces: 0 };
    const opened = k(k(cs.offset(-MIN_STROKE_MM / 2, "Round")).offset(MIN_STROKE_MM / 2, "Round"));
    const pieces = cs.decompose().map(k).filter((p) => p.area() >= area * DOT_FRAC).length;
    return { thin: (area - opened.area()) / area > THIN_LOSS_FRAC, pieces };
  });
}

/**
 * Avisos para mostrar embaixo da prévia. Letras soltas só importam em cursiva (quem escolhe cursiva quer o nome
 * emendado). ponytail: "mais de 2 partes por palavra" tolera a maiúscula solta; medir letra a letra se precisar.
 */
export function textWarnings(c: TextCheck, text: string, cursive: boolean): string[] {
  const out: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (c.thin) out.push("Esta fonte tem traços com menos de 0,4 mm neste tamanho: aumente a altura do texto ou escolha uma fonte mais grossa.");
  if (cursive && c.pieces > words * 2) out.push(`Nesta cursiva as letras não se unem: o texto sai em ${c.pieces} partes. Para o nome emendado, prefira Pacifico, Lobster ou Norican.`);
  return out;
}

const MAX_SHOWN = 24;

/**
 * Aviso de uma linha de texto já no tamanho final (depois de o modelo encolher para caber, #146): null se o traço
 * imprime. A altura dita é a da linha na peça (ou `heightMm`, para texto em arco).
 */
export function thinLineWarning(line: CS, text: string, heightMm?: number): string | null {
  if (!checkText(line).thin) return null;
  const b = line.bounds();
  const shown = text.length > MAX_SHOWN ? `${text.slice(0, 20).trimEnd()}…` : text;
  const h = (heightMm ?? b.max[1] - b.min[1]).toFixed(1).replace(".", ",");
  return `"${shown}" ficou com ${h} mm de altura: os traços ficam com menos de ${String(MIN_STROKE_MM).replace(".", ",")} mm e somem na impressão. Aumente o texto ou a peça, encurte a linha ou use uma fonte mais grossa.`;
}
