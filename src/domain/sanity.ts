import { money } from "./format";

// Faixas do "normal" (#46): fora delas quase sempre é erro de digitação. Os avisos não bloqueiam nada.
const KG_MIN = 40;
const KG_MAX = 800;
const PLATE_G_MAX = 3000;
const HOURS_MAX = 150;
const WATTS_MAX = 1500;
const FAILURE_MAX = 30;
const FEE_MAX = 40;

export type SanityInput = {
  filaments: { pricePerKg: number; grams: number }[];
  printHours: number;
  watts: number;
  failurePct: number;
  channelFees: { name: string; feePct: number }[];
  consumer: number;
  unitCost: number;
};

/** `key` muda com o valor: "está certo" dispensa só aquele valor; se a pessoa digitar outro, avisa de novo. */
export type SanityWarning = { key: string; text: string };

const br = (n: number) => n.toLocaleString("pt-BR");

export function sanityWarnings(i: SanityInput): SanityWarning[] {
  const out: SanityWarning[] = [];
  for (const f of i.filaments) {
    if (!(f.pricePerKg > 0)) continue;
    if (f.pricePerKg < KG_MIN) out.push({ key: `kg:${f.pricePerKg}`, text: `${money(f.pricePerKg)} por kg parece baixo demais: confira se não faltou um dígito.` });
    else if (f.pricePerKg > KG_MAX) out.push({ key: `kg:${f.pricePerKg}`, text: `${money(f.pricePerKg)} por kg parece alto demais: confira a vírgula.` });
  }
  const grams = i.filaments.reduce((t, f) => t + (f.grams > 0 ? f.grams : 0), 0);
  if (grams > PLATE_G_MAX) out.push({ key: `g:${grams}`, text: `${br(grams)} g numa mesa é muito: você quis dizer ${br(Math.round(grams / 10))} g?` });
  if (i.printHours > HOURS_MAX) out.push({ key: `h:${i.printHours}`, text: `${br(Math.round(i.printHours))} h de impressão é muito: confira o tempo (minutos no lugar de horas?).` });
  if (i.watts > WATTS_MAX) out.push({ key: `w:${i.watts}`, text: `${br(i.watts)} W parece a potência da fonte, não o consumo médio imprimindo (a maioria fica entre 60 e 250 W).` });
  if (i.failurePct > FAILURE_MAX) out.push({ key: `fail:${i.failurePct}`, text: `Taxa de falha de ${br(i.failurePct)}% é alta: de cada 10 impressões, mais de 3 dão errado?` });
  for (const c of i.channelFees)
    if (c.feePct > FEE_MAX) out.push({ key: `fee:${c.name}:${c.feePct}`, text: `Comissão de ${br(c.feePct)}% na ${c.name} parece alta: confira em Preferências.` });
  if (i.consumer > 0 && i.consumer < i.unitCost) out.push({ key: "below-cost", text: `O preço de venda direta (${money(i.consumer)}) ficou abaixo do custo (${money(i.unitCost)}): confira o multiplicador.` });
  return out;
}
