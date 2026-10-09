import HintText from "./HintText";
import { useId } from "react";
import { labelTerm, TermDesc, TermTip } from "./TermTip";

type Props = { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string; hint?: string;
  /** Medida de comprimento em mm que a pessoa pode digitar em cm por engano (gaveta): mostra "= 35 cm" e sugere ×10 (#194). */
  cm?: boolean };

const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const mmToCm = (mm: number) => br(Math.round(mm) / 10);

/** Mensagem de erro sem "buracos" quando falta um dos limites; em mm (e cm) nas medidas de comprimento. */
function rangeMessage(value: number, min?: number, max?: number, cm = false, unit = "mm"): string {
  if (cm && min !== undefined && max !== undefined) return `Use entre ${br(min)} e ${br(max)} ${unit} (${mmToCm(min)} e ${mmToCm(max)} cm).`;
  if (min !== undefined && max !== undefined) return `Use entre ${br(min)} e ${br(max)}.`;
  if (!Number.isFinite(value)) return "Digite um número.";
  return min !== undefined && value < min ? `No mínimo ${br(min)}.` : `No máximo ${br(max!)}.`;
}

/** Campo numérico com limites; valores fora da faixa ficam marcados e não são aplicados. */
export default function NumField({ label, value, onChange, min, max, step = 0.1, unit = "mm", hint, cm = false }: Props) {
  const term = labelTerm(label);
  const tipId = useId();
  const bad = !Number.isFinite(value) || (min !== undefined && value < min) || (max !== undefined && value > max);
  const asCm = cm && unit === "mm";
  const showEq = asCm && Number.isFinite(value) && value >= 10;
  // digitou em cm (35 em vez de 350): abaixo do mínimo, mas ×10 cabe
  const tenfold = value * 10;
  const mistyped = asCm && Number.isFinite(value) && min !== undefined && value < min && tenfold >= min && (max === undefined || tenfold <= max);
  // a explicação do termo e a sugestão ficam fora do <label> para não entrar no nome do campo
  const field = (
    <>
    <label>
      {label} {unit && `(${unit})`}
      {showEq && <span className="num-eq" aria-hidden="true"> = {mmToCm(value)} cm</span>}
      {term && <TermTip term={term} />}
      <input type="number" aria-describedby={term ? tipId : undefined} value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} aria-invalid={bad} onChange={(e) => onChange(e.target.valueAsNumber)} />
      {bad ? <span className="error">{rangeMessage(value, min, max, asCm, unit)}</span> : hint && <span className="hint"><HintText>{hint}</HintText></span>}
    </label>
    {mistyped && (
      <span className="num-suggest" role="status">
        Você quis dizer {br(value)} cm ({br(tenfold)} mm)?{" "}
        <button type="button" className="link" onClick={() => onChange(tenfold)}>
          Usar {br(tenfold)} mm
        </button>
      </span>
    )}
    {term && <TermDesc id={tipId} term={term} />}
    </>
  );
  return asCm ? <div className="num-wrap">{field}</div> : field;
}

export const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
