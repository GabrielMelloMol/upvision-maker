import type { Channel } from "./settings";

/**
 * Canais de fábrica com as regras de 2026 (#242). Valores de fontes secundárias que concordam entre si (as centrais de
 * vendedor da Shopee e do Mercado Livre só abrem com JavaScript ou recusam leitura automática): a data fica à vista e a
 * pessoa confere na central do canal. Tudo é editável em Preferências → Canais de venda.
 */
export const RULES_DATE = "2026-10-15";

const SHOPEE_NOTE = "Shopee CNPJ: 20% + R$ 4,50 até R$ 79,99; 14% + R$ 16 (R$ 80 a 99,99), + R$ 20 (R$ 100 a 199,99), + R$ 26 (R$ 200 ou mais); sem teto. Regra de 01/10/2026 lida em fontes secundárias em 15/10/2026: confira na central do vendedor.";
const ML_NOTE = "Mercado Livre: comissão varia por categoria (clássico 10% a 14%, premium 15% a 19%). Abaixo de R$ 79 há um custo por unidade (R$ 5,65 até R$ 18,99; R$ 6,85 até R$ 48,99; R$ 8,15 até R$ 78,99, peça de até 0,3 kg). A partir de R$ 79 o frete grátis é obrigatório e parte dele é sua: o R$ 20 é só um exemplo, use o valor de uma etiqueta real. Regra lida em fontes secundárias em 15/10/2026: confira na central do vendedor.";

export const SHOPEE_2026: Channel = {
  name: "Shopee",
  feePct: 20,
  feeFixed: 4.5,
  tiers: [
    { from: 80, feePct: 14, feeFixed: 16 },
    { from: 100, feePct: 14, feeFixed: 20 },
    { from: 200, feePct: 14, feeFixed: 26 },
  ],
  checkedAt: RULES_DATE,
  rulesNote: SHOPEE_NOTE,
};

const mlTiers = (pct: number): Channel["tiers"] => [
  { from: 19, feePct: pct, feeFixed: 6.85 },
  { from: 49, feePct: pct, feeFixed: 8.15 },
  { from: 79, feePct: pct, feeFixed: 0 },
];
const mlShipping = { freeShippingAbove: 79, shippingCost: 20 } as const;

/** Categorias de comissão: só a porcentagem publicada (a lista de categorias de cada plataforma muda); a pessoa renomeia e confere. */
const byPct = (pcts: number[]) => pcts.map((feePct) => ({ name: `Categoria com ${String(feePct).replace(".", ",")}%`, feePct }));
export const ML_CLASSIC_2026: Channel = { name: "Mercado Livre (clássico)", feePct: 14, feeFixed: 5.65, tiers: mlTiers(14), ...mlShipping, categories: byPct([10, 12, 14]), category: "Categoria com 14%", checkedAt: RULES_DATE, rulesNote: ML_NOTE };
export const ML_PREMIUM_2026: Channel = { name: "Mercado Livre (premium)", feePct: 17, feeFixed: 5.65, tiers: mlTiers(17), ...mlShipping, categories: byPct([15, 17, 19]), category: "Categoria com 17%", checkedAt: RULES_DATE, rulesNote: ML_NOTE };

const TIKTOK_NOTE = "TikTok Shop (desde 15/07/2026): 10% + R$ 4 abaixo de R$ 50; 6% + R$ 6 a partir de R$ 50, sobre o preço depois do seu desconto. O programa de frete grátis é opcional e cobra +6% (teto de R$ 50): some à parte. Regra lida em fontes secundárias em 15/10/2026: confira na central do vendedor.";
export const TIKTOK_2026: Channel = { name: "TikTok Shop", feePct: 10, feeFixed: 4, tiers: [{ from: 50, feePct: 6, feeFixed: 6 }], checkedAt: RULES_DATE, rulesNote: TIKTOK_NOTE };

export const AMAZON_2026: Channel = {
  name: "Amazon",
  feePct: 15,
  feeFixed: 2,
  feeMinPerItem: 1,
  categories: byPct([10, 12, 15]),
  category: "Categoria com 15%",
  checkedAt: RULES_DATE,
  rulesNote: "Amazon: comissão de 10% a 15% conforme a categoria (mínimo de R$ 1 por item). O R$ 2 por item é do plano individual: no profissional ele não existe (R$ 19 por mês). Confira a categoria e o plano na central do vendedor (página de 19/09/2026).",
};
export const SHEIN_2026: Channel = { name: "Shein", feePct: 18, feeFixed: 0, categories: [{ name: "Moda feminina", feePct: 20 }, { name: "Demais categorias", feePct: 18 }], category: "Demais categorias", checkedAt: RULES_DATE, rulesNote: "Shein: 18% (20% em moda feminina), sem taxa fixa; novos CNPJ têm 90 dias de isenção. Fontes secundárias em 15/10/2026: confira na central do vendedor." };

/** O canal de fábrica antigo, sem nada mexido pela pessoa: troca pelo de 2026 ao abrir as preferências salvas. */
const OLD_FACTORY: Record<string, { feePct: number; feeFixed: number; replace: Channel }> = {
  Shopee: { feePct: 20, feeFixed: 4, replace: SHOPEE_2026 },
  "Mercado Livre (clássico)": { feePct: 14, feeFixed: 6.75, replace: ML_CLASSIC_2026 },
  "TikTok Shop": { feePct: 12, feeFixed: 4, replace: TIKTOK_2026 },
};

/** Só os campos básicos: quem mexeu em faixas, teto, frete, custo extra ou conferiu a data fica como está. */
const untouched = (c: Channel) => c.tiers === undefined && c.fixedBelow === undefined && c.feeCapPerItem === undefined && c.freeShippingAbove === undefined && c.shippingCost === undefined && c.extraPerSale === undefined && c.checkedAt === undefined;

export function migrateChannels(channels: Channel[]): Channel[] {
  return channels.map((c) => {
    const old = OLD_FACTORY[c.name];
    return old && c.feePct === old.feePct && c.feeFixed === old.feeFixed && untouched(c) ? old.replace : c;
  });
}
