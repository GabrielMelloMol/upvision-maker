import { Cylinder } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { filaments } from "../../db/repo";
import { MATERIAL_TYPES } from "../../domain/entities";
import ColorDots from "../../ui/ColorDots";
import Alert from "../../ui/Alert";
import Field from "../../ui/Field";
import { fieldErrors } from "../../ui/fieldErrors";
import MassField from "../../ui/MassField";
import MoneyField from "../../ui/MoneyField";
import { parseMass, parseMoney } from "../../ui/parse";
import Sheet from "../../ui/Sheet";

const SPOOL_G = 1000;
const MIN_G = 200;

type Props = { draft: { material: string; color: string }; onSaved: (id: number) => void; onClose: () => void };

/** Cadastro rápido de um filamento que veio no arquivo do fatiador: material e cor já preenchidos, falta o preço. */
export default function NewFilamentSheet({ draft, onSaved, onClose }: Props) {
  const [v, setV] = useState({ material: draft.material, color: draft.color, brand: "", pricePerKg: "", stockG: "1 rolo" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const id = await filaments.insert(await getDb(), {
        material: v.material,
        color: v.color,
        brand: v.brand,
        pricePerKg: parseMoney(v.pricePerKg),
        spoolG: SPOOL_G,
        stockG: parseMass(v.stockG, SPOOL_G),
        minG: MIN_G,
      });
      onSaved(id);
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  }

  return (
    <Sheet
      title="Cadastrar este filamento"
      icon={Cylinder}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            Cadastrar e usar
          </button>
        </>
      }
    >
      <p className="muted">Material e cor vieram do arquivo. Só falta o preço.</p>
      {errors._ && <Alert kind="error">{errors._}</Alert>}
      <div className="grid two">
        <Field label="Material" error={errors.material}>
          <select value={v.material} onChange={(e) => set("material")(e.target.value)}>
            {MATERIAL_TYPES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Marca" error={errors.brand}>
          <input value={v.brand} onChange={(e) => set("brand")(e.target.value)} placeholder="Ex.: Voolt, 3D Fila, Bambu" />
        </Field>
        <div className="span-all">
          <ColorDots label="Cor" value={v.color} onChange={set("color")} error={errors.color} />
        </div>
        <MoneyField label="Preço por kg" value={v.pricePerKg} onChange={set("pricePerKg")} error={errors.pricePerKg} data-autofocus />
        <MassField label="Quanto tem em estoque" value={v.stockG} onChange={set("stockG")} spoolG={SPOOL_G} error={errors.stockG} />
      </div>
    </Sheet>
  );
}
