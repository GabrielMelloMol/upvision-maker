import { Plus } from "lucide-react";
import { parseDecimal } from "../../domain/format";
import MoneyField from "../../ui/MoneyField";
import SmartField from "../../ui/SmartField";
import { formatMoneyInput } from "../../ui/parse";
import type { Line } from "./saved";

export type Option = { id: number; label: string; price: number };
export const newLine = (): Line => ({ ref: "", price: "", qty: "" });

/** Erro do campo de quantidade (A5: "1.200,5" e lixo não viram 0 em silêncio). */
export const qtyInvalid = (label: string) => (label === "Gramas" ? "Digite as gramas, ex.: 1.200 ou 12,5." : "Digite a quantidade, ex.: 2 ou 1,5.");

/** `single`: só a linha, sem adicionar/remover (modo rápido). */
export default function Lines(props: { lines: Line[]; setLines: (l: Line[]) => void; options: Option[]; priceLabel: string; qtyLabel: string; addLabel: string; single?: boolean }) {
  const { lines, setLines, options } = props;
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, ref: string) => {
    const o = options.find((x) => String(x.id) === ref);
    update(i, { ref, price: o ? formatMoneyInput(String(o.price)) : lines[i].price });
  };
  return (
    <>
      {lines.map((l, i) => (
        <div className="row line" key={i}>
          <label>
            Cadastrado
            <select value={l.ref} onChange={(e) => pick(i, e.target.value)}>
              <option value="">Digitar preço</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <MoneyField label={props.priceLabel} value={l.price} onChange={(v) => update(i, { price: v, ref: "" })} />
          <SmartField label={props.qtyLabel} inputMode="decimal" parse={parseDecimal} invalidText={qtyInvalid(props.qtyLabel)} value={l.qty} onChange={(v) => update(i, { qty: v })} />
          {!props.single && <button className="link danger" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remover</button>}
        </div>
      ))}
      {!props.single && (
        <button className="sm" onClick={() => setLines([...lines, newLine()])}>
          <Plus aria-hidden /> {props.addLabel}
        </button>
      )}
    </>
  );
}

