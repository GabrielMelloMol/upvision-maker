import { Store, TriangleAlert, Trophy } from "lucide-react";
import { money } from "../../domain/format";
import { competitorHint, hourStatus, type ChannelRow } from "../../domain/pricing";

export function CompetitorHint({ ours, competitor }: { ours: number; competitor: number }) {
  const h = competitorHint(ours, competitor);
  if (!h) return <>Opcional: veja se o seu preço está longe do mercado.</>;
  return h.ok ? <span className="hint ok">{h.text}</span> : <span className="error">{h.text}</span>;
}

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Preço em cada canal lado a lado, com lucro líquido depois das taxas e alertas (nunca só por cor). */
/** `stale`: aviso de taxas não conferidas há mais de 90 dias, por nome de canal (#34). */
export default function ChannelTable({ rows, minMarginPct, target, stale = {}, children }: { rows: ChannelRow[]; minMarginPct: number; target: number; stale?: Record<string, string>; children: React.ReactNode }) {
  const comp = rows.some((x) => x.atCompetitor);
  const perHour = rows.some((x) => x.profitPerHour !== null);
  const byTarget = rows.some((x) => x.targetPrice !== null);
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
            {perHour && <th className="num" title="Lucro líquido × peças na mesa ÷ horas de impressão">Lucro por hora</th>}
            {byTarget && <th className="num" title={`Preço que rende a meta de ${money(target)}/h de máquina (Preferências)`}>Preço pela meta</th>}
            {comp && (
              <th className="num" title="Lucro líquido em cada canal vendendo pelo preço testado, já descontadas as taxas">
                Lucro no preço testado
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name}>
              <td>
                {c.name} {c.best && <span className="badge ok"><Trophy aria-hidden size={12} /> melhor lucro</span>}
                {stale[c.name] && <span className="badge warn"><TriangleAlert aria-hidden size={12} /> {stale[c.name]}</span>}
                {c.shippingIncluded && <span className="badge warn" title="Neste preço o frete fica por sua conta (faixas de preço do canal, Preferências)"><TriangleAlert aria-hidden size={12} /> frete obrigatório neste preço</span>}
                {c.belowMin && <span className="badge warn" title={`Margem mínima: ${pct(minMarginPct)} (Preferências)`}><TriangleAlert aria-hidden size={12} /> abaixo da margem mínima</span>}
              </td>
              {c.price === null ? (
                <td className="num" colSpan={perHour ? 5 : 4}>Taxa + margem passam de 100%</td>
              ) : (
                <>
                  <td className="num">{money(c.price)}</td>
                  <td className="num">{money(c.fees)}</td>
                  <td className="num"><Profit value={c.profit} loss={c.loss} /></td>
                  <td className="num">{pct(c.marginPct)}</td>
                  {perHour && <td className="num"><PerHour value={c.profitPerHour} target={target} /></td>}
                </>
              )}
              {byTarget && <td className="num">{c.targetPrice !== null && money(c.targetPrice)}</td>}
              {comp && <td className="num">{c.atCompetitor && <Profit value={c.atCompetitor.profit} loss={c.atCompetitor.loss} />}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const HOUR_BADGE = { low: ["", "menos da metade da meta"], below: ["warn", "abaixo da meta"], ok: ["ok", "na meta"] } as const;

/** R$/h com o selo da meta (texto, nunca só cor). */
export function PerHour({ value, target }: { value: number | null; target: number }) {
  if (value === null) return null;
  const st = hourStatus(value, target);
  return (
    <>
      {money(value)}/h {st && <span className={`badge ${HOUR_BADGE[st][0]}`}>{HOUR_BADGE[st][1]}</span>}
    </>
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
