import { useId } from "react";
import { labelTerm, TermDesc, TermTip } from "./TermTip";

type Props = { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string; hint?: string };

const br = (n: number) => n.toLocaleString("pt-BR");

/** Mensagem de erro sem "buracos" quando falta um dos limites. */
function rangeMessage(value: number, min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `Use entre ${br(min)} e ${br(max)}.`;
  if (!Number.isFinite(value)) return "Digite um número.";
  return min !== undefined && value < min ? `No mínimo ${br(min)}.` : `No máximo ${br(max!)}.`;
}

/** Campo numérico com limites; valores fora da faixa ficam marcados e não são aplicados. */
export default function NumField({ label, value, onChange, min, max, step = 0.1, unit = "mm", hint }: Props) {
  const term = labelTerm(label);
  const tipId = useId();
  const bad = !Number.isFinite(value) || (min !== undefined && value < min) || (max !== undefined && value > max);
  // a explicação do termo fica fora do <label> para não entrar no nome do campo
  return (
    <>
    <label>
      {label} {unit && `(${unit})`}
      {term && <TermTip term={term} />}
      <input type="number" aria-describedby={term ? tipId : undefined} value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} aria-invalid={bad} onChange={(e) => onChange(e.target.valueAsNumber)} />
      {bad ? <span className="error">{rangeMessage(value, min, max)}</span> : hint && <span className="hint">{hint}</span>}
    </label>
    {term && <TermDesc id={tipId} term={term} />}
    </>
  );
}

export const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
