import { Download } from "lucide-react";
import { useState } from "react";
import { bambuProject } from "../geometry/bambuProject";
import { printPlan, type PrintMode } from "../geometry/printPlan";
import { profileSummary, type PrintProfile } from "../geometry/printProfile";
import { writeStl } from "../geometry/stl";
import { write3mf } from "../geometry/threemf";
import type { Model } from "../geometry/types";
import Alert from "./Alert";
import NumField, { inRange } from "./NumField";
import { saveFile, slug } from "./saveFile";
import Segmented from "./Segmented";
import { errorText, useToast } from "./Toast";

const MODES: [PrintMode, string][] = [
  ["ams", "Multicor (AMS)"],
  ["manual", "Trocando o filamento"],
  ["single", "1 cor"],
];

type Props = {
  models: Model[];
  name: string;
  busy?: boolean;
  pauses?: number[];
  /** Mostra "Como vai imprimir" (1 cor / troca manual / AMS). Desligue onde a ferramenta já cuida disso. */
  printModes?: boolean;
  /** Configuração de impressão recomendada: vai no 3MF (Bambu/Orca) e aparece na tela. */
  profile?: PrintProfile;
};

/** Botões padrão de exportação: 3MF com cores (principal) e STL por objeto, ajustados ao jeito de imprimir. */
export default function ExportButtons({ models: input, name, busy, pauses: inputPauses, printModes = true, profile }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<PrintMode>("ams");
  const [layer, setLayer] = useState(profile?.layerHeight ?? 0.2);
  const colorCount = new Set(input.flatMap((m) => m.parts.map((p) => p.color.toLowerCase()))).size;
  const showModes = printModes && colorCount > 1;
  const plan = printPlan(input, showModes ? mode : "ams", inRange(layer, 0.04, 0.4) ? layer : 0.2, inputPauses ?? []);
  const models = plan.models;
  const pauses = plan.pauses;
  const disabled = busy || models.length === 0 || !!plan.error || (showModes && mode === "manual" && !inRange(layer, 0.04, 0.4));

  const hasPauses = pauses.length > 0;

  async function save(file: string, data: Uint8Array | (() => Promise<Uint8Array>), ext: string, label: string) {
    try {
      const p = await saveFile(file, typeof data === "function" ? await data() : data, ext, label);
      if (p) toast(`Arquivo salvo em ${p}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="card stack">
      {showModes && (
        <>
          <span className="field-label">Como vai imprimir</span>
          <Segmented label="Como vai imprimir" value={mode} options={MODES} onChange={setMode} full />
          {mode === "manual" && (
            <>
              <NumField label="Altura de camada" value={layer} onChange={setLayer} min={0.04} max={0.4} step={0.02} hint="A mesma do fatiador (e na 1ª camada)." />
              {plan.error ? (
                <Alert kind="warn">{plan.error}</Alert>
              ) : (
                <ol className="hint">
                  {plan.swaps.map((s) => (
                    <li key={s.z}>
                      Z = {s.z.toFixed(2).replace(".", ",")} mm: a impressora pausa, troque para{" "}
                      <span className="swatch-inline">
                        <i style={{ background: s.color }} />
                        {s.color}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {mode === "single" && <span className="hint">Sai tudo num filamento só (as partes continuam separadas no arquivo).</span>}
        </>
      )}
      <button className="action" disabled={disabled} onClick={() => save(`${slug(name)}.3mf`, write3mf(models, { pauses, profile }), "3mf", "3MF")}>
        <Download aria-hidden /> Salvar 3MF {hasPauses ? "(Orca / Prusa)" : "(Bambu / Orca / Prusa)"}
      </button>
      {hasPauses && (
        <button disabled={disabled} onClick={() => save(`${slug(name)}-bambu.3mf`, () => bambuProject(models, pauses!, profile), "3mf", "Projeto do Bambu Studio")}>
          <Download aria-hidden /> Projeto do Bambu Studio (pausa pronta)
        </button>
      )}
      {models.length === 1 ? (
        <button disabled={disabled} onClick={() => save(`${slug(name)}.stl`, writeStl(models), "stl", "STL")}>
          <Download aria-hidden /> Salvar STL
        </button>
      ) : (
        <div className="grid two">
          {models.map((m) => (
            <button key={m.name} disabled={disabled} onClick={() => save(`${slug(`${name}-${m.name}`)}.stl`, writeStl([m]), "stl", "STL")}>
              <Download aria-hidden /> STL {m.name.toLowerCase()}
            </button>
          ))}
        </div>
      )}
      {profile && (
        <div className="stack" aria-label="Configuração recomendada">
          <span className="hint">
            <strong>Imprima com:</strong> {profileSummary(profile)}. Já vai no 3MF para o Bambu Studio e o OrcaSlicer.
          </span>
          {profile.notes?.map((n) => (
            <span key={n} className="hint">
              {n}
            </span>
          ))}
        </div>
      )}
      <span className="hint">
        {hasPauses
          ? "A pausa já vem no 3MF para OrcaSlicer e PrusaSlicer. Para o Bambu Studio, salve o projeto: o app usa o Bambu Studio instalado e a impressora selecionada nele."
          : "O 3MF já separa as cores em partes: no fatiador é só escolher o filamento de cada uma."}
      </span>
    </div>
  );
}
