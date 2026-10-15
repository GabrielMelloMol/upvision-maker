import { useState } from "react";
import { suggestAsync, CutCancelled } from "../../geometry/cutClient";
import type { Suggestion } from "../../geometry/cutSuggest";
import type { Model } from "../../geometry/types";
import Alert from "../../ui/Alert";
import { errorText } from "../../ui/Toast";

type Props = { model: Model; onApply: (s: Suggestion) => void };

const mm = (n: number) => n.toFixed(1).replace(".", ",");
const cm2 = (mm2: number) => (mm2 / 100).toFixed(1).replace(".", ",");
const pct = (s: Suggestion) => Math.round(((s.before - s.after) / s.before) * 100);

/** (O pai troca a `key` a cada arquivo: análise nova.) "Onde cortar para imprimir sem suporte": analisa as saliências (mais de 45° no ar) e propõe cortes, com o ganho já medido. */
export default function SuggestCard({ model, onApply }: Props) {
  const [state, setState] = useState<{ status: "idle" | "busy" | "done"; list: Suggestion[]; error: string | null }>({ status: "idle", list: [], error: null });

  async function analyze() {
    setState({ status: "busy", list: [], error: null });
    try {
      setState({ status: "done", list: await suggestAsync(model), error: null });
    } catch (e) {
      if (!(e instanceof CutCancelled)) setState({ status: "done", list: [], error: errorText(e) });
    }
  }

  return (
    <div className="card stack">
      <h3>Cortar para imprimir sem suporte</h3>
      <p className="hint">Procura braços, abas e galhos que ficam no ar e propõe um corte logo abaixo de cada um: o pedaço assenta na mesa pela face cortada.</p>
      <button type="button" className="sm" onClick={() => void analyze()} disabled={state.status === "busy"}>
        {state.status === "busy" ? "Analisando…" : state.status === "done" ? "Analisar de novo" : "Analisar o modelo"}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.status === "done" && !state.error && state.list.length === 0 && <Alert kind="ok">Não achei saliência que um corte reto resolva: o modelo já imprime sem suporte, ou o que precisa de suporte é inclinado.</Alert>}
      {state.list.length > 0 && (
        <ul className="stack" aria-label="Sugestões de corte">
          {state.list.map((s) => (
            <li key={s.z} className="row wrap">
              <span>
                Cortar a {mm(s.z)} mm: tira {pct(s)}% da área no ar ({cm2(s.before)} → {cm2(s.after)} cm²)
              </span>
              <button type="button" className="sm primary" onClick={() => onApply(s)}>
                Usar este corte
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
