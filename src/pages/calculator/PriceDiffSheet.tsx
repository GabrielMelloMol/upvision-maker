import { Scale } from "lucide-react";
import { useState } from "react";
import type { CalcResult } from "../../domain/calc";
import { money } from "../../domain/format";
import { priceDifferences } from "../../domain/priceDiff";
import type { Settings } from "../../domain/settings";
import Sheet from "../../ui/Sheet";

type Props = { r: CalcResult; s: Settings; failurePct: number; watts: number };

/** Link no resumo → folha com as 4 escolhas de conta que mais afastam o preço do de outras calculadoras (#45). */
export default function PriceDiffLink(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="link" style={{ textAlign: "left" }} onClick={() => setOpen(true)}>
        <Scale aria-hidden size={14} /> Por que meu preço é diferente de outras calculadoras?
      </button>
      {open && <PriceDiffSheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function PriceDiffSheet({ r, s, failurePct, watts, onClose }: Props & { onClose: () => void }) {
  const diffs = priceDifferences(r, s, { failurePct, watts });
  const hasNumbers = r.unitCost > 0;
  return (
    <Sheet title="Por que meu preço é diferente?" icon={Scale} onClose={onClose} footer={<button type="button" className="primary" onClick={onClose}>Entendi</button>}>
      <p className="hint">
        Cada calculadora faz escolhas diferentes. Estas quatro são as que mais mudam o número.{hasNumbers ? " Os valores são por peça, com a conta que está na tela." : " Preencha a conta para ver os valores com os seus números."}
      </p>
      <ol className="diff-list">
        {diffs.map((d) => (
          <li key={d.id}>
            <h3>{d.title}</h3>
            <p>{d.text}</p>
            {hasNumbers && (d.ours > 0 || d.theirs > 0) && (
              <p className="diff-values">
                <span>
                  Aqui <b>{money(d.ours)}</b>
                </span>
                <span className="muted">
                  do outro jeito <b>{money(d.theirs)}</b>
                </span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
