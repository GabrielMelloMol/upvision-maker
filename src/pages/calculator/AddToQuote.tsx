import { FilePlus } from "lucide-react";
import { useState } from "react";
import { money } from "../../domain/format";
import type { ChannelRow } from "../../domain/pricing";
import { itemFromCalc, orderChannelOf } from "../../domain/quotes";
import { addToQuoteDraft, peekQuoteDraft, requestOpenQuoteDraft } from "../quotes/draft";
import { useToast } from "../../ui/Toast";

type Props = { rows: ChannelRow[]; unitCost: number; pieces: number; printMinutes: number; onOpen: () => void };

/** Soma o cálculo atual como item avulso num rascunho de orçamento (peças únicas que não viram produto). */
export default function AddToQuote({ rows, unitCost, pieces, printMinutes, onOpen }: Props) {
  const priced = rows.filter((r) => r.price !== null);
  const [choice, setChoice] = useState(priced[0]?.name ?? "");
  const [name, setName] = useState("");
  const [count, setCount] = useState(() => peekQuoteDraft()?.items.length ?? 0);
  const toast = useToast();
  const row = priced.find((r) => r.name === choice) ?? priced[0];

  function add() {
    if (!row || row.price === null || unitCost <= 0) return;
    const n = addToQuoteDraft(itemFromCalc({ description: name, pieces, unitPrice: row.price, unitCost, printMinutes }), orderChannelOf(row.name));
    setCount(n);
    setName("");
    toast(`Adicionado ao orçamento em rascunho (${n} ${n === 1 ? "item" : "itens"}).`);
  }

  return (
    <section className="card stack" style={{ gap: "var(--space-3)" }}>
      <h2 className="card-title">
        <FilePlus aria-hidden /> Orçamento
      </h2>
      <label>
        Nome da peça
        <input value={name} maxLength={200} placeholder="Peça impressa em 3D" onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Preço
        <select value={row?.name ?? ""} onChange={(e) => setChoice(e.target.value)}>
          {priced.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name} · {money(r.price!)}
            </option>
          ))}
        </select>
      </label>
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
        <button type="button" className="sm" disabled={!row || unitCost <= 0} onClick={add}>
          Adicionar ao orçamento
        </button>
        {count > 0 && (
          <button
            type="button"
            className="link"
            onClick={() => {
              requestOpenQuoteDraft();
              onOpen();
            }}
          >
            {count} {count === 1 ? "item" : "itens"} no orçamento em rascunho · Abrir
          </button>
        )}
      </div>
    </section>
  );
}
