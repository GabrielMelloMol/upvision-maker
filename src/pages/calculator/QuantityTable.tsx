import { Layers, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { CalcResult } from "../../domain/calc";
import { money, round2 } from "../../domain/format";
import { prepCost, quantityTable, type ChannelRow, type Rounding } from "../../domain/pricing";
import { itemFromCalc, orderChannelOf } from "../../domain/quotes";
import type { Settings } from "../../domain/settings";
import MoneyField from "../../ui/MoneyField";
import { parseDuration, parseMoney } from "../../ui/parse";
import TimeField from "../../ui/TimeField";
import { useToast } from "../../ui/Toast";
import { addToQuoteDraft } from "../quotes/draft";

type Props = {
  r: CalcResult;
  s: Settings;
  rows: ChannelRow[];
  freight: number;
  rounding: Rounding;
  marginPct: number;
  /** Minutos de máquina por peça (tempo da mesa ÷ peças). */
  minutesPerPiece: number;
  name: string;
  prepTime: string;
  prepFixed: string;
  onPrep: (patch: { prepTime?: string; prepFixed?: string }) => void;
  onAdded: (count: number) => void;
};

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Preço por unidade em pedidos maiores (lembrancinhas): o preparo do pedido se dilui na quantidade (#32). */
export default function QuantityTable({ r, s, rows, freight, rounding, marginPct, minutesPerPiece, name, prepTime, prepFixed, onPrep, onAdded }: Props) {
  const [channel, setChannel] = useState(rows[0]?.name ?? "");
  const toast = useToast();
  const prep = prepCost(parseDuration(prepTime, "min") || 0, parseMoney(prepFixed) || 0, s);
  const table = quantityTable(r, s, { channel, prep, freight, rounding, marginPct });

  function use(qty: number, unitPrice: number, unitCost: number) {
    const n = addToQuoteDraft(itemFromCalc({ description: name, pieces: qty, unitPrice, unitCost, printMinutes: round2(minutesPerPiece * qty) }), orderChannelOf(channel));
    onAdded(n);
    toast(`${qty} un. adicionadas ao orçamento em rascunho (${n} ${n === 1 ? "item" : "itens"}).`);
  }

  return (
    <section className="card">
      <h2 className="card-title">
        <Layers aria-hidden /> Preço por quantidade
      </h2>
      <div className="grid">
        <TimeField label="Preparo por pedido" bare="min" value={prepTime} onChange={(v) => onPrep({ prepTime: v })} placeholder="20 min" hint="Atender, fatiar, trocar filamento. Usa a sua hora de trabalho." />
        <MoneyField label="Custo fixo por pedido" value={prepFixed} onChange={(v) => onPrep({ prepFixed: v })} hint="Ex.: embalagem do pedido, deslocamento." />
        <label>
          Canal
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {rows.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">Preparo do pedido: {money(prep)}, dividido pelas unidades.</p>
      <table>
        <thead>
          <tr>
            <th className="num">Unidades</th>
            <th className="num">Custo por unidade</th>
            <th className="num">Preço por unidade</th>
            <th className="num">Desconto</th>
            <th className="num">Margem</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map((q) => (
            <tr key={q.qty}>
              <td className="num">{q.qty}</td>
              <td className="num">{money(q.unitCost)}</td>
              {q.price === null ? (
                <td className="num" colSpan={3}>Taxa + margem passam de 100%</td>
              ) : (
                <>
                  <td className="num">{money(q.price)}</td>
                  <td className="num">{q.discountPct > 0 ? pct(q.discountPct) : "—"}</td>
                  <td className="num">
                    {pct(q.marginPct)}{" "}
                    {(q.loss || q.belowMin) && (
                      <span className={`badge ${q.loss ? "" : "warn"}`}>
                        <TriangleAlert aria-hidden size={12} /> {q.loss ? "prejuízo" : "abaixo da margem mínima"}
                      </span>
                    )}
                  </td>
                </>
              )}
              <td className="num">
                {q.price !== null && q.unitCost > 0 && (
                  <button type="button" className="link" aria-label={`Usar ${q.qty} unidades no orçamento`} onClick={() => use(q.qty, q.price!, q.unitCost)}>
                    Usar no orçamento
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
