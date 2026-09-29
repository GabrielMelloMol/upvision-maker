import { z } from "zod";
import { KwhEntrySchema } from "./energy";

const pct = z.number().min(0).max(100);

export const ChannelSchema = z.object({
  name: z.string().trim().min(1),
  feePct: pct,
  feeFixed: z.number().min(0),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const SettingsSchema = z.object({
  kwhPrice: z.number().min(0),
  laborHourCost: z.number().min(0),
  /** Legado: % sobre o subtotal, só vale quando a impressora não tem preço (a depreciação substitui). */
  maintenancePct: z.number().min(0),
  /** De cada 100 impressões, quantas se perdem. < 100 para não dividir por zero. */
  failurePct: z.number().min(0).max(90, "Use até 90%"),
  /** Imposto sobre a venda (Simples); MEI deixa 0 e lança o DAS em Custos operacionais. */
  taxPct: pct,
  includeFixedCosts: z.boolean(),
  /** Horas de impressão por mês, para ratear os custos operacionais. */
  productiveHoursMonth: z.number().positive(),
  /** Jeito antigo (até a v0.5): o multiplicador também multiplica a mão de obra. */
  multiplyLabor: z.boolean(),
  /** Material que a calculadora já abre como embalagem (1 por peça). */
  packagingMaterialId: z.number().int().positive().nullable(),
  multResale: z.number().positive(),
  multConsumer: z.number().positive(),
  marketplaceMarginPct: pct,
  /** Abaixo disso a calculadora alerta o canal. */
  minMarginPct: pct,
  channels: z.array(ChannelSchema),
  /** Cálculos do kWh pela conta de luz (mais recente primeiro). */
  kwhHistory: z.array(KwhEntrySchema),
});
export type Settings = z.infer<typeof SettingsSchema>;

// Taxas de marketplace são só ponto de partida: mudam com frequência, a usuária confere nas preferências.
export const DEFAULT_SETTINGS: Settings = {
  kwhPrice: 0.9,
  laborHourCost: 0,
  maintenancePct: 0,
  failurePct: 5,
  taxPct: 0,
  includeFixedCosts: false,
  productiveHoursMonth: 120,
  multiplyLabor: false,
  packagingMaterialId: null,
  multResale: 3,
  multConsumer: 5,
  marketplaceMarginPct: 30,
  minMarginPct: 10,
  channels: [
    { name: "Shopee", feePct: 20, feeFixed: 4 },
    { name: "Mercado Livre (clássico)", feePct: 14, feeFixed: 6.75 },
    { name: "TikTok Shop", feePct: 12, feeFixed: 4 },
  ],
  kwhHistory: [],
};
