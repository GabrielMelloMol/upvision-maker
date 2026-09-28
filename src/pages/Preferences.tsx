import { Coins, Plus, Store } from "lucide-react";
import { useState } from "react";
import { getDb } from "../db";
import { loadSettings, saveSettings } from "../db/repo";
import { parseDecimal } from "../domain/format";
import type { Settings } from "../domain/settings";
import { fieldErrors } from "../ui/fieldErrors";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";
import AiSettingsCard from "./AiSettingsCard";
import MoneyField from "../ui/MoneyField";
import { formatMoneyInput, parseMoney } from "../ui/parse";
import { addKwhHistory, type KwhEntry } from "../domain/energy";
import { money } from "../domain/format";
import KwhBillSheet from "./preferences/KwhBillSheet";

type NumKey = Exclude<keyof Settings, "channels" | "kwhHistory">;
const FIELDS: { key: NumKey; label: string; money?: true; hint?: string }[] = [
  { key: "kwhPrice", label: "Preço do kWh", money: true, hint: "Valor total da conta ÷ kWh consumidos." },
  { key: "laborHourCost", label: "Sua hora de trabalho", money: true, hint: "Use 0 para não cobrar mão de obra." },
  { key: "maintenancePct", label: "Manutenção (%)" },
  { key: "multResale", label: "Multiplicador revenda (×)" },
  { key: "multConsumer", label: "Multiplicador consumidor final (×)" },
  { key: "marketplaceMarginPct", label: "Margem padrão em marketplace (%)" },
];

export default function Preferences() {
  const [settings] = useData(loadSettings, null as Settings | null);
  return (
    <div className="page">
      <h1>Preferências</h1>
      <p className="lead">Custos da sua produção e taxas dos canais de venda. Tudo fica salvo só neste computador.</p>
      {settings ? <PreferencesForm initial={settings} /> : <span className="skeleton" style={{ height: 180, borderRadius: 16, marginBottom: 16 }} />}
      <h2>Ferramentas</h2>
      <AiSettingsCard />
    </div>
  );
}

const str = (n: number) => String(n).replace(".", ",");

function PreferencesForm({ initial }: { initial: Settings }) {
  const [nums, setNums] = useState(Object.fromEntries(FIELDS.map((f) => [f.key, f.money ? formatMoneyInput(String(initial[f.key])) : str(initial[f.key])])));
  const [channels, setChannels] = useState(initial.channels.map((c) => ({ name: c.name, feePct: str(c.feePct), feeFixed: formatMoneyInput(String(c.feeFixed)) })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [billOpen, setBillOpen] = useState(false);
  const [kwhHistory, setKwhHistory] = useState(initial.kwhHistory);
  const toast = useToast();

  const setChannel = (i: number, k: keyof (typeof channels)[number], v: string) =>
    setChannels(channels.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = {
      ...Object.fromEntries(FIELDS.map((f) => [f.key, f.money ? parseMoney(nums[f.key]) : parseDecimal(nums[f.key])])),
      channels: channels.map((c) => ({ name: c.name, feePct: parseDecimal(c.feePct), feeFixed: parseMoney(c.feeFixed) })),
    } as Omit<Settings, "kwhHistory">;
    try {
      const db = await getDb();
      // relê o que está gravado para não apagar o que este formulário não edita (ex.: histórico do kWh)
      await saveSettings(db, { ...(await loadSettings(db)), ...s });
      setErrors({});
      toast("Preferências salvas.");
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  }

  async function applyBill(entry: KwhEntry) {
    try {
      const db = await getDb();
      const current = await loadSettings(db);
      const history = addKwhHistory(current.kwhHistory, entry);
      await saveSettings(db, { ...current, kwhPrice: entry.price, kwhHistory: history });
      setNums((n) => ({ ...n, kwhPrice: formatMoneyInput(String(entry.price)) }));
      setKwhHistory(history);
      setBillOpen(false);
      toast(`Preço do kWh atualizado: ${money(entry.price)}.`);
    } catch (err) {
      toast(`Não foi possível salvar: ${errorText(err)}`, "error");
    }
  }

  return (
    <>
    {/* fora do <form>: o envio do assistente não pode disparar o "Salvar preferências" */}
    {billOpen && <KwhBillSheet history={kwhHistory} onUse={applyBill} onClose={() => setBillOpen(false)} />}
    <form onSubmit={submit} noValidate>
      <div className="card">
        <h2 className="card-title">
          <Coins aria-hidden /> Custos e preço
        </h2>
        <div className="grid">
          {FIELDS.map((f) =>
            f.key === "kwhPrice" ? (
              <div key={f.key} className="stack" style={{ gap: 4 }}>
                <MoneyField label={f.label} hint={f.hint} value={nums[f.key]} error={errors[f.key]} onChange={(v) => setNums({ ...nums, [f.key]: v })} />
                <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setBillOpen(true)}>
                  Calcular pela conta de luz
                </button>
              </div>
            ) : f.money ? (
              <MoneyField key={f.key} label={f.label} hint={f.hint} value={nums[f.key]} error={errors[f.key]} onChange={(v) => setNums({ ...nums, [f.key]: v })} />
            ) : (
              <label key={f.key}>
                {f.label}
                <input inputMode="decimal" value={nums[f.key]} aria-invalid={!!errors[f.key]} onChange={(e) => setNums({ ...nums, [f.key]: e.target.value })} />
                {errors[f.key] && <span className="error">{errors[f.key]}</span>}
              </label>
            ),
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">
          <Store aria-hidden /> Canais de venda (taxas)
        </h2>
        <p className="hint" style={{ marginTop: -8, marginBottom: 16 }}>As taxas dos marketplaces mudam com frequência. Confira os valores atuais de cada canal.</p>
        {channels.map((c, i) => (
          <div className="row line" key={i}>
            <label>Canal<input value={c.name} onChange={(e) => setChannel(i, "name", e.target.value)} /></label>
            <label>Comissão (%)<input inputMode="decimal" value={c.feePct} onChange={(e) => setChannel(i, "feePct", e.target.value)} /></label>
            <MoneyField label="Taxa fixa por venda" value={c.feeFixed} onChange={(v) => setChannel(i, "feeFixed", v)} />
            <button type="button" className="link danger" onClick={() => setChannels(channels.filter((_, j) => j !== i))}>Remover</button>
          </div>
        ))}
        <button type="button" className="sm" onClick={() => setChannels([...channels, { name: "", feePct: "0", feeFixed: "0" }])}>
          <Plus aria-hidden /> Adicionar canal
        </button>
        {errors.channels && <p className="error">Confira os canais: nome obrigatório e comissão entre 0 e 100%.</p>}
      </div>
      {errors._ && <p className="error">{errors._}</p>}
      <button className="primary" type="submit">Salvar preferências</button>
    </form>
    </>
  );
}
