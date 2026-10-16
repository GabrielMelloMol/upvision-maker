import { FileDown } from "lucide-react";
import { useState } from "react";
import { ALL_COUPONS, COUPONS, DEFAULT_INPUTS, type KitInputs, type KitSelection } from "../geometry/testKit/catalog";
import { buildTestKit, type KitPlate } from "../geometry/testKit/kit";
import { getManifold } from "../geometry/manifold";
import { loadPdfFonts } from "../pdf/fonts";
import { testKitPdf } from "../pdf/testKitSheet";
import Alert from "../ui/Alert";
import ExportButtons from "../ui/ExportButtons";
import Segmented from "../ui/Segmented";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import { saveFile } from "../ui/saveFile";
import Toggle from "../ui/Toggle";
import { errorText, useToast } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import FitsCard from "./testkit/FitsCard";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

type State = { inputs: KitInputs; selected: KitSelection };
const initialState: State = { inputs: DEFAULT_INPUTS, selected: ALL_COUPONS };

type Field = { key: keyof KitInputs; label: string; min: number; max: number; coupon: (typeof COUPONS)[number]["id"] };
const FIELDS: Field[] = [
  { key: "cupDiameter", label: "Diâmetro do copo na altura da alça", min: 40, max: 120, coupon: "cup" },
  { key: "boardL", label: "Comprimento da placa", min: 10, max: 150, coupon: "board" },
  { key: "boardW", label: "Largura da placa", min: 10, max: 150, coupon: "board" },
  { key: "phoneW", label: "Largura do celular", min: 40, max: 110, coupon: "phone" },
  { key: "phoneT", label: "Espessura do celular", min: 4, max: 20, coupon: "phone" },
  { key: "phoneR", label: "Raio do canto do celular", min: 2, max: 25, coupon: "phone" },
  { key: "candyD", label: "Diâmetro do êmbolo do docinho", min: 10, max: 60, coupon: "candy" },
];

/**
 * Kit de testes físicos (#247): um arquivo com as peças pequenas de conferência de tudo que depende de medida ou folga sem teste real,
 * a folha em PDF do que conferir em cada uma e o lugar de lançar o número escolhido (a folga que vira o padrão das ferramentas).
 */
export default function TestKit() {
  const tool = useToolState("testkit", initialState, { label: "Kit de testes" });
  const { inputs, selected } = tool.state;
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [plate, setPlate] = useState(0);
  const valid = FIELDS.every((f) => !selected[f.coupon] || inRange(inputs[f.key], f.min, f.max));
  const chosen = COUPONS.filter((c) => selected[c.id]);

  const { models, view, warnings, busy, error } = useModelBuilder<{ plates: KitPlate[] }>(async () => {
    if (!valid || !chosen.length) return null;
    const M = await getManifold();
    const r = buildTestKit(M, { M, art: null, artLayers: null, text: () => null }, { inputs, selected });
    return { models: r.models, warnings: r.warnings, view: { plates: r.plates } };
  }, [JSON.stringify({ inputs, selected }), valid]);
  const plates = view?.plates ?? [];
  const current = plates[Math.min(plate, plates.length - 1)];
  const shown = current ? current.models : models;

  async function savePdf() {
    setSaving(true);
    try {
      const summary = plates.map((p) => ({ title: p.title, names: p.models.map((m) => m.name) }));
      const { bytes } = await testKitPdf(await loadPdfFonts(), selected, inputs, new Date().toISOString().slice(0, 10), summary);
      const p = await saveFile("kit-de-testes-folha-de-conferencia.pdf", bytes, "pdf", "PDF");
      if (p) toast(`Folha de conferência salva em ${p}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  const setInput = (key: keyof KitInputs) => (v: number) => tool.set((s) => ({ ...s, inputs: { ...s.inputs, [key]: v } }), `in:${key}`);
  const setPick = (id: string) => (v: boolean) => tool.set((s) => ({ ...s, selected: { ...s.selected, [id]: v } }), `pick:${id}`);

  return (
    <div className="page">
      <h1>Kit de testes</h1>
      <p className="lead">Imprima uma vez e valide as folgas de tudo.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Peças do kit</h3>
            <span className="hint">Cada peça tem o número em relevo. Desmarque o que você não vai usar.</span>
            {COUPONS.map((c) => (
              <Toggle key={c.id} label={`${c.title} · ${c.tool}`} checked={selected[c.id]} onChange={setPick(c.id)} />
            ))}
          </div>
          <div className="card stack">
            <h3>Medidas do seu caso</h3>
            <span className="hint">Meça com paquímetro. Os padrões servem para ver o kit; mude para as suas medidas antes de imprimir.</span>
            <div className="grid two">
              {FIELDS.filter((f) => selected[f.coupon]).map((f) => (
                <NumField key={f.key} label={f.label} value={inputs[f.key]} onChange={setInput(f.key)} min={f.min} max={f.max} step={0.5} />
              ))}
            </div>
          </div>
          <div className="card stack">
            <h3>Imprimir e conferir</h3>
            <button type="button" className="action" disabled={!chosen.length || saving} onClick={savePdf}>
              <FileDown aria-hidden /> Salvar a folha de conferência (PDF)
            </button>
            {plates.length > 0 && (
              <>
                <Segmented label="Mesa do kit" value={String(Math.min(plate, plates.length - 1))} options={plates.map((_, i): [string, string] => [String(i), `Mesa ${i + 1}`])} onChange={(v) => setPlate(Number(v))} full />
                <span className="hint">
                  {current?.title} · {current?.models.length} peças. Cada mesa cabe na impressora e tem um só filamento.
                </span>
              </>
            )}
            <ExportButtons models={shown} name={`kit-de-testes-mesa-${Math.min(plate, Math.max(plates.length - 1, 0)) + 1}`} busy={busy} />
          </div>
          <FitsCard />
        </div>
        <div className="preview-col">
          <Preview3D models={shown} quietBusy busy={busy} busyText="Montando o kit…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Marque ao menos uma peça."} views />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
