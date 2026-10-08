import { COLOR_NAMES, COLOR_ROLES, DEFAULT_COLOR_LITHO, type ColorLithoParams, type InkRole } from "../geometry/lithophaneColor";
import NumField from "../ui/NumField";
import type { FilamentColor } from "./filamentColors";

type Props = { color: ColorLithoParams; setColor: (fn: (o: ColorLithoParams) => ColorLithoParams) => void; filColors: FilamentColor[] };

const HINTS: Record<InkRole, string> = {
  white: "Fica atrás de tudo e espalha a luz.",
  cyan: "Tinta de ciano (azul-esverdeado).",
  magenta: "Tinta de magenta (rosa forte).",
  yellow: "Tinta de amarelo.",
  black: "Escurece; usa a metade da espessura das outras.",
};

/** Litofania colorida (#102): um filamento para cada tinta, com a cor e o TD (mm) de cada um. */
export default function ColorLithoPanel({ color, setColor, filColors }: Props) {
  const pick = (role: InkRole, hex: string) => {
    const f = filColors.find((x) => x.hex === hex);
    const def = DEFAULT_COLOR_LITHO.inks[role];
    setColor((o) => ({ ...o, inks: { ...o.inks, [role]: f ? { hex: f.hex, td: f.td ?? def.td, known: f.td != null } : { ...def } } }));
  };
  const setTd = (role: InkRole, td: number) => setColor((o) => ({ ...o, inks: { ...o.inks, [role]: { ...o.inks[role], td, known: true } } }));
  return (
    <div className="card stack">
      <h3>Filamentos</h3>
      <span className="hint">Escolha um filamento para cada tinta. O TD (distância de transmissão, em mm) diz o quanto a luz atravessa: com ele certo, as cores saem fiéis.</span>
      {COLOR_ROLES.map((role) => {
        const ink = color.inks[role];
        const choice = filColors.some((f) => f.hex === ink.hex) ? ink.hex : "";
        return (
          <div className="grid two" key={role}>
            <label>
              {COLOR_NAMES[role]}
              <select aria-label={`Filamento ${COLOR_NAMES[role].toLowerCase()}`} value={choice} onChange={(e) => pick(role, e.target.value)}>
                <option value="">Cor padrão</option>
                {filColors.map((f) => (
                  <option key={f.hex} value={f.hex}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {role === "white" ? <span className="hint">{HINTS.white}</span> : <NumField label={`TD ${COLOR_NAMES[role].toLowerCase()}`} value={ink.td} onChange={(td) => setTd(role, td)} min={0.1} max={20} step={0.1} hint={HINTS[role]} />}
          </div>
        );
      })}
    </div>
  );
}
