import { useEffect, useRef, type RefObject } from "react";

/** Rótulo padrão dos campos de texto que viram várias linhas na peça: a quebra é o Enter, sem símbolo especial. */
export const LINES_LABEL = "Texto (Enter para nova linha)";

type Props = { label?: string; value: string; onChange: (v: string) => void; rows?: number; maxLength?: number; inputRef?: RefObject<HTMLTextAreaElement | null> };

/**
 * Campo de texto de várias linhas das ferramentas (Chaveiro, Carimbo, Caixinha, Medalha): Enter quebra a linha.
 * O cursor nasce no fim do texto (o campo de uma linha também era assim): o seletor de emoji insere ali.
 */
export default function LinesField({ label = LINES_LABEL, value, onChange, rows = 2, maxLength, inputRef }: Props) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  useEffect(() => {
    const el = ref.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }, [ref]);
  return (
    <label>
      {label}
      <textarea ref={ref} value={value} rows={rows} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
