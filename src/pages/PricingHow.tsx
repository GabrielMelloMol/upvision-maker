import { useEffect, useState } from "react";
import { getDb } from "../db";
import { loadSettings } from "../db/repo";
import { money } from "../domain/format";
import { EXAMPLE, exampleResult, priceSteps } from "../domain/priceExample";
import type { Go } from "../pages";

/**
 * "Como calculamos o preço" (#216): a fórmula de cada componente com um exemplo, para a pessoa confiar na conta.
 * Os números do exemplo saem do mesmo `calculate` da Calculadora (src/domain/priceExample.ts).
 */
export default function PricingHow({ go }: { go: Go }) {
  const steps = priceSteps();
  const r = exampleResult();
  const [mine, setMine] = useState<{ kwh: number; labor: number; failure: number; resale: number; consumer: number } | null>(null);
  useEffect(() => {
    let alive = true;
    getDb()
      .then((db) => loadSettings(db))
      .then((s) => alive && setMine({ kwh: s.kwhPrice, labor: s.laborHourCost, failure: s.failurePct, resale: s.multResale, consumer: s.multConsumer }))
      .catch(() => {}); // sem banco (ou na primeira abertura) a página funciona só com o exemplo
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="page pricing-how">
      <h1>Como calculamos o preço</h1>
      <p className="lead">A mesma conta da Calculadora, com um exemplo.</p>

      <section className="card" aria-labelledby="ph-example">
        <h2 id="ph-example">O exemplo</h2>
        <p>
          Uma mesa com <b>{EXAMPLE.pieces} chaveiros</b>: {EXAMPLE.grams} g de filamento a {money(EXAMPLE.pricePerKg)} o quilo, {EXAMPLE.hours} h de impressão numa impressora de {EXAMPLE.watts} W, {EXAMPLE.laborHours.toLocaleString("pt-BR")} h do seu trabalho e uma argola em cada. O resultado: custo de <b>{money(r.unitCost)}</b> por peça.
        </p>
        {mine && (
          <p className="hint" data-testid="pricing-mine">
            Seus valores hoje: kWh {money(mine.kwh)} · sua hora {money(mine.labor)} · falhas {mine.failure}% · multiplicadores ×{mine.resale} e ×{mine.consumer}.{" "}
            <button type="button" className="link" onClick={() => go("preferences")}>
              Ajustar nas Preferências
            </button>
          </p>
        )}
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
