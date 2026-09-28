type Props<T extends string> = { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; full?: boolean };

/** Controle segmentado: escolha única entre 2–4 opções curtas. */
export default function Segmented<T extends string>({ label, value, options, onChange, full }: Props<T>) {
  return (
    <div className={`seg ${full ? "full" : ""}`} role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}
