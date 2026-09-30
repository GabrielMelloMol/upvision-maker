import { Save } from "lucide-react";
import type { CalcResult } from "../../domain/calc";
import { money } from "../../domain/format";
import { markupText, PRICE_NAMES } from "../../domain/pricing";
import type { Settings } from "../../domain/settings";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %`;

type HeroProps = { r: CalcResult; s: Settings; onSave: () => void; onPreferences: () => void; children?: React.ReactNode };

/** Custo por peça e os dois preços do multiplicador, com os nomes explicados (lojista × venda direta). */
export function PriceHero({ r, s, onSave, onPreferences, children }: HeroProps) {
  const laborAfter = r.labor > 0 && !s.multiplyLabor;
  const cost = r.unitCost > 0 ? r : { unitCost: 15.96, resale: 47.88, consumer: 79.8 }; // exemplo quando ainda não há conta
  return (
    <section className="card hero">
      <span className="hint">Custo por peça</span>
      <strong className="big" key={r.unitCost}>{money(r.unitCost)}</strong>
      <button className="primary sm" onClick={onSave}>
        <Save aria-hidden /> Salvar como produto
      </button>
      {/* redesign (#139): os dois preços como linhas, valores alinhados à direita */}
      <dl className="price-rows">
        <div>
          <dt>
            {PRICE_NAMES.resale.name} ×{s.multResale}
            <span className="hint">{markupText(s.multResale)}</span>
          </dt>
          <dd>{money(r.resale)}</dd>
        </div>
        <div>
          <dt>
            {PRICE_NAMES.consumer.name} ×{s.multConsumer}
            <span className="hint">{markupText(s.multConsumer)}</span>
          </dt>
          <dd>{money(r.consumer)}</dd>
        </div>
      </dl>
      {laborAfter && <span className="hint">+ mão de obra somada depois do multiplicador</span>}
      <details className="price-help">
        <summary>Qual preço usar?</summary>
        <p><b>{PRICE_NAMES.resale.name}:</b> {PRICE_NAMES.resale.help}</p>
        <p><b>{PRICE_NAMES.consumer.name}:</b> {PRICE_NAMES.consumer.help}</p>
        <p className="hint">
          Exemplo: custo {money(cost.unitCost)} → lojista {money(cost.resale)} → cliente final {money(cost.consumer)}.
        </p>
        <button type="button" className="link" onClick={onPreferences}>
          Ajustar os multiplicadores nas Preferências
        </button>
      </details>
      {children}
    </section>
  );
}

const Row = ({ label, hint, value }: { label: string; hint?: string; value: number }) => (
  <tr>
    <td>
      {label} {hint && <span className="hint">· {hint}</span>}
    </td>
    <td className="num">{money(value)}</td>
  </tr>
);

/** Parcelas do custo da mesa, com o parâmetro de cada uma em cinza. */
export function CostBreakdown({ r, s, machinePerHour, fixedPerHour, failure, purge }: { r: CalcResult; s: Settings; machinePerHour: number; fixedPerHour: number; failure: { pct: number; source?: string }; purge?: { swaps: number; grams: number } }) {
  return (
    <section className="card">
      <h2 className="card-title">Resultado por peça</h2>
      <table>
        <tbody>
          <Row label="Filamento" value={r.filament} />
          {r.purge > 0 && purge && <Row label="Desperdício multicor" hint={`${purge.swaps.toLocaleString("pt-BR")} trocas · ${purge.grams.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`} value={r.purge} />}
          <Row label="Materiais extras" value={r.extras} />
          <Row label="Energia" value={r.energy} />
          <Row label="Máquina" hint={machinePerHour > 0 ? `${money(machinePerHour)}/h` : "cadastre o preço da impressora"} value={r.machine} />
          <Row label="Falhas" hint={failure.source ? `${pct(failure.pct)} (${failure.source})` : pct(failure.pct)} value={r.failure} />
          <Row label="Mão de obra" value={r.labor} />
          {fixedPerHour > 0 && <Row label="Custos fixos" hint={`${money(fixedPerHour)}/h`} value={r.fixed} />}
          {r.maintenance > 0 && <Row label="Manutenção" hint={pct(s.maintenancePct)} value={r.maintenance} />}
          <tr><th>Custo da mesa</th><th className="num">{money(r.batchCost)}</th></tr>
          <tr><th>Custo por peça</th><th className="num">{money(r.unitCost)}</th></tr>
        </tbody>
      </table>
      <table className="hint" style={{ marginTop: "var(--space-3)", borderTop: "1px solid var(--separator)" }}>
        <tbody>
          <tr><td>Custo por grama</td><td className="num">{r.perGram === null ? "—" : money(r.perGram)}</td></tr>
          <tr><td>Custo por hora de impressão</td><td className="num">{r.perHour === null ? "—" : money(r.perHour)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}
