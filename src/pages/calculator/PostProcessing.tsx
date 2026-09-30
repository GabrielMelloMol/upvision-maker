import { Plus } from "lucide-react";
import { formatDuration, parseDuration } from "../../ui/parse";

/** Etapas comuns de pós-processamento (#147) e o tempo típico de cada uma por mesa, em minutos. */
export const POST_STEPS: [string, number][] = [
  ["Remover suporte", 5],
  ["Lixar", 10],
  ["Primer ou tinta", 20],
  ["Colar ou montar", 5],
  ["Ímã ou NFC", 3],
];

/** Soma `add` minutos ao texto da mão de obra ("15 min" + 10 → "25 min"). */
export const addMinutes = (labor: string, add: number) => formatDuration((parseDuration(labor, "min") || 0) + add);

/** Botões que somam o tempo de cada etapa na mão de obra; os materiais (tinta, ímã…) vão em Materiais extras. */
export default function PostProcessing({ labor, onLabor }: { labor: string; onLabor: (v: string) => void }) {
  return (
    <div className="field">
      <span className="field-label">Pós-processamento</span>
      <div className="chips" role="group" aria-label="Pós-processamento">
        {POST_STEPS.map(([step, min]) => (
          <button key={step} type="button" onClick={() => onLabor(addMinutes(labor, min))} title={`Somar ${min} min na mão de obra`}>
            <Plus aria-hidden size={12} /> {step} ({min} min)
          </button>
        ))}
      </div>
      <span className="hint">Soma na mão de obra; ajuste o tempo se precisar. Tinta, primer, ímã e cola entram em Materiais extras.</span>
    </div>
  );
}
