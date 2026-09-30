import { Cylinder, Printer, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { getDb } from "../db";
import { filaments, loadSettings, printers, saveSettings } from "../db/repo";
import { PRINTER_CATALOG_ITEMS, printerFromCatalog } from "../domain/catalog/printers";
import { MATERIAL_TYPES } from "../domain/entities";
import { parseDecimal } from "../domain/format";
import CatalogSheet from "../ui/CatalogSheet";
import ColorDots from "../ui/ColorDots";
import Field from "../ui/Field";
import MassField from "../ui/MassField";
import MoneyField from "../ui/MoneyField";
import { parseMass, parseMoney } from "../ui/parse";
import { fieldErrors } from "../ui/fieldErrors";
import Sheet from "../ui/Sheet";
import StateKwhSelect from "../ui/StateKwhSelect";
import { useToast } from "../ui/Toast";

export { useFirstRun } from "./firstRun";

type Kind = "money" | "mass" | "color" | "text" | "number" | "select";
type Step = { icon: LucideIcon; title: string; text: string; fields: { key: string; label: string; kind: Kind; hint?: string; options?: readonly string[] }[] };

const STEPS: Step[] = [
  {
    icon: Zap,
    title: "Seus custos",
    text: "Com isso a calculadora já inclui energia e mão de obra no preço. Dá para mudar depois em Preferências.",
    fields: [
      { key: "kwhPrice", label: "Preço do kWh", kind: "money", hint: "Na conta de luz: valor total ÷ kWh." },
      { key: "laborHourCost", label: "Sua hora de trabalho", kind: "money", hint: "Use 0 se não quiser cobrar mão de obra." },
    ],
  },
  {
    icon: Printer,
    title: "Sua impressora",
    text: "A potência média entra no custo de energia de cada impressão.",
    fields: [
      { key: "name", label: "Nome", kind: "text", hint: "Ex.: Bambu Lab A1" },
      { key: "watts", label: "Potência média (W)", kind: "number", hint: "Média imprimindo PLA. Não sabe? Escolha do catálogo." },
    ],
  },
  {
    icon: Cylinder,
    title: "Seu primeiro filamento",
    text: "O estoque avisa quando estiver acabando e o preço entra na calculadora.",
    fields: [
      { key: "material", label: "Material", kind: "select", options: MATERIAL_TYPES },
      { key: "color", label: "Cor", kind: "color" },
      { key: "pricePerKg", label: "Preço por kg", kind: "money" },
      { key: "stockG", label: "Quanto tem em estoque", kind: "mass" },
    ],
  },
];

const DEFAULTS: Record<string, string> = { kwhPrice: "0,90", laborHourCost: "0", name: "", watts: "", material: "PLA", color: "", pricePerKg: "", stockG: "1 rolo" };

async function saveStep(step: number, v: Record<string, string>) {
  const db = await getDb();
  const n = (k: string) => parseDecimal(v[k] ?? "");
  const m = (k: string) => parseMoney(v[k] ?? "");
  if (step === 0) return saveSettings(db, { ...(await loadSettings(db)), kwhPrice: m("kwhPrice"), laborHourCost: m("laborHourCost") });
  if (step === 1) return printers.insert(db, { name: v.name, watts: n("watts") });
  return filaments.insert(db, { material: v.material, color: v.color, brand: "", pricePerKg: m("pricePerKg"), spoolG: 1000, stockG: parseMass(v.stockG ?? "", 1000), minG: 200 });
}

/** Apresentação de primeiro uso em 3 passos; cada passo pode ser pulado. */
export default function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(DEFAULTS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [catalogOpen, setCatalogOpen] = useState(false);
  const toast = useToast();
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  function next() {
    setErrors({});
    if (last) {
      toast("Tudo pronto! Bom trabalho com as peças.");
      onClose();
    } else setStep(step + 1);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await saveStep(step, values);
      next();
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  }

  return (
    <Sheet
      title="Boas-vindas ao UpVision Maker"
      icon={Sparkles}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose} style={{ marginRight: "auto" }}>
            Agora não
          </button>
          <button type="button" onClick={next}>
            Pular
          </button>
          <button type="submit" className="primary">
            {last ? "Concluir" : "Continuar"}
          </button>
        </>
      }
    >
      <div className="steps" aria-label={`Passo ${step + 1} de ${STEPS.length}`}>
        {STEPS.map((_, i) => (
          <i key={i} className={i <= step ? "done" : ""} />
        ))}
      </div>
      <div className="step-body" key={step}>
        <div className="row" style={{ alignItems: "center", gap: 14 }}>
          <div className="step-art" aria-hidden>
            <s.icon />
          </div>
          <div>
            <p className="muted small" style={{ margin: 0 }}>
              Passo {step + 1} de {STEPS.length}
            </p>
            <h3 style={{ fontSize: "var(--title-2)", margin: 0 }}>{s.title}</h3>
          </div>
        </div>
        <p className="muted">{s.text}</p>
        <div className="grid two">
          {s.fields.map((f, i) => {
            const common = { label: f.label, hint: f.hint, error: errors[f.key], value: values[f.key], onChange: (v: string) => setValues({ ...values, [f.key]: v }) };
            const auto = i === 0 ? { "data-autofocus": "" } : {};
            if (f.key === "kwhPrice")
              return (
                <div key={f.key} className="stack" style={{ gap: 6 }}>
                  <MoneyField {...common} {...auto} />
                  <StateKwhSelect onPick={(v) => setValues((cur) => ({ ...cur, kwhPrice: v }))} />
                </div>
              );
            if (f.kind === "money") return <MoneyField key={f.key} {...common} {...auto} />;
            if (f.kind === "mass") return <MassField key={f.key} {...common} />;
            if (f.kind === "color")
              return (
                <div key={f.key} className="span-all">
                  <ColorDots label={f.label} value={common.value} onChange={common.onChange} error={common.error} />
                </div>
              );
            return (
            <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]}>
              {f.options ? (
                <select value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[f.key]}
                  inputMode={f.key === "name" || f.key === "color" ? "text" : "decimal"}
                  aria-invalid={!!errors[f.key]}
                  data-autofocus={i === 0 ? "" : undefined}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </Field>
            );
          })}
        </div>
        {step === 1 && (
          <button type="button" className="link" onClick={() => setCatalogOpen(true)}>
            Escolher do catálogo
          </button>
        )}
        {errors._ && <p className="error">{errors._}</p>}
      </div>
      {catalogOpen && (
        <CatalogSheet
          title="Catálogo de impressoras"
          icon={Printer}
          items={PRINTER_CATALOG_ITEMS}
          onPick={(id) => {
            setValues((v) => ({ ...v, ...printerFromCatalog(id) }));
            setCatalogOpen(false);
            toast("Preenchido com o catálogo — confira os valores.");
          }}
          onManual={() => setCatalogOpen(false)}
          onClose={() => setCatalogOpen(false)}
        />
      )}
    </Sheet>
  );
}
