import { ArrowLeftRight, Columns2, X } from "lucide-react";
import { money } from "../../domain/format";
import { compareScenarios, type ScenarioLine, type ScenarioSummary } from "../../domain/scenario";

const fmt = (n: number, unit: ScenarioLine["unit"]) =>
  unit === "money" ? money(n) : unit === "money/h" ? `${money(n)}/h` : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unit}`;

function Diff({ l }: { l: ScenarioLine }) {
  if (l.diff === null) return <span className="muted">—</span>;
  if (l.diff === 0) return <span className="muted">igual</span>;
  const sign = l.diff > 0 ? "+" : "−";
  const text = `${sign}${fmt(Math.abs(l.diff), l.unit)}`;
  if (l.higherIsBetter === null) return <span>{text}</span>;
  const better = l.diff > 0 === l.higherIsBetter;
  // a palavra diz melhor/pior; a cor só reforça
  return (
    <span className={better ? "diff-good" : "diff-bad"}>
      {text} <small>({better ? "melhor" : "pior"})</small>
    </span>
  );
}

type Props = { a: ScenarioSummary; b: ScenarioSummary; onSwap: () => void; onClose: () => void };

/** Cenário A (congelado) × B (o que está na tela), por peça e na venda direta (#44). */
export default function Compare({ a, b, onSwap, onClose }: Props) {
  const title = (s: ScenarioSummary, fallback: string) => s.name || fallback;
  return (
    <section className="card compare" aria-label="Comparar cenários">
      <div className="row compare-head">
        <h2 className="card-title">
          <Columns2 aria-hidden /> Comparar cenários
        </h2>
        <button type="button" className="ghost sm" onClick={onSwap}>
          <ArrowLeftRight aria-hidden size={14} /> Trocar A e B
        </button>
        <button type="button" className="ghost icon-only" aria-label="Fechar comparação" onClick={onClose}>
          <X aria-hidden />
        </button>
      </div>
      <p className="hint">O A ficou guardado; mude o que quiser na calculadora (material, camada, peças na mesa…) e veja o B aqui.</p>
      <table>
        <thead>
          <tr>
            <th />
            <th className="num">A · {title(a, "guardado")}</th>
            <th className="num">B · {title(b, "na tela")}</th>
            <th className="num">B − A</th>
          </tr>
        </thead>
        <tbody>
          {compareScenarios(a, b).map((l) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td className="num">{l.a === null ? "—" : fmt(l.a, l.unit)}</td>
              <td className="num">{l.b === null ? "—" : fmt(l.b, l.unit)}</td>
              <td className="num">
                <Diff l={l} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
