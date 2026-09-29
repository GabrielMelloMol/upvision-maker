import { PieChart } from "lucide-react";
import { useState } from "react";
import type { CalcResult } from "../../domain/calc";
import { money } from "../../domain/format";
import type { ChannelRow } from "../../domain/pricing";
import { priceSplit, type SplitPart } from "../../domain/priceSplit";

// cor fixa por parte (ordem validada da paleta --viz-1…5): a cor segue a parte, mesmo quando alguma some
const SLOT: Record<SplitPart["key"], number> = { production: 1, labor: 2, fees: 3, freight: 4, profit: 5 };
const pctText = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %`;

type Props = { r: CalcResult; rows: ChannelRow[]; freight: number };

/** Barra empilhada "para onde vai o preço" de uma peça no canal escolhido; a legenda traz R$ e % de cada parte. */
export default function PriceSplit({ r, rows, freight }: Props) {
  const priced = rows.filter((x): x is ChannelRow & { price: number } => x.price !== null && x.price > 0);
  const [choice, setChoice] = useState<string | null>(null);
  const [hover, setHover] = useState<SplitPart["key"] | null>(null);
  const row = priced.find((x) => x.name === choice) ?? priced[0];
  if (!row || r.unitCost <= 0) return null;
  const { parts, loss } = priceSplit(r, row, freight);
  const summary = parts.map((p) => `${p.label} ${pctText(p.pct)}`).join(", ");

  return (
    <section className="card stack price-split" style={{ gap: "var(--space-3)" }}>
      <h2 className="card-title">
        <PieChart aria-hidden /> Para onde vai o preço
      </h2>
      <label>
        Canal
        <select value={row.name} onChange={(e) => setChoice(e.target.value)}>
          {priced.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name} · {money(x.price)}
            </option>
          ))}
        </select>
      </label>
      <div className="split-bar" role="img" aria-label={`Preço de ${money(row.price)} por peça: ${summary}.`} onMouseLeave={() => setHover(null)}>
        {parts.map((p) => (
          <span
            key={p.key}
            className={`split-seg viz-bg-${SLOT[p.key]}`}
            style={{ flexGrow: p.pct }}
            data-dim={hover !== null && hover !== p.key ? "" : undefined}
            title={`${p.label}: ${money(p.value)} (${pctText(p.pct)})`}
            onMouseEnter={() => setHover(p.key)}
          />
        ))}
      </div>
      <ul className="split-legend">
        {parts.map((p) => (
          <li key={p.key} data-active={hover === p.key ? "" : undefined} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}>
            <i className={`viz-bg-${SLOT[p.key]}`} aria-hidden />
            <span>
              {p.label}
              {p.detail && <span className="hint">{p.detail}</span>}
            </span>
            <span className="num">{money(p.value)}</span>
            <span className="num muted">{pctText(p.pct)}</span>
          </li>
        ))}
      </ul>
      {loss > 0 && <p className="error">Neste canal falta {money(loss)} por peça para cobrir os custos (prejuízo).</p>}
    </section>
  );
}
