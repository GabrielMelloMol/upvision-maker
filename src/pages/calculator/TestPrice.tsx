import { useState } from "react";
import type { ChannelRow } from "../../domain/pricing";
import { money } from "../../domain/format";
import MoneyField from "../../ui/MoneyField";
import { PerHour } from "./ChannelTable";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

type Props = { rows: ChannelRow[]; value: string; onChange: (v: string) => void; minMarginPct: number; target: number };

/** Conta reversa do modo Rápido: "vou vender por R$ X" → lucro, margem, lucro por hora e um selo (nunca só cor). */
export default function TestPrice({ rows, value, onChange, minMarginPct, target }: Props) {
  const [channel, setChannel] = useState(rows[0]?.name ?? "");
  const row = rows.find((r) => r.name === channel) ?? rows[0];
  const m = row?.atCompetitor;
  const verdict = !m ? null : m.loss ? ["", "prejuízo"] : m.marginPct < minMarginPct ? ["warn", "margem abaixo do mínimo"] : ["ok", "ok"];

  return (
    <div className="stack" style={{ gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
      <MoneyField label="Vou vender por" value={value} onChange={onChange} />
      <label>
        Onde
        <select value={row?.name ?? ""} onChange={(e) => setChannel(e.target.value)}>
          {rows.map((r) => (
            <option key={r.name}>{r.name}</option>
          ))}
        </select>
      </label>
      {m && verdict && (
        <p className="hint" aria-live="polite">
          Lucro {money(m.profit)} · margem {pct(m.marginPct)}
          {m.profitPerHour !== null && (
            <>
              {" "}· <PerHour value={m.profitPerHour} target={target} />
            </>
          )}{" "}
          <span className={`badge ${verdict[0]}`}>{verdict[1]}</span>
        </p>
      )}
    </div>
  );
}
