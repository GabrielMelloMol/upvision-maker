import { round2 } from "../format";
import { productPricing, salePrice, type Product, type ProductCtx } from "../products";
import { spreadWarning, swapComposition, type Variant, variantStocks } from "../variants";
import { PRICE_NAMES } from "../pricing";
import { MARKETPLACES, type ListingKey, type Marketplace } from "./columns";
import { fillTemplate, writeXlsx, type Cell } from "./xlsx";

export type ListingOptions = {
  marketplace: Marketplace;
  /** Nome do preço/canal da tabela da calculadora (venda direta, lojista ou um canal das Preferências). */
  channel: string;
  categoryId: string;
  /** Embalagem somada ao peso estimado (g). */
  packagingG: number;
  /** Caixa usada quando o produto não tem a sua (cm). */
  box: { length: number; width: number; height: number };
};

export type ListingRow = { product: Product; variant?: Variant; values: Partial<Record<ListingKey, Cell>>; missing: string[] };

const MAX_DEPTH = 10;

/** Gramas de filamento de uma unidade do produto (kits somam os produtos de dentro). */
export function productGrams(p: Product, ctx: ProductCtx, depth = 0): number {
  if (depth > MAX_DEPTH) return 0; // kit dentro de si mesmo: o editor de produto já avisa
  const own = p.composition.filaments.reduce((t, l) => t + l.grams, 0) / Math.max(1, p.piecesPerPlate);
  const inside = p.composition.items.reduce((t, it) => {
    const child = ctx.products.find((x) => x.id === it.productId);
    return t + (child ? productGrams(child, ctx, depth + 1) * it.qty : 0);
  }, 0);
  return round2(own + inside);
}

function channelPrice(p: Product, ctx: ProductCtx, channel: string): number | null {
  try {
    const r = productPricing(p, ctx).result;
    if (channel === PRICE_NAMES.consumer.name) return salePrice(p, r);
    if (channel === PRICE_NAMES.resale.name) return r.resale;
    return r.channels.find((c) => c.name === channel)?.price ?? null;
  } catch {
    return null; // kit circular
  }
}

/** Produto como a variação o vende: filamento da cor trocado e o preço da variação no lugar do manual (#82). */
const asVariant = (p: Product, v: Variant, stock: number): Product => ({ ...p, composition: swapComposition(p.composition, v.swaps), manualPrice: v.price ?? p.manualPrice, sku: v.sku, stock });

/**
 * Uma linha por produto (ou por variação, #82), já nas unidades do marketplace, e a lista do que falta preencher
 * (para a prévia). As variações de um produto saem juntas, com o mesmo número de integração.
 */
export function listingRows(products: Product[], ctx: ProductCtx, o: ListingOptions): ListingRow[] {
  return products.flatMap((p) => {
    if (!p.variants.length) return [productRow(p, p, ctx, o)];
    const stocks = variantStocks(p.stock, p.variants);
    const rows = p.variants.map((v, i) => {
      const r = productRow(asVariant(p, v, stocks[i]), p, ctx, o);
      return { ...r, variant: v, values: { ...r.values, skuParent: p.sku || null, variationGroup: `UV${p.id}`, variationName: p.variationLabel, variationOption: v.name } };
    });
    const spread = spreadWarning(rows.flatMap((r) => (typeof r.values.price === "number" ? [r.values.price] : [])));
    return spread && o.marketplace === "shopee" ? rows.map((r) => ({ ...r, missing: [...r.missing, "preços das variações (mais de 4× de diferença)"] })) : rows;
  });
}

function productRow(p: Product, parent: Product, ctx: ProductCtx, o: ListingOptions): ListingRow {
  const spec = MARKETPLACES[o.marketplace];
  const grams = p.weightG ?? productGrams(p, ctx) + o.packagingG;
  const price = channelPrice(p, ctx, o.channel);
  const values: Partial<Record<ListingKey, Cell>> = {
    category: o.categoryId.trim() || null,
    name: p.name,
    description: p.description.trim() || p.name,
    skuParent: p.sku || null,
    sku: p.sku || null,
    price,
    stock: Math.max(0, Math.floor(p.stock)),
    weight: spec.weightUnit === "kg" ? round2(grams / 1000) : Math.round(grams),
    length: Math.ceil(p.boxL ?? o.box.length),
    width: Math.ceil(p.boxW ?? o.box.width),
    height: Math.ceil(p.boxH ?? o.box.height),
    ncm: p.ncm || null,
    origin: p.origin,
    unit: p.unit,
    condition: "Novo",
  };
  const missing = [
    ...(p.description.trim() ? [] : ["descrição"]),
    ...(p.ncm ? [] : ["NCM"]),
    ...(price === null ? ["preço no canal"] : []),
    ...(spec.columns.category && !o.categoryId.trim() ? ["categoria"] : []),
  ];
  return { product: parent, values, missing };
}

/**
 * Arquivo para o upload em massa: com o modelo baixado do marketplace, preenche o próprio modelo; sem ele, uma
 * planilha simples com as mesmas colunas (para copiar e colar no modelo).
 */
export function listingFile(rows: ListingRow[], marketplace: Marketplace, template?: Uint8Array): { bytes: Uint8Array; note: string } {
  const spec = MARKETPLACES[marketplace];
  const keys = Object.keys(spec.columns) as ListingKey[];
  if (template) {
    const out = fillTemplate(template, spec.columns as Record<string, string[]>, rows.map((r) => r.values));
    const skipped = out.missing.length ? ` Colunas que o modelo não tem: ${out.missing.join(", ")}.` : "";
    return { bytes: out.bytes, note: `Preenchido na aba "${out.sheet}" a partir da linha ${out.startRow}.${skipped}` };
  }
  const header = keys.map((k) => spec.columns[k]![0]);
  const bytes = writeXlsx([{ name: spec.label, rows: [header, ...rows.map((r) => keys.map((k) => r.values[k]))] }]);
  return { bytes, note: "Planilha simples com as colunas do modelo: copie as linhas para o modelo baixado do marketplace." };
}
