import { useState } from "react";
import type { Params, Preset } from "../fields";

type Props = { presets: Preset[]; params: Params; label?: string; onPick: (p: Preset) => void };

/** O preset está ativo quando todos os campos do patch já valem os mesmos valores. */
export const isActive = (preset: Preset, params: Params) => Object.entries(preset.patch).every(([k, v]) => params[k] === v);

/** "Comece pelo uso": um clique preenche os campos; a frase embaixo explica o preset ativo (ou o que está com foco ou mouse). */
export default function PresetBar({ presets, params, label = "Comece pelo uso", onPick }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = presets.find((p) => p.id === hover) ?? presets.find((p) => isActive(p, params));
  return (
    <section className="preset-bar" aria-label={label}>
      <h3 className="preset-title">{label}</h3>
      <div className="chips" role="group" aria-label={label}>
        {presets.map((p) => (
          <button key={p.id} type="button" aria-pressed={isActive(p, params)} onClick={() => onPick(p)} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p.id)} onBlur={() => setHover(null)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="hint preset-blurb" aria-live="polite">{shown?.blurb ?? ""}</p>
    </section>
  );
}
