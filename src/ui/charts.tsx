import { useId, useState } from "react";
import { money } from "../domain/format";
import type { MonthPoint } from "../domain/finance";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

/** Degraus "redondos" para o eixo (1, 2, 2,5, 5 × 10^n). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((s) => s * p >= v) ?? 10) * p;
}

const W = 720;
const H = 240;
const PAD = { l: 64, r: 12, t: 12, b: 28 };
const GAP = 2; // espaço de superfície entre barras vizinhas

const axisLabel = (t: number) => (Math.abs(t) >= 1000 ? `${(t / 1000).toLocaleString("pt-BR")} mil` : t.toLocaleString("pt-BR"));

/** Receita × custos por mês (um eixo, mesma unidade). Lucro aparece no tooltip e na tabela. */
export function MonthlyBars({ data }: { data: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const titleId = useId();
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.revenue, d.costs)), 0));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const band = iw / Math.max(data.length, 1);
  const bw = Math.min(28, (band * 0.7 - GAP) / 2);
  const y = (v: number) => PAD.t + ih - (Math.max(v, 0) / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const bar = (x: number, v: number, cls: string) => {
    const top = y(v);
    const h = PAD.t + ih - top;
    if (h <= 0) return null;
    const r = Math.min(4, h, bw / 2);
    // canto arredondado só em cima; a base fica reta no eixo
    return <path className={cls} d={`M${x},${PAD.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${PAD.t + ih} Z`} />;
  };

  return (
    <figure className="viz" aria-labelledby={titleId}>
      <figcaption id={titleId} className="viz-head">
        <span className="viz-legend">
          <span><i className="s1" /> Receita</span>
          <span><i className="s2" /> Custos (peças + despesas)</span>
        </span>
        <button className="link" onClick={() => setTable(!table)}>{table ? "Ver gráfico" : "Ver tabela"}</button>
      </figcaption>
      {table ? (
        <table>
          <thead><tr><th>Mês</th><th className="num">Receita</th><th className="num">Custos</th><th className="num">Lucro</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}><td>{monthLabel(d.month)}</td><td className="num">{money(d.revenue)}</td><td className="num">{money(d.costs)}</td><td className="num">{money(d.profit)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="viz-plot">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Receita e custos por mês, ${data.length} meses`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="viz-grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
                <text className="viz-axis" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{axisLabel(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.l + band * i + band / 2;
              return (
                <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect className="viz-hit" x={PAD.l + band * i} y={PAD.t} width={band} height={ih} />
                  {bar(cx - bw - GAP / 2, d.revenue, "viz-s1")}
                  {bar(cx + GAP / 2, d.costs, "viz-s2")}
                  {(data.length <= 12 || i % Math.ceil(data.length / 12) === 0) && (
                    <text className="viz-axis" x={cx} y={H - 8} textAnchor="middle">{monthLabel(d.month)}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && data[hover] && (
            <div className="viz-tip" style={{ left: `${((PAD.l + band * hover + band / 2) / W) * 100}%` }} role="status">
              <b>{monthLabel(data[hover].month)}</b>
              <span><i className="s1" /> Receita {money(data[hover].revenue)}</span>
              <span><i className="s2" /> Custos {money(data[hover].costs)}</span>
              <span>Lucro <b>{money(data[hover].profit)}</b></span>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Lucro por mês em gráfico próprio (divergente a partir do zero): azul positivo, vermelho negativo. */
export function ProfitBars({ data }: { data: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const H2 = 160;
  const hi = niceMax(Math.max(0, ...data.map((d) => d.profit)));
  const lo = Math.max(0, ...data.map((d) => -d.profit)) > 0 ? niceMax(Math.max(...data.map((d) => -d.profit))) : 0;
  const ih = H2 - PAD.t - PAD.b;
  const zero = PAD.t + (hi / (hi + lo || 1)) * ih;
  const scale = ih / (hi + lo || 1);
  const iw = W - PAD.l - PAD.r;
  const band = iw / Math.max(data.length, 1);
  const bw = Math.min(28, band * 0.5);
  return (
    <figure className="viz" aria-label="Lucro por mês">
      <div className="viz-plot">
        <svg viewBox={`0 0 ${W} ${H2}`} role="img" aria-label={`Lucro por mês, ${data.length} meses`}>
          {[
            [zero, 0],
            ...(hi > 0 ? [[PAD.t, hi]] : []),
            ...(lo > 0 ? [[PAD.t + ih, -lo]] : []),
          ].map(([yy, v]) => (
            <g key={v}>
              <line className="viz-grid" x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} />
              <text className="viz-axis" x={PAD.l - 8} y={yy + 4} textAnchor="end">{axisLabel(v)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.l + band * i + band / 2;
            const h = Math.abs(d.profit) * scale;
            const up = d.profit >= 0;
            const r = Math.min(4, h, bw / 2);
            const x = cx - bw / 2;
            const top = up ? zero - h : zero + h;
            // ponta arredondada longe do zero; base reta no zero
            const path = up
              ? `M${x},${zero} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${zero} Z`
              : `M${x},${zero} V${top - r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top - r} V${zero} Z`;
            return (
              <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect className="viz-hit" x={PAD.l + band * i} y={PAD.t} width={band} height={ih} />
                {h > 0 && <path className={up ? "viz-s1" : "viz-bad"} d={path} />}
                {(data.length <= 12 || i % Math.ceil(data.length / 12) === 0) && (
                  <text className="viz-axis" x={cx} y={H2 - 8} textAnchor="middle">{monthLabel(d.month)}</text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover] && (
          <div className="viz-tip" style={{ left: `${((PAD.l + band * hover + band / 2) / W) * 100}%` }} role="status">
            <b>{monthLabel(data[hover].month)}</b>
            <span>Receita {money(data[hover].revenue)}</span>
            <span>Custos {money(data[hover].costs)}</span>
            <span>Lucro <b>{money(data[hover].profit)}</b></span>
          </div>
        )}
      </div>
    </figure>
  );
}

/** Barras horizontais de uma série (uma cor); o valor fica em texto, nunca na cor da barra. */
export function HBars({ rows, format = money }: { rows: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  if (!rows.length) return <p className="muted small">Sem vendas entregues no período.</p>;
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ""}`}>
          <span className="hbars-label">{r.label}</span>
          <span className="hbars-track"><span className="hbars-bar" style={{ width: `${Math.max(0, (r.value / max) * 100)}%` }} /></span>
          <span className="hbars-value">
            {format(r.value)}
            {r.sub && <span className="muted small"> · {r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Rótulo pequeno em cima, número grande e variação com seta + texto (a cor só reforça). */
export function StatTile({ label, value, hint, delta, upIsGood = true, tone }: { label: string; value: string; hint?: string; delta?: number | null; upIsGood?: boolean; tone?: "bad" }) {
  const dir = delta === undefined || delta === null || delta === 0 ? null : delta > 0 ? "up" : "down";
  const good = dir && (dir === "up") === upIsGood;
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {dir && (
        <span className={`stat-delta ${good ? "good" : "bad"}`}>
          {dir === "up" ? "▲" : "▼"} {Math.abs(delta!).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs. período anterior
        </span>
      )}
      {delta === null && <span className="stat-hint">sem base para comparar</span>}
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
