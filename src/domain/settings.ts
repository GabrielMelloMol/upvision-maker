import { z } from "zod";
import { KwhEntrySchema } from "./energy";

const pct = z.number().min(0).max(100);

export const ChannelSchema = z.object({
  name: z.string().trim().min(1),
  feePct: pct,
  feeFixed: z.number().min(0),
  /** Custo por venda só deste canal: embalagem reforçada, etiqueta, brinde (#33). */
  extraPerSale: z.number().min(0).optional(),
  // Faixas de preço (#31), todas opcionais: sem elas o canal é só comissão % + taxa fixa.
  /** A taxa fixa só vale para preço abaixo disto. */
  fixedBelow: z.number().positive().optional(),
  /** Teto da comissão em R$ por item. */
  feeCapPerItem: z.number().positive().optional(),
  /** A partir deste preço o frete fica por conta de quem vende... */
  freeShippingAbove: z.number().positive().optional(),
  /** ...e custa isto. */
  shippingCost: z.number().min(0).optional(),
  /** Quando a pessoa conferiu as taxas deste canal (AAAA-MM-DD); depois de 90 dias a calculadora avisa (#34). */
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type Channel = z.infer<typeof ChannelSchema>;

/** Meu AMS (#98): quantos slots e o filamento cadastrado de cada um (null = vazio). */
export const AMS_SLOT_OPTIONS = [4, 8, 12, 16] as const;
export const AmsSchema = z.object({
  slots: z.union([z.literal(4), z.literal(8), z.literal(12), z.literal(16)]),
  filaments: z.array(z.number().int().positive().nullable()).max(16),
});
export type Ams = z.infer<typeof AmsSchema>;

export const SettingsSchema = z.object({
  kwhPrice: z.number().min(0),
  laborHourCost: z.number().min(0),
  /** Legado: % sobre o subtotal, só vale quando a impressora não tem preço (a depreciação substitui). */
  maintenancePct: z.number().min(0),
  /** De cada 100 impressões, quantas se perdem. < 100 para não dividir por zero. */
  failurePct: z.number().min(0).max(90, "Use até 90%"),
  /** Taxa de falha por tipo de material (ex.: TPU 12); o que não estiver aqui usa a geral (#35). */
  failureByMaterial: z.record(z.string(), z.number().min(0).max(90, "Use até 90%")),
  /** Imposto sobre a venda (Simples); MEI deixa 0 e lança o DAS em Custos operacionais. */
  taxPct: pct,
  includeFixedCosts: z.boolean(),
  /** Horas de impressão por mês, para ratear os custos operacionais. */
  productiveHoursMonth: z.number().positive(),
  /** Jeito antigo (até a v0.5): o multiplicador também multiplica a mão de obra. */
  multiplyLabor: z.boolean(),
  /** Meta de lucro por hora de máquina (R$/h); 0 = desligada. */
  targetProfitPerHour: z.number().min(0),
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
  ams: AmsSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;

// Taxas de marketplace são só ponto de partida: mudam com frequência, a usuária confere nas preferências.
export const DEFAULT_SETTINGS: Settings = {
  kwhPrice: 0.9,
  laborHourCost: 0,
  maintenancePct: 0,
  failurePct: 5,
  failureByMaterial: {},
  taxPct: 0,
  includeFixedCosts: false,
  productiveHoursMonth: 120,
  multiplyLabor: false,
  packagingMaterialId: null,
  targetProfitPerHour: 0,
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
  ams: { slots: 4, filaments: [] },
};
