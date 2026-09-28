type Props = { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string; hint?: string };

/** Campo numérico com limites; valores fora da faixa ficam marcados e não são aplicados. */
export default function NumField({ label, value, onChange, min, max, step = 0.1, unit = "mm", hint }: Props) {
  const bad = !Number.isFinite(value) || (min !== undefined && value < min) || (max !== undefined && value > max);
  return (
    <label>
      {label} {unit && `(${unit})`}
      <input type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} aria-invalid={bad} onChange={(e) => onChange(e.target.valueAsNumber)} />
      {bad ? <span className="error">Use entre {min} e {max}.</span> : hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
