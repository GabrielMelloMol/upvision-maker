import { Cylinder, Printer, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getDb } from "../db";
import { filaments, getSecret, loadSettings, printers, saveSettings, setSecret } from "../db/repo";
import { MATERIAL_TYPES } from "../domain/entities";
import { parseDecimal } from "../domain/format";
import Field from "../ui/Field";
import { fieldErrors } from "../ui/fieldErrors";
import Sheet from "../ui/Sheet";
import { useToast } from "../ui/Toast";

const DONE_KEY = "onboarding_done";

/** true na primeira abertura (sem impressora nem filamento e sem ter visto a apresentação). */
export function useFirstRun(): [boolean, () => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    (async () => {
      const db = await getDb();
      if (await getSecret(db, DONE_KEY)) return;
      const empty = (await printers.list(db)).length === 0 && (await filaments.list(db)).length === 0;
      if (empty) setShow(true);
      else await setSecret(db, DONE_KEY, "1"); // quem já usava o app não precisa da apresentação
    })().catch((e) => console.warn("Não foi possível verificar o primeiro uso:", e));
  }, []);
  const close = () => {
    setShow(false);
    getDb()
      .then((db) => setSecret(db, DONE_KEY, "1"))
      .catch((e) => console.warn("Não foi possível registrar a apresentação:", e));
  };
  return [show, close];
}

type Step = { icon: LucideIcon; title: string; text: string; fields: { key: string; label: string; hint?: string; options?: readonly string[] }[] };

const STEPS: Step[] = [
  {
    icon: Zap,
    title: "Seus custos",
    text: "Com isso a calculadora já inclui energia e mão de obra no preço. Dá para mudar depois em Preferências.",
    fields: [
      { key: "kwhPrice", label: "Preço do kWh (R$)", hint: "Está na conta de luz: valor total ÷ kWh consumidos." },
      { key: "laborHourCost", label: "Sua hora de trabalho (R$)", hint: "Use 0 se não quiser cobrar mão de obra." },
    ],
  },
  {
    icon: Printer,
    title: "Sua impressora",
    text: "A potência média entra no custo de energia de cada impressão.",
    fields: [
      { key: "name", label: "Nome", hint: "Ex.: Bambu Lab A1" },
      { key: "watts", label: "Potência média (W)", hint: "Veja no manual ou numa tomada medidora." },
    ],
  },
  {
    icon: Cylinder,
    title: "Seu primeiro filamento",
    text: "O estoque avisa quando estiver acabando e o preço entra na calculadora.",
    fields: [
      { key: "material", label: "Material", options: MATERIAL_TYPES },
      { key: "color", label: "Cor" },
      { key: "pricePerKg", label: "Preço por kg (R$)" },
      { key: "stockG", label: "Quanto tem em estoque (g)" },
    ],
  },
];

const DEFAULTS: Record<string, string> = { kwhPrice: "0,90", laborHourCost: "0", name: "", watts: "", material: "PLA", color: "", pricePerKg: "", stockG: "1000" };

async function saveStep(step: number, v: Record<string, string>) {
  const db = await getDb();
  const n = (k: string) => parseDecimal(v[k] ?? "");
  if (step === 0) return saveSettings(db, { ...(await loadSettings(db)), kwhPrice: n("kwhPrice"), laborHourCost: n("laborHourCost") });
  if (step === 1) return printers.insert(db, { name: v.name, watts: n("watts") });
  return filaments.insert(db, { material: v.material, color: v.color, brand: "", pricePerKg: n("pricePerKg"), spoolG: 1000, stockG: n("stockG"), minG: 200 });
}

/** Apresentação de primeiro uso em 3 passos; cada passo pode ser pulado. */
export default function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(DEFAULTS);
  const [errors, setErrors] = useState<Record<string, string>>({});
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
          {s.fields.map((f, i) => (
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
          ))}
        </div>
        {errors._ && <p className="error">{errors._}</p>}
      </div>
    </Sheet>
  );
}
