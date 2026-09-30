import { z } from "zod";
import { money } from "./format";
import type { Composition } from "./products";

const id = z.number().int().positive();

/** A Shopee recusa variações cujo maior preço passa de 4× o menor. */
export const MAX_PRICE_SPREAD = 4;

/**
 * Variação do produto (#82), 1 nível (ex.: Cor = Azul): SKU e estoque pronto próprios, preço opcional
 * (null = o do produto com o custo da variação) e troca de filamento na composição (a cor da peça).
 */
export const Variant = z.object({
  name: z.string().trim().min(1, "Dê um nome à variação.").max(40),
  sku: z.string().trim().max(60).default(""),
  stock: z.number().default(0),
  price: z.number().min(0, "Não pode ser negativo").nullable().default(null),
  swaps: z.array(z.object({ from: id, to: id })).default([]),
});
export type Variant = z.infer<typeof Variant>;

/** Composição com os filamentos trocados pela cor da variação (o resto igual). */
export function swapComposition(c: Composition, swaps: Variant["swaps"]): Composition {
  if (!swaps.length) return c;
  const to = new Map(swaps.map((s) => [s.from, s.to]));
  return { ...c, filaments: c.filaments.map((f) => (to.has(f.filamentId) ? { ...f, filamentId: to.get(f.filamentId)! } : f)) };
}

/** Problemas da lista que impedem salvar: nomes ou SKUs repetidos. */
export function variantErrors(list: Variant[]): string[] {
  const out: string[] = [];
  const dup = (vals: string[]) => vals.filter((v, i) => v && vals.findIndex((x) => x.toLowerCase() === v.toLowerCase()) !== i);
  const names = dup(list.map((v) => v.name.trim()));
  const skus = dup(list.map((v) => v.sku.trim()));
  if (names.length) out.push(`Variação repetida: ${[...new Set(names)].join(", ")}.`);
  if (skus.length) out.push(`SKU repetido: ${[...new Set(skus)].join(", ")}.`);
  return out;
}

/** Aviso (não impede salvar) quando o maior preço passa de 4× o menor: a Shopee recusa a planilha. */
export function spreadWarning(prices: number[]): string | null {
  const ok = prices.filter((p) => p > 0);
  if (ok.length < 2) return null;
  const lo = Math.min(...ok), hi = Math.max(...ok);
  return hi > lo * MAX_PRICE_SPREAD ? `O maior preço (${money(hi)}) passa de ${MAX_PRICE_SPREAD}× o menor (${money(lo)}): a Shopee não aceita essas variações juntas.` : null;
}
