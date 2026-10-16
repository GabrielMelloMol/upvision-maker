import { PAGES } from "../../pages";
import { worksWithoutAms } from "./amsTable";
import { MODELS } from "./defs";
import { modelScore, toolScore } from "./search";
import { FILE_TOOLS, PRODUCTS, type Entry, type Product } from "./products";
import { inCollection } from "./variants";
import type { Occasion } from "./OccasionChips";

/** Um resultado da busca da Criar: a variação ou a ferramenta que combina e o produto a que pertence (as soltas de arquivo não têm). */
export type Hit = { product: Product | null; entry: Entry; score: number };

/** Texto de busca de uma ferramenta de um produto: o nome da tela e o do atalho ("Chaveiros Nome em lote"). */
export const toolLabel = (page: string, label = ""): string => `${PAGES.find((p) => p.id === page)?.label ?? ""} ${label}`.trim();
const blurbOf = (page: string) => PAGES.find((p) => p.id === page)?.blurb ?? "";

/**
 * A busca da Criar: cada variação de modelo e cada ferramenta (de produto ou de arquivo) que combina, do que mais
 * combina para o que menos (empate: a ordem da Criar). "anilha" acha Chaveiro › Anilha; "chaveiro com nome", a ferramenta de lote.
 */
export function searchHits(q: string, noAms = false): Hit[] {
  const hits: (Hit & { i: number })[] = [];
  let i = 0;
  for (const product of PRODUCTS)
    for (const entry of product.entries) {
      const score = entry.kind === "model" ? (noAms && !worksWithoutAms(entry.id) ? null : modelScore(entry.id, q)) : toolScore(entry.page, `${toolLabel(entry.page, entry.label)} ${product.label}`, blurbOf(entry.page), q);
      if (score !== null) hits.push({ product, entry, score, i: i++ });
      else i++;
    }
  for (const page of FILE_TOOLS) {
    const entry: Entry = { kind: "tool", page, label: PAGES.find((p) => p.id === page)?.label ?? page };
    const score = toolScore(page, entry.label, blurbOf(page), q);
    if (score !== null) hits.push({ product: null, entry, score, i: i++ });
    else i++;
  }
  return hits.sort((a, b) => a.score - b.score || a.i - b.i).map((h) => ({ product: h.product, entry: h.entry, score: h.score }));
}

/** Produtos que têm variação na ocasião (ou favorita), e a variação que o cartão abre (a 1ª que combina). */
export function occasionPicks(occasion: Exclude<Occasion, null>, favorites: readonly string[], noAms = false): { product: Product; entry: Entry; matching: number }[] {
  const ok = (id: string) => (occasion === "favorites" ? favorites.includes(id) : inCollection(id, occasion)) && (!noAms || worksWithoutAms(id)) && MODELS.some((m) => m.id === id);
  return PRODUCTS.flatMap((product) => {
    const list = product.entries.filter((e) => e.kind === "model" && ok(e.id));
    return list.length ? [{ product, entry: list[0], matching: list.length }] : [];
  });
}
