import { z } from "zod";
import type { CalcResult } from "./calc";
import { round2 } from "./format";
import { planConsumption, type ConsumptionPlan, type Product, type ProductCtx } from "./products";

export const STATUSES = ["pending", "production", "done", "delivered", "canceled"] as const;
export type OrderStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pendente",
  production: "Em produção",
  done: "Concluído",
  delivered: "Entregue",
  canceled: "Cancelado",
};

export const CONSUMER = "Consumidor final";
export const RESALE = "Revenda";

const nonNeg = z.number().min(0, "Não pode ser negativo");

export const OrderItem = z.object({
  productId: z.number().int().positive().nullable(), // null = item avulso
  description: z.string().trim().min(1, "Obrigatório").max(200),
  qty: z.number().positive("Precisa ser maior que 0"),
  unitPrice: nonNeg,
  discountPct: z.number().min(0).max(100, "Máximo 100%"),
  unitCost: nonNeg, // foto do custo na criação (para o financeiro)
  printMinutes: nonNeg, // minutos de máquina por unidade (R$/hora)
  /** Personalização (#164): uma cópia por linha ("Ana", "Bia;Mãe"), como o lote dos Modelos prontos. */
  custom: z.string().max(4000, "Personalização muito longa.").default(""),
});
export type OrderItem = z.infer<typeof OrderItem>;

export const OrderInput = z.object({
  customerId: z.number().int().positive().nullable(),
  customerName: z.string().trim().min(1, "Informe o cliente").max(120),
  channel: z.string().trim().min(1).max(60),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable(),
  paymentMethod: z.string().trim().max(60),
  notes: z.string().trim().max(2000),
  freight: nonNeg,
  items: z.array(OrderItem).min(1, "Adicione pelo menos um item"),
});
export type OrderInput = z.infer<typeof OrderInput>;

export type Order = Omit<OrderInput, "items"> & {
  id: number;
  status: OrderStatus;
  stockApplied: boolean;
  appliedPlan: ConsumptionPlan | null;
  createdAt: string;
  deliveredAt: string | null;
  quoteId: number | null;
  /** Quanto o cliente já pagou (#177): 0 = a receber, entre 0 e o total = sinal, o total ou mais = pago. */
  paidAmount: number;
  items: (OrderItem & { id: number })[];
};

export const lineTotal = (i: Pick<OrderItem, "qty" | "unitPrice" | "discountPct">) => round2(i.qty * i.unitPrice * (1 - i.discountPct / 100));

export function orderTotals(items: Pick<OrderItem, "qty" | "unitPrice" | "discountPct">[], freight: number) {
  // B8: cada linha em centavos antes de somar (como em `lineTotal`), senão subtotal − desconto ≠ total por R$ 0,01
  const subtotal = round2(items.reduce((s, i) => s + round2(i.qty * i.unitPrice), 0));
  const lines = round2(items.reduce((s, i) => s + lineTotal(i), 0));
  return { subtotal, discount: round2(subtotal - lines), freight: round2(freight), total: round2(lines + freight) };
}

const TAKES_STOCK: Record<OrderStatus, boolean> = { pending: false, production: true, done: true, delivered: true, canceled: false };

/** O que muda no estoque ao trocar de status. O estoque é baixado ao confirmar e devolvido ao cancelar ou voltar para pendente. */
export function transition(from: OrderStatus, to: OrderStatus, stockApplied: boolean): { stock: "apply" | "revert" | null } {
  if (from === "canceled" && to !== "pending") throw new Error("Pedido cancelado: reabra (volte para Pendente) antes de mudar o status.");
  if (TAKES_STOCK[to] && !stockApplied) return { stock: "apply" };
  if (!TAKES_STOCK[to] && stockApplied) return { stock: "revert" };
  return { stock: null };
}

/** Consumo do pedido inteiro. Itens do mesmo produto compartilham o estoque pronto (sem contar duas vezes). */
export function planForOrder(items: Pick<OrderItem, "productId" | "qty">[], ctx: ProductCtx): ConsumptionPlan {
  const plan: ConsumptionPlan = { filaments: {}, materials: {}, products: {} };
  for (const i of items) if (i.productId) planConsumption(i.productId, i.qty, ctx, { useOwnStock: true }, new Set(), plan);
  return plan;
}

/** Preço sugerido do produto no canal do pedido. */
export function priceForChannel(p: Product, r: CalcResult, channel: string): number {
  if (channel === CONSUMER) return p.manualPrice ?? r.consumer;
  if (channel === RESALE) return r.resale;
  return r.channels.find((c) => c.name === channel)?.price ?? p.manualPrice ?? r.consumer;
}

/** Atrasado: tem prazo, já passou e ainda não foi entregue/cancelado. */
export const isLate = (o: Pick<Order, "dueDate" | "status">, today: string) => !!o.dueDate && o.dueDate < today && (o.status === "pending" || o.status === "production" || o.status === "done");

export const todayIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Cópias da personalização de um item (#164): uma por linha não vazia ("Bia;Mãe" vira "Bia · Mãe" na lista). */
export const customCopies = (custom: string) =>
  custom
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(";").map((x) => x.trim()).filter(Boolean).join(" · "));

export type PaymentState = "paid" | "partial" | "unpaid";
export const PAYMENT_LABEL: Record<PaymentState, string> = { paid: "Pago", partial: "Sinal recebido", unpaid: "A receber" };

/** Situação do pagamento (#177): quanto entrou, quanto falta e o rótulo; pedido cancelado não tem nada a receber. */
export function paymentOf(o: Pick<Order, "items" | "freight" | "paidAmount" | "status">) {
  const total = orderTotals(o.items, o.freight).total;
  const paid = round2(Math.min(Math.max(o.paidAmount, 0), total));
  const due = o.status === "canceled" ? 0 : round2(total - paid);
  const state: PaymentState = total > 0 && paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { total, paid, due, state };
}

/** Texto pronto para avisar o cliente (#177), ainda editável no WhatsApp: pedido pronto e, se faltar, quanto e como pagar. */
export function readyMessage(o: Pick<Order, "id" | "customerName" | "items" | "freight" | "paidAmount" | "status" | "paymentMethod">, shop: string): string {
  const { due } = paymentOf({ ...o, status: "pending" });
  const first = o.customerName.trim().split(/\s+/)[0];
  const pay = due > 0 ? ` Falta pagar ${brl(due)}${o.paymentMethod ? ` (${o.paymentMethod})` : ""}.` : " O pagamento já está em dia.";
  return `Olá, ${first}! Seu pedido #${o.id} está pronto.${pay}${shop ? ` — ${shop}` : ""}`;
}

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Link do WhatsApp para o telefone do cliente (DDD + número; sem o 55, entra como Brasil); null se o número não serve. */
export function whatsappLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return full.length >= 12 && full.length <= 13 ? `https://wa.me/${full}?text=${encodeURIComponent(text)}` : null;
}
