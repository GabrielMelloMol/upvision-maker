import { Check, Plus } from "lucide-react";
import { useId } from "react";

/** Cores de filamento mais comuns (nome gravado no cadastro → hex para a bolinha). */
export const FILAMENT_COLORS: readonly (readonly [string, string])[] = [
  ["Preto", "#1c1c1e"],
  ["Branco", "#f8f8f6"],
  ["Cinza", "#8e8e93"],
  ["Prata", "#c7c7cc"],
  ["Vermelho", "#d6262e"],
  ["Laranja", "#f97316"],
  ["Amarelo", "#facc15"],
  ["Verde", "#22a04b"],
  ["Azul", "#2563eb"],
  ["Azul-claro", "#7cc4f5"],
  ["Roxo", "#7e3fd6"],
  ["Rosa", "#f472b6"],
  ["Marrom", "#7b4a2a"],
  ["Bege", "#e6d3b3"],
  ["Dourado", "#c9a227"],
  ["Transparente", "transparent"],
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Hex para mostrar uma cor gravada como nome ("Azul") ou hex ("#12ab34"). */
export function colorSwatch(value: string): string | null {
  const known = FILAMENT_COLORS.find(([n]) => n.toLowerCase() === value.trim().toLowerCase());
  return known ? known[1] : HEX.test(value.trim()) ? value.trim() : null;
}

type Props = { label: string; value: string; onChange: (v: string) => void; error?: string };

/** Bolinhas de cor com as cores comuns + "Outra" (seletor do sistema, grava o hex). */
export default function ColorDots({ label, value, onChange, error }: Props) {
  const id = useId();
  const custom = !!value && !FILAMENT_COLORS.some(([n]) => n.toLowerCase() === value.toLowerCase());
  const customHex = custom && HEX.test(value) ? value : "#2563eb";
  return (
    <div className="color-field" role="radiogroup" aria-labelledby={id}>
      <span id={id} className="field-label">
        {label}
        {value && <b>{custom && !HEX.test(value) ? value : custom ? "Personalizada" : value}</b>}
      </span>
      <div className="dots">
        {FILAMENT_COLORS.map(([name, hex]) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === name.toLowerCase()}
            aria-label={name}
            title={name}
            className={`dot ${hex === "transparent" ? "clear" : ""}`}
            style={{ "--dot": hex } as React.CSSProperties}
            onClick={() => onChange(name)}
          >
            {value.toLowerCase() === name.toLowerCase() && <Check aria-hidden />}
          </button>
        ))}
        <label className={`dot other ${custom ? "on" : ""}`} title="Outra cor" style={{ "--dot": custom ? customHex : undefined } as React.CSSProperties}>
          {custom ? <Check aria-hidden /> : <Plus aria-hidden />}
          <input type="color" aria-label="Outra cor" value={customHex} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
