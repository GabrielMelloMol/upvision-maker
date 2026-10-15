import type { LucideIcon } from "lucide-react";

type Props<T extends string> = { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; full?: boolean; icons?: Partial<Record<T, LucideIcon>> };

/** Controle segmentado: escolha única entre 2–4 opções curtas. */
export default function Segmented<T extends string>({ label, value, options, onChange, full, icons }: Props<T>) {
  return (
    <div className={`seg ${full ? "full" : ""}`} role="group" aria-label={label}>
      {options.map(([v, text]) => {
        const Icon: LucideIcon | undefined = icons?.[v];
        return (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {Icon && <Icon size={14} aria-hidden="true" />}
            {text}
          </button>
        );
      })}
    </div>
  );
}
