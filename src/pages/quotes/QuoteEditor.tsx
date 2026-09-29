import { useState } from "react";
import { getDb } from "../../db";
import { quotesRepo } from "../../db/quotesRepo";
import { todayIso, type OrderInput } from "../../domain/orders";
import { addDays, type Quote } from "../../domain/quotes";
import { useToast } from "../../ui/Toast";
import OrderEditor from "../orders/OrderEditor";
import type { QuotesData } from "./data";

const nowLocal = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** Orçamento = pedido + validade + condições. Reaproveita o formulário do pedido. */
/** `draft`: itens vindos da calculadora para um orçamento novo. */
export default function QuoteEditor({ data, quote, draft, onClose, onSaved }: { data: QuotesData; quote?: Quote; draft?: Partial<OrderInput>; onClose: () => void; onSaved: (id: number) => void }) {
  const [validUntil, setValidUntil] = useState(quote?.validUntil ?? addDays(todayIso(), data.company.quoteValidityDays));
  const [terms, setTerms] = useState(quote?.terms ?? data.company.quoteTerms);
  const toast = useToast();

  async function saveAs(input: OrderInput): Promise<number> {
    const db = await getDb();
    const full = { ...input, validUntil, terms };
    if (quote) {
      await quotesRepo.update(db, quote, full);
      toast("Orçamento atualizado.");
      return quote.id;
    }
    const id = await quotesRepo.create(db, full, nowLocal());
    toast(`Orçamento nº ${id} criado.`);
    return id;
  }

  return (
    <OrderEditor
      data={data}
      draft={quote ?? draft}
      title={quote ? `Orçamento nº ${quote.id}` : "Novo orçamento"}
      submitLabel={quote ? "Salvar orçamento" : "Criar orçamento"}
      saveAs={saveAs}
      onClose={onClose}
      onSaved={onSaved}
    >
      <div className="grid">
        <label>
          Válido até
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
        <label className="span2">
          Condições comerciais
          <textarea value={terms} maxLength={2000} rows={2} onChange={(e) => setTerms(e.target.value)} />
        </label>
      </div>
    </OrderEditor>
  );
}
