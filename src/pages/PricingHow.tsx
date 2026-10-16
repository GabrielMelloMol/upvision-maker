import { useEffect, useState } from "react";
import { getDb } from "../db";
import { loadSettings } from "../db/repo";
import { money } from "../domain/format";
import { EXAMPLE, EXAMPLE_SETTINGS, exampleResult, priceSteps } from "../domain/priceExample";
import type { Channel } from "../domain/settings";
import type { Go } from "../pages";

/**
 * "Como calculamos o preço" (#216): a fórmula de cada componente com um exemplo, para a pessoa confiar na conta.
 * Os números do exemplo saem do mesmo `calculate` da Calculadora (src/domain/priceExample.ts).
 */
export default function PricingHow({ go }: { go: Go }) {
  const steps = priceSteps();
  const r = exampleResult();
  const [mine, setMine] = useState<{ kwh: number; labor: number; failure: number; tax: number; resale: number; consumer: number; channel?: Channel } | null>(null);
  useEffect(() => {
    let alive = true;
    getDb()
      .then((db) => loadSettings(db))
      .then((s) => alive && setMine({ kwh: s.kwhPrice, labor: s.laborHourCost, failure: s.failurePct, tax: s.taxPct, resale: s.multResale, consumer: s.multConsumer, channel: s.channels.find((c) => c.name === EXAMPLE.channel.name) ?? s.channels[0] }))
      .catch(() => {}); // sem banco (ou na primeira abertura) a página funciona só com o exemplo
    return () => {
      alive = false;
    };
  }, []);
  const x = EXAMPLE_SETTINGS;
  const rate = (c: Channel) => `${c.name}: ${c.feePct}% + ${money(c.feeFixed)}${c.checkedAt ? ` (regra de ${c.checkedAt.split("-").reverse().join("/")})` : ""}`;
  const rows: [string, string, string | null][] = [
    ["Preço do kWh", money(x.kwhPrice), mine && money(mine.kwh)],
    ["Valor da sua hora", money(x.laborHourCost), mine && money(mine.labor)],
    ["Taxa de falha", `${x.failurePct}%`, mine && `${mine.failure}%`],
    ["Imposto", `${x.taxPct}%`, mine && `${mine.tax}%`],
    ["Multiplicadores", `×${x.multResale} e ×${x.multConsumer}`, mine && `×${mine.resale} e ×${mine.consumer}`],
    ["Canal de venda", rate(EXAMPLE.channel), mine?.channel ? rate(mine.channel) : null],
  ];
  return (
    <div className="page pricing-how">
      <h1>Como calculamos o preço</h1>
      <p className="lead">A mesma conta da Calculadora, com um exemplo.</p>

      <section className="card" aria-labelledby="ph-example">
        <h2 id="ph-example">O exemplo</h2>
        <p>
          Uma mesa com <b>{EXAMPLE.pieces} chaveiros</b>: {EXAMPLE.grams} g de filamento a {money(EXAMPLE.pricePerKg)} o quilo, {EXAMPLE.hours} h de impressão numa impressora de {EXAMPLE.watts} W, {EXAMPLE.laborHours.toLocaleString("pt-BR")} h do seu trabalho e uma argola em cada. O resultado: custo de <b>{money(r.unitCost)}</b> por peça.
        </p>
        <h3>Valores do exemplo e os seus</h3>
        <p className="hint">O exemplo usa valores fixos, para a conta fechar igual para todo mundo. Os seus valores ficam nas Preferências e mudam o resultado na Calculadora.</p>
        <table className="ph-compare" data-testid="pricing-compare">
          <thead>
            <tr>
              <th scope="col">Valor</th>
              <th scope="col">No exemplo (fixo)</th>
              <th scope="col">Os seus hoje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, fixed, own]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{fixed}</td>
                <td>{own ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="link" onClick={() => go("preferences")}>
          Ajustar nas Preferências
        </button>
      </section>

      <ol className="ph-steps" aria-label="Passo a passo da conta">
        {steps.map((s, i) => (
          <li key={s.id} className="card ph-step" id={`ph-${s.id}`}>
            <div className="ph-head">
              <h2>
                <span className="ph-n" aria-hidden>
                  {i + 1}
                </span>{" "}
                {s.title}
              </h2>
              <strong className="ph-value">{money(s.value)}</strong>
            </div>
            <p className="ph-rule">
              <b>Regra:</b> {s.rule}
            </p>
            <p className="ph-sum">
              <b>No exemplo:</b> <code>{s.sum}</code>
            </p>
            {s.note && <p className="muted">{s.note}</p>}
            {s.where && <p className="hint">Onde mudar: {s.where}.</p>}
          </li>
        ))}
      </ol>

      <section className="card" aria-labelledby="ph-sum-all">
        <h2 id="ph-sum-all">Conferindo a soma</h2>
        <p>
          Filamento {money(r.filament)} + extras {money(r.extras)} + energia {money(r.energy)} + máquina {money(r.machine)} + mão de obra {money(r.labor)} + falhas {money(r.failure)} + custos fixos {money(r.fixed)} = <b>{money(r.batchCost)}</b> na mesa, ou <b>{money(r.unitCost)}</b> por peça.
        </p>
        <p className="hint">Os preços finais são só pontos de partida: arredonde para ,90 ou ,99 na Calculadora e compare os canais lado a lado antes de decidir.</p>
        <button type="button" className="primary sm" onClick={() => go("calculator")}>
          Abrir a Calculadora
        </button>
      </section>
    </div>
  );
}
