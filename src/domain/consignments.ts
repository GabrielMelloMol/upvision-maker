import { z } from "zod";
import { todayIso } from "./orders";

const nonNeg = z.number().min(0, "Não pode ser negativo");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const ConsignmentItem = z.object({
  productId: z.number().int().positive().nullable(),
  name: z.string().trim().min(1, "Obrigatório").max(200),
  qty: z.number().positive("Precisa ser maior que 0"),
  transferPrice: nonNeg, // repasse por unidade
  salePrice: nonNeg, // preço sugerido
});
export type ConsignmentItem = z.infer<typeof ConsignmentItem>;

/** Contrato de consignação em andamento (#184): a loja, as peças que ela repõe a cada ciclo e o prazo entre reposições. */
export const ConsignmentInput = z.object({
  customerId: z.number().int().positive(),
  customerName: z.string().trim().min(1, "Informe a loja").max(120),
  startDate: isoDate,
  periodDays: z.number().int().min(1, "Mínimo 1 dia").max(365, "Máximo 365 dias"),
  items: z.array(ConsignmentItem).min(1, "Adicione pelo menos uma peça"),
  notes: z.string().trim().max(2000),
});
export type ConsignmentInput = z.infer<typeof ConsignmentInput>;

export type Consignment = ConsignmentInput & { id: number; active: boolean; lastRestockAt: string | null; createdAt: string };

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(new Date(`${iso}T12:00:00`).getTime() / DAY_MS);

export const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayIso(d);
};

/** Quando é a próxima reposição: o prazo conta da última reposição, ou do início do contrato se ainda não houve. */
export const nextRestock = (c: Pick<Consignment, "startDate" | "periodDays" | "lastRestockAt">) => addDaysIso(c.lastRestockAt ?? c.startDate, c.periodDays);

/** Dias que faltam para a reposição (negativo = atrasada) e o texto do aviso. */
export function restockStatus(c: Pick<Consignment, "startDate" | "periodDays" | "lastRestockAt">, today = todayIso()) {
  const due = nextRestock(c);
  const days = dayNumber(due) - dayNumber(today);
  const label = days > 1 ? `faltam ${days} dias para a reposição` : days === 1 ? "falta 1 dia para a reposição" : days === 0 ? "reposição é hoje" : days === -1 ? "reposição atrasada há 1 dia" : `reposição atrasada há ${-days} dias`;
  return { due, days, label, soon: days <= 7 };
}

/** Total em repasse de uma reposição completa. */
export const restockTotal = (items: Pick<ConsignmentItem, "qty" | "transferPrice">[]) => Math.round(items.reduce((s, i) => s + i.qty * i.transferPrice, 0) * 100) / 100;
