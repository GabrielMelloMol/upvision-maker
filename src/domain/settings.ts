import { z } from "zod";

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
  maintenancePct: z.number().min(0),
  multResale: z.number().positive(),
  multConsumer: z.number().positive(),
  marketplaceMarginPct: pct,
  channels: z.array(ChannelSchema),
});
export type Settings = z.infer<typeof SettingsSchema>;

// Taxas de marketplace são só ponto de partida: mudam com frequência, a usuária confere nas preferências.
export const DEFAULT_SETTINGS: Settings = {
  kwhPrice: 0.9,
  laborHourCost: 0,
  maintenancePct: 5,
  multResale: 3,
  multConsumer: 5,
  marketplaceMarginPct: 30,
  channels: [
    { name: "Shopee", feePct: 20, feeFixed: 4 },
    { name: "Mercado Livre (clássico)", feePct: 14, feeFixed: 6.75 },
    { name: "TikTok Shop", feePct: 12, feeFixed: 4 },
  ],
};
