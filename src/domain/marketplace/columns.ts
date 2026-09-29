/**
 * Colunas das planilhas de upload em massa (#78). ARQUIVO PARA ATUALIZAR quando o marketplace mudar o modelo:
 * cada chave aceita vários rótulos; a comparação ignora acento, maiúscula, "*" e o que vem depois de ":" ou "(".
 * O app acha a aba e a linha de cabeçalho do modelo baixado pelo maior número de rótulos conhecidos e preenche
 * só essas colunas; as outras ficam como vieram.
 *
 * Shopee: rótulos do "Basic Template" de upload em massa do Seller Center Brasil (modelo de 2025-01, conferido
 * numa cópia pública em set/2026). Peso em kg; medidas em cm inteiros; imagens só por URL (o app deixa em branco).
 * Mercado Livre: rótulos usuais da planilha de "Anunciar em massa" — CONFERIR com um modelo baixado; a planilha
 * do ML é por categoria e não tem coluna de categoria. Peso em gramas.
 */
export type ListingKey =
  | "category"
  | "name"
  | "description"
  | "skuParent"
  | "sku"
  | "price"
  | "stock"
  | "weight"
  | "length"
  | "width"
  | "height"
  | "ncm"
  | "origin"
  | "unit"
  | "condition";

export type Marketplace = "shopee" | "ml";

export type MarketplaceSpec = {
  label: string;
  /** Canal de preço que vem selecionado (nome do canal nas Preferências, começo do nome). */
  defaultChannel: string;
  weightUnit: "kg" | "g";
  columns: Partial<Record<ListingKey, string[]>>;
};

export const MARKETPLACES: Record<Marketplace, MarketplaceSpec> = {
  shopee: {
    label: "Shopee",
    defaultChannel: "Shopee",
    weightUnit: "kg",
    columns: {
      category: ["Categoria"],
      name: ["Nome do Produto"],
      description: ["Descrição do Produto"],
      skuParent: ["SKU principal"],
      price: ["Preço"],
      stock: ["Estoque"],
      sku: ["SKU"],
      weight: ["Peso"],
      length: ["Comprimento"],
      width: ["Largura"],
      height: ["Altura"],
      ncm: ["NCM"],
      origin: ["Origem"],
      unit: ["Unidade de Medida"],
    },
  },
  ml: {
    label: "Mercado Livre",
    defaultChannel: "Mercado Livre",
    weightUnit: "g",
    columns: {
      name: ["Título"],
      description: ["Descrição"],
      sku: ["SKU", "Código do anunciante"],
      price: ["Preço"],
      stock: ["Estoque", "Quantidade"],
      condition: ["Condição"],
      weight: ["Peso da embalagem", "Peso"],
      length: ["Comprimento da embalagem", "Comprimento"],
      width: ["Largura da embalagem", "Largura"],
      height: ["Altura da embalagem", "Altura"],
      ncm: ["NCM"],
      origin: ["Origem"],
    },
  },
};

/** Origem da mercadoria (NF-e): o código vai para a planilha. */
export const ORIGINS = [
  ["0", "0 · Nacional"],
  ["1", "1 · Estrangeira (importação direta)"],
  ["2", "2 · Estrangeira (mercado interno)"],
  ["3", "3 · Nacional, mais de 40% importado"],
  ["4", "4 · Nacional (processo produtivo básico)"],
  ["5", "5 · Nacional, até 40% importado"],
  ["6", "6 · Estrangeira sem similar (importação direta)"],
  ["7", "7 · Estrangeira sem similar (mercado interno)"],
  ["8", "8 · Nacional, mais de 70% importado"],
] as const;
