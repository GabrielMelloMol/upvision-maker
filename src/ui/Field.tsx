import HintText from "./HintText";
import type { ReactNode } from "react";

type Props = { label: ReactNode; hint?: ReactNode; error?: string; /** O controle na linha inteira, embaixo do rótulo (texto longo que não cabe nos 200–300 px da linha de campo). */ wide?: boolean; children: ReactNode };

/** Rótulo + controle + dica ou erro (o erro substitui a dica). O <label> envolve o controle, então não precisa de id. */
export default function Field({ label, hint, error, wide, children }: Props) {
  return (
    <label className={wide ? "wide span-2" : undefined}>
      {label}
      {children}
      {error ? <span className="error">{error}</span> : hint && <span className="hint"><HintText>{hint}</HintText></span>}
    </label>
  );
}
