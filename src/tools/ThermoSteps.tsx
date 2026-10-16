import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import Segmented from "../ui/Segmented";
import { errorText, useToast } from "../ui/Toast";
import { HEAT_MODES, STEP_SOURCES, STEPS_NOTE, thermoSteps, type HeatMode, type StepKind } from "./heatSteps";

type Props = { kind: StepKind; closure?: "clip" | "ring" | "cap" | "none"; bases?: boolean };

/** Passo a passo da termoformagem na tela, com o jeito de aquecer escolhido (soprador ou água quente) e as fontes dos números. */
export default function ThermoSteps({ kind, closure, bases }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<HeatMode>("air");
  const open = (url: string) => void openUrl(url).catch((e) => toast(errorText(e), "error"));
  return (
    <section className="card stack" aria-label="Passo a passo da termoformagem">
      <h3>Passo a passo da termoformagem</h3>
      <Segmented label="Como aquecer" value={mode} options={HEAT_MODES} onChange={setMode} full />
      <ol>
        {thermoSteps(kind, mode, { closure, bases }).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <span className="hint">{STEPS_NOTE}</span>
      <details className="advanced">
        <summary>De onde vêm os números</summary>
        <ul className="plain">
          {STEP_SOURCES.map((s) => (
            <li key={s.url}>
              <button type="button" className="link" onClick={() => open(s.url)}>{s.label}</button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
