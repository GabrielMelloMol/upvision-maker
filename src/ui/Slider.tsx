type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  display?: (v: number) => string;
  hint?: string;
  disabled?: boolean;
};

/** Slider com trilho preenchido na cor do design system e valor legível. */
export default function Slider({ label, value, min, max, step = 1, onChange, display = String, hint, disabled }: Props) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label>
      <span className="slider-head">
        <span>{label}</span>
        <b>{display(value)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
