import ColorPick from "../ColorPick";
import { useRef } from "react";
import EmojiPicker from "../../ui/EmojiPicker";
import Field from "../../ui/Field";
import FontPicker from "../../ui/FontPicker";
import MoneyField from "../../ui/MoneyField";
import NumField from "../../ui/NumField";
import Segmented from "../../ui/Segmented";
import Toggle from "../../ui/Toggle";
import type { FieldDef, Params, Section } from "./fields";
import PlaceField from "./PlaceField";
import ProfileEditor from "./ProfileEditor";

const MAX_CHIPS = 12; // acima disso a escolha vira uma lista (cidades do mapa estelar)
const MAX_SEGMENTS = 4; // acima disso a escolha vira pílulas (Segmented é para 2–4 opções)

/** Primeiro texto preenchido do modelo: é a prévia no seletor de fonte. */
export const firstText = (sections: Section[], p: Params) =>
  sections.flatMap((s) => s.fields).map((f) => (f.kind === "text" ? String(p[f.k] ?? "").trim() : "")).find(Boolean) ?? "";

type ParamProps = {
  f: FieldDef;
  value: Params[string];
  onChange: (v: string | number | boolean) => void;
  sample?: string;
  emoji?: boolean;
  /** Todos os valores do modelo e um jeito de mudar vários de uma vez (campo "place"). */
  params?: Params;
  patch?: (next: Params) => void;
};

/** Texto com seletor de emoji ao lado (fora do <label>, para o rótulo nomear só o campo). */
function EmojiText({ label, hint, max, value, onChange }: { label: string; hint?: string; max?: number; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="field-with-emoji">
      <Field label={label} hint={hint}>
        <input ref={ref} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <EmojiPicker inputRef={ref} value={value} onChange={onChange} />
    </div>
  );
}

export default function ParamField({ f, value, onChange, sample = "", emoji, params, patch }: ParamProps) {
  switch (f.kind) {
    case "place":
      return params && patch ? <PlaceField label={f.label} params={params} patch={patch} /> : null;
    case "profile":
      return <ProfileEditor label={f.label} value={String(value)} onChange={onChange} min={f.min} max={f.max} />;
    case "font":
      return (
        <div className="span-2">
          <FontPicker label={f.label} value={String(value)} onChange={onChange} sample={sample} />
        </div>
      );
    case "num":
      return <NumField label={f.label} value={value as number} onChange={onChange} min={f.min} max={f.max} step={f.step} unit={f.unit} hint={f.hint} cm={f.cm} />;
    case "text":
      if (emoji) return <EmojiText label={f.label} hint={f.hint} max={f.max} value={String(value)} onChange={onChange} />;
      return (
        <Field label={f.label} hint={f.hint}>
          <input value={String(value)} maxLength={f.max} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "money":
      return <MoneyField label={f.label} value={String(value)} onChange={onChange} hint={f.hint} />;
    case "color":
      return <ColorPick label={f.label} value={String(value)} onChange={onChange} />;
    case "bool":
      return <Toggle label={f.label} checked={Boolean(value)} onChange={onChange} />;
    case "choice":
      return (
        <div className="span-2">
          <span className="field-label">{f.label}</span>
          {f.options.length > MAX_CHIPS ? (
            <select aria-label={f.label} value={String(value)} onChange={(e) => onChange(e.target.value)}>
              {f.options.map(([v, text]) => (
                <option key={v} value={v}>
                  {text}
                </option>
              ))}
            </select>
          ) : f.options.length > MAX_SEGMENTS ? (
            // muitas opções: pílulas que quebram linha (o Segmented é para 2–4)
            <div className="chips" role="group" aria-label={f.label}>
              {f.options.map(([v, text]) => (
                <button key={v} type="button" aria-pressed={String(value) === v} onClick={() => onChange(v)}>
                  {text}
                </button>
              ))}
            </div>
          ) : (
            <Segmented label={f.label} value={String(value)} options={f.options} onChange={onChange} full />
          )}
        </div>
      );
  }
}
