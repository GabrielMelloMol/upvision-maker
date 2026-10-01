import type { ReactNode } from "react";

/** Dica mais longa que isso mostra só a 1ª frase; o resto vai para o ⓘ (polimento: 1 linha à vista). */
export const HINT_MAX = 90;

/** [à vista, no ⓘ]: corta na 1ª frase ("… ." ou "…:") de uma dica longa; curta fica inteira. */
export function splitHint(text: string): [string, string] {
  if (text.length <= HINT_MAX) return [text, ""];
  const m = /^(.+?[.:])\s+(\S[\s\S]*)$/.exec(text);
  if (!m || m[1].length > HINT_MAX + 30) return [text, ""]; // sem frase curta para mostrar: fica inteira
  return [m[1], m[2]];
}

/** Texto da dica de um campo: a 1ª frase à vista e o resto no ⓘ (o leitor de tela ouve tudo). */
export default function HintText({ children }: { children: ReactNode }) {
  if (typeof children !== "string") return <>{children}</>;
  const [shown, more] = splitHint(children);
  if (!more) return <>{children}</>;
  return (
    <>
      {shown}
      <span className="term-tip" aria-hidden data-tip={more} />
      <span className="sr-only"> {more}</span>
    </>
  );
}
