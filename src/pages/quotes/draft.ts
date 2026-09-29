import { z } from "zod";
import { OrderItem } from "../../domain/orders";

/** Rascunho de orçamento montado na calculadora ("Adicionar ao orçamento"), aberto depois em Orçamentos. */
const Draft = z.object({ channel: z.string(), items: z.array(OrderItem) });
export type QuoteDraft = z.infer<typeof Draft>;

const KEY = "upvision:orcamento-rascunho";
let memory: QuoteDraft | null = null; // se o armazenamento falhar, vale ao menos até fechar o app

export function peekQuoteDraft(): QuoteDraft | null {
  try {
    const v = Draft.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    return v.success ? v.data : memory;
  } catch {
    return memory;
  }
}

function store(d: QuoteDraft | null) {
  memory = d;
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch {
    // modo privado/armazenamento bloqueado: fica só na memória
  }
}

/** Soma um item ao rascunho (o canal é o do primeiro item). Devolve quantos itens há. */
export function addToQuoteDraft(item: OrderItem, channel: string): number {
  const cur = peekQuoteDraft();
  const next = { channel: cur?.channel ?? channel, items: [...(cur?.items ?? []), item] };
  store(next);
  return next.items.length;
}

export const clearQuoteDraft = () => store(null);

let openOnVisit = false;
/** "Abrir" na calculadora: a página de Orçamentos abre o rascunho direto no editor. */
export const requestOpenQuoteDraft = () => void (openOnVisit = true);
export const peekOpenQuoteDraft = () => openOnVisit;
export const clearOpenQuoteDraft = () => void (openOnVisit = false);
