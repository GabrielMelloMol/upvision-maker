import { Fragment } from "react";
import { openWith } from "../tools/intent";
import { requestNavigate } from "./navigate";

export type SeeAlsoItem = { label: string; /** tela da ferramenta */ page?: string; /** ou um Modelo pronto */ model?: string };

/** "Veja também" (onde fica): atalhos entre ferramentas parecidas, para quem chegou na que não era a certa. */
export default function SeeAlso({ items }: { items: SeeAlsoItem[] }) {
  const go = (it: SeeAlsoItem) => {
    if (it.model) openWith("models", { id: it.model });
    requestNavigate(it.page ?? "models");
  };
  return (
    <p className="see-also">
      Veja também:{" "}
      {items.map((it, i) => (
        <Fragment key={it.label}>
          <button type="button" className="link" onClick={() => go(it)}>
            {it.label}
          </button>
          {i < items.length - 1 ? ", " : "."}
        </Fragment>
      ))}
    </p>
  );
}
