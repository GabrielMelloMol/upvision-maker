import type { ReactNode } from "react";

type Props = { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode };

/** Rótulo + controle + dica ou erro (o erro substitui a dica). O <label> envolve o controle, então não precisa de id. */
export default function Field({ label, hint, error, children }: Props) {
  return (
    <label>
      {label}
      {children}
      {error ? <span className="error">{error}</span> : hint && <span className="hint">{hint}</span>}
    </label>
  );
}
