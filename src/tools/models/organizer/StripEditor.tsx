import { formatStrips, MAX_PER_STRIP, MAX_STRIPS, parseStrips, type Strip } from "../../../geometry/models/organizer/layout";
import type { Params } from "../fields";

const MIN_RATIO = 0.5, MAX_RATIO = 4, RATIO_STEP = 0.25;
const br = (n: number) => n.toLocaleString("pt-BR");
const replaceAt = (list: Strip[], i: number, patch: Partial<Strip>) => list.map((s, j) => (j === i ? { ...s, ...patch } : s));

function Stepper({ name, value, onLess, onMore, lessDisabled, moreDisabled, lessLabel, moreLabel }: { name: string; value: string; onLess: () => void; onMore: () => void; lessDisabled: boolean; moreDisabled: boolean; lessLabel: string; moreLabel: string }) {
  return (
    <span className="strip-step" role="group" aria-label={name}>
      <button type="button" className="sm" aria-label={lessLabel} disabled={lessDisabled} onClick={onLess}>−</button>
      <output>{value}</output>
      <button type="button" className="sm" aria-label={moreLabel} disabled={moreDisabled} onClick={onMore}>+</button>
    </span>
  );
}

/** Faixa por faixa (só no modo "custom"): nichos e proporção da profundidade de cada faixa, da frente para o fundo. */
export default function StripEditor({ label, value, onChange, params }: { label: string; value: string; onChange: (v: string) => void; params: Params }) {
  if (params.layoutMode !== "custom") return null;
  const strips = parseStrips(value);
  const save = (next: Strip[]) => onChange(formatStrips(next));
  return (
    <div className="strip-editor span-2">
      <span className="field-label">{label} <span className="hint">(da frente para o fundo)</span></span>
      <ol>
        {strips.map((s, i) => (
          <li key={i}>
            <b>Faixa {i + 1}</b>
            <Stepper name={`Nichos da faixa ${i + 1}`} value={`${s.n} ${s.n === 1 ? "nicho" : "nichos"}`} lessLabel={`Menos nichos na faixa ${i + 1}`} moreLabel={`Mais nichos na faixa ${i + 1}`}
              lessDisabled={s.n <= 1} moreDisabled={s.n >= MAX_PER_STRIP} onLess={() => save(replaceAt(strips, i, { n: s.n - 1 }))} onMore={() => save(replaceAt(strips, i, { n: s.n + 1 }))} />
            <Stepper name={`Profundidade da faixa ${i + 1}`} value={`${br(s.ratio)}×`} lessLabel={`Faixa ${i + 1} mais rasa`} moreLabel={`Faixa ${i + 1} mais funda`}
              lessDisabled={s.ratio <= MIN_RATIO} moreDisabled={s.ratio >= MAX_RATIO} onLess={() => save(replaceAt(strips, i, { ratio: s.ratio - RATIO_STEP }))} onMore={() => save(replaceAt(strips, i, { ratio: s.ratio + RATIO_STEP }))} />
            <button type="button" className="sm ghost" disabled={strips.length <= 1} onClick={() => save(strips.filter((_, j) => j !== i))}>
              Remover faixa<span className="sr-only"> {i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="sm" disabled={strips.length >= MAX_STRIPS} onClick={() => save([...strips, { n: strips.at(-1)?.n ?? 1, ratio: 1 }])}>
        + faixa
      </button>
    </div>
  );
}
