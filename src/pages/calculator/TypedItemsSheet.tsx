import { PackagePlus } from "lucide-react";
import { money } from "../../domain/format";
import Sheet from "../../ui/Sheet";
import type { Typed } from "./productDraft";

type Props = { typed: Typed; onRegister: () => void; onSkip: () => void; onClose: () => void };

const g = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * "Salvar como produto" com itens digitados à mão (C1): o produto só guarda o custo com itens cadastrados. Mostra o
 * que vai virar cadastro (sem estoque) antes de salvar; "Salvar sem eles" mantém o comportamento antigo, avisado.
 */
export default function TypedItemsSheet({ typed, onRegister, onSkip, onClose }: Props) {
  return (
    <Sheet
      title="Cadastrar o que você digitou?"
      icon={PackagePlus}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onSkip}>
            Salvar sem eles
          </button>
          <button type="button" className="primary" data-autofocus onClick={onRegister}>
            Cadastrar e salvar
          </button>
        </>
      }
    >
      <p>Para o produto guardar o custo que você calculou, estes itens precisam estar cadastrados:</p>
      <ul className="stack" aria-label="Itens que serão cadastrados">
        {typed.filaments.map((f, i) => (
          <li key={`f${i}`}>
            Filamento de {money(f.pricePerKg)}/kg ({g(f.grams)} g nesta peça)
          </li>
        ))}
        {typed.materials.map((m, i) => (
          <li key={`m${i}`}>
            Material extra de {money(m.unitPrice)} (× {g(m.qty)})
          </li>
        ))}
        {typed.watts !== null && <li>Impressora de {g(typed.watts)} W</li>}
      </ul>
      <p className="hint">Entram sem estoque. Depois, em Estoque, dá para dar nome, cor e repor.</p>
    </Sheet>
  );
}
