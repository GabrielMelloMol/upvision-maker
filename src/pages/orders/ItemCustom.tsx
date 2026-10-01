import { useState } from "react";
import { customCopies } from "../../domain/orders";

/**
 * Personalização de um item do pedido/orçamento (#164): uma cópia por linha ("Ana", "Bia;Mãe"), no mesmo formato do
 * lote dos Modelos prontos. Colar a lista de nomes funciona direto. Mostra quantas cópias e oferece usar como quantidade.
 */
export default function ItemCustom({ value, qty, label, onChange, onQty }: { value: string; qty: string; label: string; onChange: (v: string) => void; onQty: (n: number) => void }) {
  const [open, setOpen] = useState(!!value.trim());
  const copies = customCopies(value);
  if (!open)
    return (
      <button type="button" className="link item-custom-open" onClick={() => setOpen(true)}>
        Personalizar (nomes, textos)
      </button>
    );
  const n = copies.length;
  const q = Math.round(Number(qty.replace(",", ".")));
  return (
    <div className="item-custom">
      <label>
        Personalização de {label || "item"}
        <textarea value={value} rows={3} maxLength={4000} onChange={(e) => onChange(e.target.value)} placeholder={"Uma cópia por linha, ex.:\nAna\nBia\nCaio\n(mais de um texto na mesma peça: separe com ;)"} />
      </label>
      {n > 0 && (
        <span className="hint">
          {n} {n === 1 ? "cópia" : "cópias"}: {copies.slice(0, 4).join(", ")}
          {n > 4 && "…"}
          {n !== q && (
            <>
              {" "}
              <button type="button" className="link" onClick={() => onQty(n)}>
                Usar {n} como quantidade
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}
