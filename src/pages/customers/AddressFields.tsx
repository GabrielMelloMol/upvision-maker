import { Search } from "lucide-react";
import { useState } from "react";
import { lookupCep } from "../../domain/cep";
import Button from "../../ui/Button";
import { errorText } from "../../ui/Toast";

export type AddressValue = { cep: string; street: string; number: string; complement: string; district: string; city: string; uf: string };

/** Endereço com busca por CEP (ViaCEP). Se não houver internet, tudo continua editável à mão. */
export default function AddressFields<T extends AddressValue>({ value, onChange }: { value: T; onChange: (v: T) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof AddressValue) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });

  async function search(cep = value.cep) {
    setBusy(true);
    setMsg(null);
    try {
      const a = await lookupCep(cep);
      onChange({ ...value, cep, ...a });
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <div className="cep-field">
        <label>
          CEP
          <input
            inputMode="numeric"
            value={value.cep}
            maxLength={9}
            onChange={(e) => {
              set("cep")(e);
              if (e.target.value.replace(/\D/g, "").length === 8) search(e.target.value);
            }}
          />
          {msg ? <span className="error">{msg}</span> : busy && <span className="hint">Buscando…</span>}
        </label>
        <Button variant="ghost" size="sm" icon={Search} disabled={busy} onClick={() => search()} aria-label="Buscar endereço pelo CEP" />
      </div>
      <label>Rua<input value={value.street} maxLength={120} onChange={set("street")} /></label>
      <label>Número<input value={value.number} maxLength={20} onChange={set("number")} /></label>
      <label>Complemento<input value={value.complement} maxLength={60} onChange={set("complement")} /></label>
      <label>Bairro<input value={value.district} maxLength={80} onChange={set("district")} /></label>
      <label>Cidade<input value={value.city} maxLength={80} onChange={set("city")} /></label>
      <label>UF<input value={value.uf} maxLength={2} onChange={(e) => onChange({ ...value, uf: e.target.value.toUpperCase() })} /></label>
    </div>
  );
}
