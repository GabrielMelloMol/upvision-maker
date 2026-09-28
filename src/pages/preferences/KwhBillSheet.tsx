import { Zap } from "lucide-react";
import { useState } from "react";
import { BILL_FLAGS, kwhFromBill, kwhWarning, type BillFlag, type KwhEntry } from "../../domain/energy";
import { money, parseDecimal } from "../../domain/format";
import { todayIso } from "../../domain/orders";
import Field from "../../ui/Field";
import MoneyField from "../../ui/MoneyField";
import { parseMoney } from "../../ui/parse";
import Segmented from "../../ui/Segmented";
import Sheet from "../../ui/Sheet";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
const flagLabel = (f: BillFlag) => BILL_FLAGS.find((x) => x.id === f)!.label;
const perKwh = (n: number) => `${money(n)}/kWh`;

type Props = { history: KwhEntry[]; onUse: (entry: KwhEntry) => void; onClose: () => void };

/** Assistente: preço do kWh a partir do valor total e do consumo da conta de luz, com bandeira e histórico. */
export default function KwhBillSheet({ history, onUse, onClose }: Props) {
  const [total, setTotal] = useState("");
  const [kwh, setKwh] = useState("");
  const [flag, setFlag] = useState<BillFlag>("verde");
  const price = kwhFromBill(parseMoney(total), parseDecimal(kwh), flag);
  const warning = price !== null ? kwhWarning(price) : null;

  function use(e: React.FormEvent) {
    e.preventDefault();
    if (price === null) return;
    onUse({ month: todayIso().slice(0, 7), total: parseMoney(total), kwh: parseDecimal(kwh), flag, price });
  }

  return (
    <Sheet
      title="Calcular pela conta de luz"
      icon={Zap}
      onClose={onClose}
      onSubmit={use}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={price === null}>
            {price === null ? "Usar este valor" : `Usar ${perKwh(price)}`}
          </button>
        </>
      }
    >
      <BillDiagram />
      <div className="grid two">
        <MoneyField label="Valor total da conta" value={total} onChange={setTotal} hint="“Total a pagar”, com impostos." data-autofocus />
        <Field label="kWh consumidos" hint="“Consumo” do mês, em kWh.">
          <input inputMode="decimal" value={kwh} onChange={(e) => setKwh(e.target.value)} placeholder="Ex.: 300" />
        </Field>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="field-label">Bandeira</span>
        <Segmented label="Bandeira" value={flag} onChange={setFlag} options={BILL_FLAGS.map((f) => [f.id, f.label] as const)} full />
        <span className="hint">Soma o adicional da ANEEL por kWh. Se a conta já veio com essa bandeira, deixe Verde.</span>
      </div>
      <div className="calc-summary" style={{ position: "static" }}>
        <section className="card hero">
          <span className="hint">Preço do kWh</span>
          <span className="big">{price === null ? "—" : money(price)}</span>
          {warning && <span className="error">{warning}</span>}
        </section>
      </div>
      {history.length > 0 && (
        <section className="stack">
          <h3 className="field-label">Cálculos anteriores</h3>
          <ul className="dash-list" aria-label="Cálculos anteriores">
            {history.map((h, i) => {
              const prev = history[i + 1];
              const d = prev ? Math.round((h.price - prev.price) * 100) / 100 : 0;
              return (
                <li key={h.month}>
                  <span>
                    {monthLabel(h.month)} · {flagLabel(h.flag)}
                  </span>
                  <strong className="num">{perKwh(h.price)}</strong>
                  {prev && d !== 0 && (
                    <span className="hint">
                      {d > 0 ? "▲" : "▼"} {money(Math.abs(d))} vs. {monthLabel(prev.month)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Sheet>
  );
}

/** Esboço de uma conta de luz mostrando onde ficam o consumo e o total. */
function BillDiagram() {
  return (
    <svg viewBox="0 0 320 120" role="img" aria-label="Onde achar na conta: consumo em kWh no quadro de leitura e valor total no fim da conta" style={{ width: "100%", maxWidth: 360, color: "var(--muted)" }}>
      <rect x="1" y="1" width="318" height="118" rx="8" fill="var(--surface-raised)" stroke="currentColor" strokeOpacity="0.4" />
      {[18, 30, 42].map((y) => (
        <rect key={y} x="14" y={y} width={y === 18 ? 120 : 90} height="5" rx="2" fill="currentColor" opacity="0.25" />
      ))}
      <rect x="14" y="58" width="140" height="44" rx="6" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <text x="24" y="76" fontSize="10" fill="currentColor">Consumo</text>
      <text x="24" y="94" fontSize="14" fontWeight="700" fill="var(--text)">300 kWh</text>
      <rect x="170" y="58" width="136" height="44" rx="6" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <text x="180" y="76" fontSize="10" fill="currentColor">Total a pagar</text>
      <text x="180" y="94" fontSize="14" fontWeight="700" fill="var(--text)">R$ 276,00</text>
    </svg>
  );
}
