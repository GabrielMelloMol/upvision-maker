import { Coins } from "lucide-react";
import { useState } from "react";
import { getDb } from "../db";
import { loadSettings, materials, saveSettings } from "../db/repo";
import type { Db } from "../db/types";
import { MATERIAL_TYPES, type Material } from "../domain/entities";
import { markupText, PRICE_NAMES } from "../domain/pricing";
import { parseDecimal } from "../domain/format";
import type { Settings } from "../domain/settings";
import { fieldErrors } from "../ui/fieldErrors";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";
import AiSettingsCard from "./AiSettingsCard";
import AmsCard from "./preferences/AmsCard";
import BackupSettingsCard from "../backup/BackupSettingsCard";
import PhoneSettingsCard from "../phone/PhoneSettingsCard";
import MoneyField from "../ui/MoneyField";
import SmartField from "../ui/SmartField";
import Field from "../ui/Field";
import { formatMoneyInput, parseMoney } from "../ui/parse";
import { addKwhHistory, type KwhEntry } from "../domain/energy";
import { money } from "../domain/format";
import KwhBillSheet from "./preferences/KwhBillSheet";
import StateKwhSelect from "../ui/StateKwhSelect";
import ChannelsCard, { fromChannelForm, toChannelForm } from "./preferences/ChannelsCard";

type NumKey = Exclude<keyof Settings, "channels" | "kwhHistory" | "includeFixedCosts" | "multiplyLabor" | "packagingMaterialId" | "failureByMaterial" | "ams">;
type NumField = { key: NumKey; label: string; money?: true; hint?: string };
const FIELDS: NumField[] = [
  { key: "kwhPrice", label: "Preço do kWh", money: true, hint: "Valor total da conta ÷ kWh consumidos." },
  { key: "laborHourCost", label: "Sua hora de trabalho", money: true, hint: "Use 0 para não cobrar mão de obra." },
  { key: "maintenancePct", label: "Manutenção (%)", hint: "Só vale para impressora sem preço cadastrado; com preço, a calculadora usa a depreciação por hora." },
  { key: "multResale", label: "Multiplicador para lojista / revenda (×)" },
  { key: "multConsumer", label: "Multiplicador venda direta / consumidor final (×)" },
  { key: "marketplaceMarginPct", label: "Margem padrão em marketplace (%)" },
  { key: "minMarginPct", label: "Margem mínima (%)", hint: "A calculadora alerta canais abaixo disso." },
  { key: "targetProfitPerHour", label: "Meta de lucro por hora de máquina", money: true, hint: "Use 0 para desligar. A calculadora mostra o lucro por hora de cada canal e o preço que chega na meta." },
];
const EXTRA_FIELDS: NumField[] = [
  { key: "failurePct", label: "Taxa de falha (%)", hint: "De cada 100 impressões, quantas você perde? Esse custo entra no preço das que dão certo." },
  { key: "taxPct", label: "Impostos sobre a venda (%)", hint: "Simples Nacional: a alíquota da sua faixa. MEI: deixe 0 e lance o DAS em Custos operacionais." },
  { key: "productiveHoursMonth", label: "Horas de impressão por mês", hint: "Os custos operacionais mensais são divididos por essas horas." },
];
const ALL_FIELDS = [...FIELDS, ...EXTRA_FIELDS];
const HOURS_MONTH = 8 * 30; // exemplo da dica da meta: 8 h por dia

const loadPrefs = async (db: Db) => ({ settings: await loadSettings(db), materials: await materials.list(db) });

export default function Preferences() {
  const [data] = useData(loadPrefs, null as Awaited<ReturnType<typeof loadPrefs>> | null);
  return (
    <div className="page">
      <h1>Preferências</h1>
      <p className="lead">Custos da produção e taxas dos canais.</p>
      {data ? <PreferencesForm initial={data.settings} materials={data.materials} /> : <span className="skeleton" style={{ height: 180, borderRadius: 16, marginBottom: 16 }} />}
      <h2>Seus dados</h2>
      <BackupSettingsCard />
      <PhoneSettingsCard />
      <h2>Ferramentas</h2>
      <AiSettingsCard />
      <AmsCard />
    </div>
  );
}

const str = (n: number) => String(n).replace(".", ",");

function PreferencesForm({ initial, materials }: { initial: Settings; materials: Material[] }) {
  const [byMaterial, setByMaterial] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial.failureByMaterial).map(([k, v]) => [k, str(v)])));
  const [flags, setFlags] = useState({ includeFixedCosts: initial.includeFixedCosts, multiplyLabor: initial.multiplyLabor });
  const [packaging, setPackaging] = useState(initial.packagingMaterialId ? String(initial.packagingMaterialId) : "");
  const [nums, setNums] = useState(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.money ? formatMoneyInput(String(initial[f.key])) : str(initial[f.key])])));
  const [channels, setChannels] = useState(initial.channels.map(toChannelForm));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [billOpen, setBillOpen] = useState(false);
  const [kwhHistory, setKwhHistory] = useState(initial.kwhHistory);
  const toast = useToast();


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = {
      ...Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.money ? parseMoney(nums[f.key]) : parseDecimal(nums[f.key])])),
      ...flags,
      packagingMaterialId: packaging ? Number(packaging) : null,
      failureByMaterial: Object.fromEntries(Object.entries(byMaterial).flatMap(([k, v]) => (v.trim() === "" ? [] : [[k, parseDecimal(v)]]))), // vazio = a geral
      channels: channels.map(fromChannelForm),
    } as Omit<Settings, "kwhHistory" | "ams">;
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

  const field = (f: NumField) => {
    const disabled = f.key === "productiveHoursMonth" && !flags.includeFixedCosts;
    const mult = f.key === "multResale" || f.key === "multConsumer" ? parseDecimal(nums[f.key]) : NaN;
    const who = f.key === "multResale" ? PRICE_NAMES.resale.help : PRICE_NAMES.consumer.help;
    const meta = f.key === "targetProfitPerHour" ? parseMoney(nums[f.key]) : NaN;
    const hint = mult > 0 ? `${who} ${markupText(mult)}.` : meta > 0 ? `Com a impressora ocupada 8 h por dia, ${money(meta)}/h ≈ ${money(meta * HOURS_MONTH)} por mês.` : f.hint;
    if (f.key === "kwhPrice")
      return (
        <div key={f.key} className="stack" style={{ gap: 4 }}>
          <MoneyField label={f.label} hint={hint} value={nums[f.key]} error={errors[f.key]} onChange={(v) => setNums({ ...nums, [f.key]: v })} />
          <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setBillOpen(true)}>
            Calcular pela conta de luz
          </button>
          <StateKwhSelect onPick={(v) => setNums((n) => ({ ...n, kwhPrice: v }))} />
        </div>
      );
    if (f.money) return <MoneyField key={f.key} label={f.label} hint={hint} value={nums[f.key]} error={errors[f.key]} onChange={(v) => setNums({ ...nums, [f.key]: v })} />;
    return (
      <SmartField key={f.key} label={f.label} hint={hint} inputMode="decimal" parse={parseDecimal} invalidText="Digite um número." value={nums[f.key]} disabled={disabled} error={errors[f.key]} onChange={(v) => setNums({ ...nums, [f.key]: v })} />
    );
  };

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
          {FIELDS.map((f) => field(f))}
        </div>
        <h3 style={{ margin: "var(--space-5) 0 var(--space-3)" }}>Falhas, impostos e custos fixos</h3>
        <div className="grid">
          {EXTRA_FIELDS.slice(0, 2).map((f) => field(f))}
          <Field label="Embalagem padrão" hint="A calculadora já abre com ela nos materiais extras (dá para remover).">
            <select value={packaging} onChange={(e) => setPackaging(e.target.value)}>
              <option value="">Nenhuma</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <details style={{ marginTop: "var(--space-3)" }}>
          <summary>Taxa de falha por material{Object.values(byMaterial).some((v) => v.trim()) ? " (em uso)" : ""}</summary>
          <p className="hint">TPU, ABS e peças difíceis falham mais que PLA. Vazio = a taxa geral. Na calculadora vale a maior entre os filamentos da mesa.</p>
          <div className="grid">
            {MATERIAL_TYPES.map((m) => (
              <label key={m}>
                Falha {m} (%)
                <input inputMode="decimal" value={byMaterial[m] ?? ""} placeholder={nums.failurePct} onChange={(e) => setByMaterial({ ...byMaterial, [m]: e.target.value })} />
              </label>
            ))}
          </div>
        </details>
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <label className="check">
            <input type="checkbox" checked={flags.includeFixedCosts} onChange={(e) => setFlags({ ...flags, includeFixedCosts: e.target.checked })} /> Incluir custos fixos no preço
          </label>
          <div className="grid">{field(EXTRA_FIELDS[2])}</div>
          <label className="check">
            <input type="checkbox" checked={flags.multiplyLabor} onChange={(e) => setFlags({ ...flags, multiplyLabor: e.target.checked })} /> Multiplicar também a mão de obra (jeito antigo)
          </label>
          <span className="hint">
            Desde a v0.6 a mão de obra e os custos fixos são somados depois do multiplicador: com ×5, uma hora de R$ 30 virava R$ 150 no preço.
          </span>
        </div>
      </div>

      <ChannelsCard channels={channels} setChannels={setChannels} error={errors.channels} />
      {errors._ && <p className="error">{errors._}</p>}
      <button className="primary" type="submit">Salvar preferências</button>
    </form>
    </>
  );
}
