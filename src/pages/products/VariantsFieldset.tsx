import { Plus, Trash2 } from "lucide-react";
import { money } from "../../domain/format";
import type { Variant } from "../../domain/variants";
import MoneyField from "../../ui/MoneyField";

/** Linha do editor (texto enquanto digita); `to` = filamento da cor desta variação ("" = o da composição). */
export type VariantDraft = {
  name: string;
  sku: string;
  stock: string;
  price: string;
  to: string;
};

const str = (n: number) => String(n).replace(".", ",");
export const toDraft = (v: Variant, from: number | null): VariantDraft => ({
  name: v.name,
  sku: v.sku,
  stock: str(v.stock),
  price: v.price === null ? "" : str(v.price),
  to: String(v.swaps.find((s) => s.from === from)?.to ?? ""),
});

type Option = { id: number; label: string };
type Props = {
  label: string;
  onLabel: (v: string) => void;
  drafts: VariantDraft[];
  onDrafts: (d: VariantDraft[]) => void;
  /** Filamentos da composição (qual deles muda de cor) e todos os cadastrados (a cor de cada variação). */
  compositionFilaments: Option[];
  filaments: Option[];
  swapFrom: string;
  onSwapFrom: (id: string) => void;
  /** Custo e preço calculados de cada linha (mesma ordem de `drafts`). */
  priced: ({ unitCost: number; price: number } | null)[];
  warning: string | null;
};

/** Variações do produto (#82): 1 nível (ex.: Cor), cada opção com SKU, estoque pronto, preço e o filamento da cor. */
export default function VariantsFieldset(p: Props) {
  const update = (i: number, patch: Partial<VariantDraft>) =>
    p.onDrafts(p.drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const add = () =>
    p.onDrafts([
      ...p.drafts,
      { name: "", sku: "", stock: "0", price: "", to: "" },
    ]);
  return (
    <fieldset className="variants">
      <legend>Variações</legend>
      <p className="hint">
        Para vender o mesmo produto em cores diferentes: cada variação tem SKU e
        estoque próprios e vira uma linha na planilha da Shopee/Mercado Livre.
      </p>
      <div className="grid">
        <label>
          Tipo de variação
          <input
            value={p.label}
            maxLength={20}
            onChange={(e) => p.onLabel(e.target.value)}
            placeholder="Cor"
          />
        </label>
        {p.compositionFilaments.length > 0 && (
          <label>
            Filamento que muda de cor
            <select
              value={p.swapFrom}
              onChange={(e) => p.onSwapFrom(e.target.value)}
            >
              {p.compositionFilaments.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {p.drafts.length > 0 && (
        <ul className="variant-list" aria-label="Variações">
          {p.drafts.map((d, i) => {
            const sr = <span className="sr-only"> da variação {i + 1}</span>;
            return (
              <li className="variant-card" key={i}>
                <div className="variant-head">
                  <label>
                    {p.label || "Cor"}
                    <input
                      aria-label={`Variação ${i + 1}`}
                      value={d.name}
                      maxLength={40}
                      placeholder="Ex.: Azul"
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost icon-only danger"
                    aria-label={`Excluir variação ${d.name || i + 1}`}
                    onClick={() =>
                      p.onDrafts(p.drafts.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                </div>
                <div className="variant-fields">
                  <label className="variant-fil">
                    <span>Filamento{sr}</span>
                    <select
                      value={d.to}
                      onChange={(e) => update(i, { to: e.target.value })}
                      disabled={!p.compositionFilaments.length}
                    >
                      <option value="">O da composição</option>
                      {p.filaments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>SKU{sr}</span>
                    <input
                      value={d.sku}
                      maxLength={60}
                      onChange={(e) => update(i, { sku: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Estoque{sr}</span>
                    <input
                      inputMode="decimal"
                      value={d.stock}
                      onChange={(e) => update(i, { stock: e.target.value })}
                    />
                  </label>
                  <MoneyField
                    label={<span>Preço{sr}</span>}
                    value={d.price}
                    placeholder={
                      p.priced[i]
                        ? str(Math.round(p.priced[i]!.price * 100) / 100)
                        : ""
                    }
                    onChange={(v) => update(i, { price: v })}
                  />
                  <p className="variant-cost muted">
                    Custo{" "}
                    <b className="num">
                      {p.priced[i] ? money(p.priced[i]!.unitCost) : "—"}
                    </b>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {p.warning && <p className="hint variant-warn">{p.warning}</p>}
      <button type="button" className="sm" onClick={add}>
        <Plus aria-hidden size={16} /> Adicionar variação
      </button>
      {p.drafts.length > 0 && (
        <p className="hint">
          Preço vazio = o do produto com o custo da cor. Com variações, o
          estoque pronto do produto é a soma delas.
        </p>
      )}
    </fieldset>
  );
}
