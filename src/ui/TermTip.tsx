import { termFor, type Term } from "../help/glossary";

/**
 * "ⓘ" ao lado do rótulo de um campo técnico (#84), com a explicação num balão ao passar o mouse.
 * Fica fora da árvore de acessibilidade para não entrar no nome do campo; quem usa leitor de tela ouve o mesmo
 * texto pela descrição do campo (`TermDesc` + aria-describedby).
 */
export function TermTip({ term }: { term: Term }) {
  return <span className="term-tip" aria-hidden data-tip={term.text} />;
}

export const TermDesc = ({ id, term }: { id: string; term: Term }) => (
  <span id={id} className="sr-only">
    {term.term}: {term.text}
  </span>
);

/** Termo do glossário para o rótulo, se for texto. */
export const labelTerm = (label: unknown) => (typeof label === "string" ? termFor(label) : null);
