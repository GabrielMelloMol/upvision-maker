import HintText from "./HintText";
import { labelTerm, TermDesc, TermTip } from "./TermTip";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

export type SmartFieldProps = {
  label: ReactNode;
  value: string;
  onChange: (text: string) => void;
  /** Texto → número; NaN = não entendi. */
  parse: (text: string) => number;
  /** Como o valor entendido aparece embaixo (confirmação), ex.: "= 3h20". */
  preview?: (n: number) => string;
  /** Mensagem quando não entende o texto. */
  invalidText: string;
  hint?: ReactNode;
  /** Erro vindo de fora (ex.: validação do banco). */
  error?: string;
  required?: boolean;
  /** Formata o texto ao sair do campo (ex.: "15,9" → "15,90"). */
  formatOnBlur?: (text: string) => string;
  prefix?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "prefix">;

/**
 * Campo de texto que entende o que a pessoa digita.
 * Valida ao sair do campo; depois do primeiro erro, valida a cada tecla e some o erro assim que corrige.
 * Quando entende, mostra o valor interpretado (feedback positivo, não só erro).
 */
export default function SmartField({ label, value, onChange, parse, preview, invalidText, hint, error, required, formatOnBlur, prefix, onBlur, ...rest }: SmartFieldProps) {
  const [touched, setTouched] = useState(false);
  const id = useId();
  const term = labelTerm(label);
  const n = parse(value);
  const empty = value.trim() === "";
  const bad = touched && ((empty && required) || (!empty && !Number.isFinite(n)));
  const message = error ?? (bad ? (empty ? "Obrigatório." : invalidText) : undefined);
  const ok = !message && !empty && Number.isFinite(n) && preview;
  // Dica e erro ficam fora do <label>: o nome do campo é só o rótulo; o resto vai por aria-describedby.
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {term && <TermTip term={term} />}
      </label>
      <span className={`affix ${prefix ? "has-prefix" : ""}`}>
        {prefix && <span className="prefix" aria-hidden>{prefix}</span>}
        <input
          id={id}
          value={value}
          aria-invalid={!!message}
          aria-describedby={term ? `${id}-d ${id}-t` : `${id}-d`}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            setTouched(true);
            if (formatOnBlur && Number.isFinite(parse(value))) onChange(formatOnBlur(value));
            onBlur?.(e);
          }}
          {...rest}
        />
      </span>
      {term && <TermDesc id={`${id}-t`} term={term} />}
      {message ? (
        <span id={`${id}-d`} className="error" role="alert">
          <CircleAlert aria-hidden /> {message}
        </span>
      ) : ok ? (
        <span id={`${id}-d`} className="hint ok">
          <CircleCheck aria-hidden /> {preview(n)}
        </span>
      ) : (
        hint && (
          <span id={`${id}-d`} className="hint">
            <HintText>{hint}</HintText>
          </span>
        )
      )}
    </div>
  );
}
