import { Store, TriangleAlert, Trophy } from "lucide-react";
import { money } from "../../domain/format";
import { competitorHint, type ChannelRow } from "../../domain/pricing";

export function CompetitorHint({ ours, competitor }: { ours: number; competitor: number }) {
  const h = competitorHint(ours, competitor);
  if (!h) return <>Opcional: veja se o seu preço está longe do mercado.</>;
  return h.ok ? <span className="hint ok">{h.text}</span> : <span className="error">{h.text}</span>;
}

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Preço em cada canal lado a lado, com lucro líquido depois das taxas e alertas (nunca só por cor). */
export default function ChannelTable({ rows, minMarginPct, children }: { rows: ChannelRow[]; minMarginPct: number; children: React.ReactNode }) {
  const comp = rows.some((x) => x.atCompetitor);
  return (
    <section className="card">
      <h2 className="card-title">
        <Store aria-hidden /> Preço por canal
      </h2>
      {children}
      <table>
        <thead>
          <tr>
            <th>Canal</th>
            <th className="num">Preço</th>
            <th className="num">Taxas e impostos</th>
            <th className="num">Lucro líquido</th>
            <th className="num">Margem</th>
            {comp && (
              <th className="num" title="Lucro líquido em cada canal vendendo pelo preço do concorrente, já descontadas as taxas">
                Lucro no preço do concorrente
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name}>
              <td>
                {c.name} {c.best && <span className="badge ok"><Trophy aria-hidden size={12} /> melhor lucro</span>}
                {c.belowMin && <span className="badge warn" title={`Margem mínima: ${pct(minMarginPct)} (Preferências)`}><TriangleAlert aria-hidden size={12} /> abaixo da margem mínima</span>}
              </td>
              {c.price === null ? (
                <td className="num" colSpan={4}>Taxa + margem passam de 100%</td>
              ) : (
                <>
                  <td className="num">{money(c.price)}</td>
                  <td className="num">{money(c.fees)}</td>
                  <td className="num"><Profit value={c.profit} loss={c.loss} /></td>
                  <td className="num">{pct(c.marginPct)}</td>
                </>
              )}
              {comp && <td className="num">{c.atCompetitor && <Profit value={c.atCompetitor.profit} loss={c.atCompetitor.loss} />}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Profit({ value, loss }: { value: number; loss: boolean }) {
  if (!loss) return <>{money(value)}</>;
  return (
    <>
      <span style={{ color: "var(--danger)" }}>{money(value)}</span>{" "}
      <span className="badge"><TriangleAlert aria-hidden size={12} /> prejuízo</span>
    </>
  );
}
