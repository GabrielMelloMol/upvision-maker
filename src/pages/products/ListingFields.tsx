import { parseDecimal } from "../../domain/format";
import { ORIGINS } from "../../domain/marketplace/columns";
import type { ProductInput } from "../../domain/products";

/** Campos de anúncio e fiscal como texto do formulário (#78). */
export type ListingForm = { description: string; ncm: string; origin: ProductInput["origin"]; unit: string; weightG: string; boxL: string; boxW: string; boxH: string };

const str = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const opt = (s: string) => (s.trim() === "" ? null : parseDecimal(s));

export const toListingForm = (p: Pick<ProductInput, keyof ListingForm>): ListingForm => ({
  description: p.description,
  ncm: p.ncm,
  origin: p.origin,
  unit: p.unit,
  weightG: str(p.weightG),
  boxL: str(p.boxL),
  boxW: str(p.boxW),
  boxH: str(p.boxH),
});

export const fromListingForm = (f: ListingForm) => ({
  description: f.description,
  ncm: f.ncm.replace(/\D/g, ""),
  origin: f.origin,
  unit: f.unit.trim().toUpperCase() || "UN",
  weightG: opt(f.weightG),
  boxL: opt(f.boxL),
  boxW: opt(f.boxW),
  boxH: opt(f.boxH),
});

type Props = { value: ListingForm; onChange: (v: ListingForm) => void; errors: Record<string, string>; estimatedG: number };

/** "Anúncio e fiscal (opcional)": o que a planilha de upload em massa dos marketplaces pede além do preço. */
export default function ListingFields({ value: v, onChange, errors, estimatedG }: Props) {
  const set = (k: keyof ListingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...v, [k]: e.target.value });
  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;
  return (
    <details>
      <summary>Anúncio e fiscal (opcional)</summary>
      <p className="hint">Vai para a planilha de upload em massa da Shopee e do Mercado Livre.</p>
      <label>
        Descrição do anúncio
        <textarea value={v.description} maxLength={3000} rows={3} onChange={set("description")} placeholder="Material, tamanho, cores, cuidados…" />
        {err("description")}
      </label>
      <div className="grid">
        <label>
          Peso embalado (g)
          <input inputMode="decimal" value={v.weightG} placeholder={`${Math.round(estimatedG)} g de filamento + embalagem`} aria-invalid={!!errors.weightG} onChange={set("weightG")} />
          {err("weightG") || <span className="hint">Vazio = filamento + embalagem padrão da exportação.</span>}
        </label>
        <label>
          Caixa: comprimento (cm)
          <input inputMode="decimal" value={v.boxL} placeholder="padrão" onChange={set("boxL")} />
        </label>
        <label>
          Caixa: largura (cm)
          <input inputMode="decimal" value={v.boxW} placeholder="padrão" onChange={set("boxW")} />
        </label>
        <label>
          Caixa: altura (cm)
          <input inputMode="decimal" value={v.boxH} placeholder="padrão" onChange={set("boxH")} />
        </label>
        <label>
          NCM
          <input inputMode="numeric" value={v.ncm} maxLength={10} placeholder="8 números" aria-invalid={!!errors.ncm} onChange={set("ncm")} />
          {err("ncm") || <span className="hint">Confira com seu contador.</span>}
        </label>
        <label>
          Origem
          <select value={v.origin} onChange={set("origin")}>
            {ORIGINS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidade
          <input value={v.unit} maxLength={6} onChange={set("unit")} />
        </label>
      </div>
    </details>
  );
}
