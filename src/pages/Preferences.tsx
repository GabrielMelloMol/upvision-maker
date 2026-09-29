import { Coins, Plus, Store } from "lucide-react";
import { useState } from "react";
import { getDb } from "../db";
import { loadSettings, materials, saveSettings } from "../db/repo";
import type { Db } from "../db/types";
import type { Material } from "../domain/entities";
import { markupText, PRICE_NAMES } from "../domain/pricing";
import { parseDecimal } from "../domain/format";
import type { Settings } from "../domain/settings";
import { fieldErrors } from "../ui/fieldErrors";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";
import AiSettingsCard from "./AiSettingsCard";
import BackupSettingsCard from "../backup/BackupSettingsCard";
import MoneyField from "../ui/MoneyField";
import SmartField from "../ui/SmartField";
import Field from "../ui/Field";
import { formatMoneyInput, parseMoney } from "../ui/parse";
import { addKwhHistory, type KwhEntry } from "../domain/energy";
import { money } from "../domain/format";
import KwhBillSheet from "./preferences/KwhBillSheet";

type NumKey = Exclude<keyof Settings, "channels" | "kwhHistory" | "includeFixedCosts" | "multiplyLabor" | "packagingMaterialId">;
type NumField = { key: NumKey; label: string; money?: true; hint?: string };
const FIELDS: NumField[] = [
  { key: "kwhPrice", label: "Preço do kWh", money: true, hint: "Valor total da conta ÷ kWh consumidos." },
  { key: "laborHourCost", label: "Sua hora de trabalho", money: true, hint: "Use 0 para não cobrar mão de obra." },
  { key: "maintenancePct", label: "Manutenção (%)", hint: "Só vale para impressora sem preço cadastrado; com preço, a calculadora usa a depreciação por hora." },
  { key: "multResale", label: "Multiplicador para lojista / revenda (×)" },
  { key: "multConsumer", label: "Multiplicador venda direta / consumidor final (×)" },
  { key: "marketplaceMarginPct", label: "Margem padrão em marketplace (%)" },
  { key: "minMarginPct", label: "Margem mínima (%)", hint: "A calculadora alerta canais abaixo disso." },
];
const EXTRA_FIELDS: NumField[] = [
  { key: "failurePct", label: "Taxa de falha (%)", hint: "De cada 100 impressões, quantas você perde? Esse custo entra no preço das que dão certo." },
  { key: "taxPct", label: "Impostos sobre a venda (%)", hint: "Simples Nacional: a alíquota da sua faixa. MEI: deixe 0 e lance o DAS em Custos operacionais." },
  { key: "productiveHoursMonth", label: "Horas de impressão por mês", hint: "Os custos operacionais mensais são divididos por essas horas." },
];
const ALL_FIELDS = [...FIELDS, ...EXTRA_FIELDS];

const loadPrefs = async (db: Db) => ({ settings: await loadSettings(db), materials: await materials.list(db) });

export default function Preferences() {
  const [data] = useData(loadPrefs, null as Awaited<ReturnType<typeof loadPrefs>> | null);
  return (
    <div className="page">
      <h1>Preferências</h1>
      <p className="lead">Custos da sua produção e taxas dos canais de venda. Tudo fica salvo só neste computador.</p>
      {data ? <PreferencesForm initial={data.settings} materials={data.materials} /> : <span className="skeleton" style={{ height: 180, borderRadius: 16, marginBottom: 16 }} />}
      <h2>Seus dados</h2>
      <BackupSettingsCard />
      <h2>Ferramentas</h2>
      <AiSettingsCard />
    </div>
  );
}

const str = (n: number) => String(n).replace(".", ",");

function PreferencesForm({ initial, materials }: { initial: Settings; materials: Material[] }) {
  const [flags, setFlags] = useState({ includeFixedCosts: initial.includeFixedCosts, multiplyLabor: initial.multiplyLabor });
  const [packaging, setPackaging] = useState(initial.packagingMaterialId ? String(initial.packagingMaterialId) : "");
  const [nums, setNums] = useState(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.money ? formatMoneyInput(String(initial[f.key])) : str(initial[f.key])])));
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
      ...Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.money ? parseMoney(nums[f.key]) : parseDecimal(nums[f.key])])),
      ...flags,
      packagingMaterialId: packaging ? Number(packaging) : null,
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

  const field = (f: NumField) => {
    const disabled = f.key === "productiveHoursMonth" && !flags.includeFixedCosts;
    const mult = f.key === "multResale" || f.key === "multConsumer" ? parseDecimal(nums[f.key]) : NaN;
    const who = f.key === "multResale" ? PRICE_NAMES.resale.help : PRICE_NAMES.consumer.help;
    const hint = mult > 0 ? `${who} ${markupText(mult)}.` : f.hint;
    if (f.key === "kwhPrice")
      return (
        <div key={f.key} className="stack" style={{ gap: 4 }}>
          <MoneyField label={f.label} hint={hint} value={nums[f.key]} error={errors[f.key]} onChange={(v) => setNums({ ...nums, [f.key]: v })} />
          <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setBillOpen(true)}>
            Calcular pela conta de luz
          </button>
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
