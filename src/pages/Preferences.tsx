import { useState } from "react";
import { getDb } from "../db";
import { loadSettings, saveSettings } from "../db/repo";
import { parseDecimal } from "../domain/format";
import type { Settings } from "../domain/settings";
import { fieldErrors } from "../ui/fieldErrors";
import { useToast } from "../ui/Toast";
import { useData } from "../ui/useData";

type NumKey = Exclude<keyof Settings, "channels">;
const FIELDS: { key: NumKey; label: string }[] = [
  { key: "kwhPrice", label: "Preço do kWh (R$)" },
  { key: "laborHourCost", label: "Mão de obra (R$/hora)" },
  { key: "maintenancePct", label: "Manutenção (%)" },
  { key: "multResale", label: "Multiplicador revenda (×)" },
  { key: "multConsumer", label: "Multiplicador consumidor final (×)" },
  { key: "marketplaceMarginPct", label: "Margem padrão em marketplace (%)" },
];

export default function Preferences() {
  const [settings] = useData(loadSettings, null as Settings | null);
  return settings ? <PreferencesForm initial={settings} /> : null;
}

const str = (n: number) => String(n).replace(".", ",");

function PreferencesForm({ initial }: { initial: Settings }) {
  const [nums, setNums] = useState(Object.fromEntries(FIELDS.map((f) => [f.key, str(initial[f.key])])));
  const [channels, setChannels] = useState(initial.channels.map((c) => ({ name: c.name, feePct: str(c.feePct), feeFixed: str(c.feeFixed) })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  const setChannel = (i: number, k: keyof (typeof channels)[number], v: string) =>
    setChannels(channels.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = {
      ...Object.fromEntries(FIELDS.map((f) => [f.key, parseDecimal(nums[f.key])])),
      channels: channels.map((c) => ({ name: c.name, feePct: parseDecimal(c.feePct), feeFixed: parseDecimal(c.feeFixed) })),
    } as Settings;
    try {
      await saveSettings(await getDb(), s);
      setErrors({});
      toast("Preferências salvas.");
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1>Preferências</h1>
      <div className="card">
        <div className="grid">
          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input inputMode="decimal" value={nums[f.key]} aria-invalid={!!errors[f.key]} onChange={(e) => setNums({ ...nums, [f.key]: e.target.value })} />
              {errors[f.key] && <span className="error">{errors[f.key]}</span>}
            </label>
          ))}
        </div>
      </div>

      <h2>Canais de venda (taxas)</h2>
      <p className="muted">As taxas dos marketplaces mudam com frequência. Confira os valores atuais de cada canal.</p>
      <div className="card">
        {channels.map((c, i) => (
          <div className="row" key={i} style={{ marginBottom: 8 }}>
            <label>Canal<input value={c.name} onChange={(e) => setChannel(i, "name", e.target.value)} /></label>
            <label>Comissão (%)<input inputMode="decimal" value={c.feePct} onChange={(e) => setChannel(i, "feePct", e.target.value)} /></label>
            <label>Taxa fixa por venda (R$)<input inputMode="decimal" value={c.feeFixed} onChange={(e) => setChannel(i, "feeFixed", e.target.value)} /></label>
            <button type="button" className="link danger" onClick={() => setChannels(channels.filter((_, j) => j !== i))}>Remover</button>
          </div>
        ))}
        <button type="button" onClick={() => setChannels([...channels, { name: "", feePct: "0", feeFixed: "0" }])}>Adicionar canal</button>
        {errors.channels && <p className="error">Confira os canais: nome obrigatório e comissão entre 0 e 100%.</p>}
      </div>
      {errors._ && <p className="error">{errors._}</p>}
      <button className="primary" type="submit">Salvar preferências</button>
    </form>
  );
}
