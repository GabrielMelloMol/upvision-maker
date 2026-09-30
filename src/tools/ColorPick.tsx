import { Check } from "lucide-react";
import { filaments as filamentsRepo, loadSettings } from "../db/repo";
import type { Db } from "../db/types";
import { nearestColor } from "../geometry/colorMatch";
import { useData } from "../ui/useData";
import { amsSlots, loadedColors } from "./amsSlots";
import { filamentColors } from "./filamentColors";

type Option = { hex: string; label: string; slot?: number };
type Palette = { loaded: Option[]; options: Option[] };
const EMPTY: Palette = { loaded: [], options: [] };

/** Filamentos do AMS primeiro (com o nº do slot), depois os outros cadastrados, sem repetir a cor (#98). */
export async function loadPalette(db: Db): Promise<Palette> {
  const [settings, list] = await Promise.all([loadSettings(db), filamentsRepo.list(db)]);
  const loaded = loadedColors(amsSlots(settings.ams, list)).map((s) => ({ hex: s.hex, slot: s.slot, label: `Slot ${s.slot} · ${s.label}` }));
  const seen = new Set(loaded.map((o) => o.hex));
  const others = filamentColors(list).filter((f) => !seen.has(f.hex));
  return { loaded, options: [...loaded, ...others] };
}

type Props = { label: string; value: string; onChange: (hex: string) => void };

/** Cor de uma parte: seletor do sistema + os seus filamentos; sugere o mais parecido carregado no AMS (ΔE2000). */
export default function ColorPick({ label, value, onChange }: Props) {
  const [pal] = useData(loadPalette, EMPTY);
  const v = value.toLowerCase();
  const nearHex = pal.loaded.length && !pal.loaded.some((o) => o.hex === v) ? nearestColor(v, pal.loaded.map((o) => o.hex)) : null;
  const near = pal.loaded.find((o) => o.hex === nearHex);
  return (
    <div className="color-pick">
      <label>
        {label}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      {pal.options.length > 0 && (
        <div className="dots" role="radiogroup" aria-label={`${label}: seus filamentos`}>
          {pal.options.map((o) => (
            <button key={o.hex} type="button" role="radio" className="dot" aria-checked={o.hex === v} aria-label={o.label} title={o.label} style={{ "--dot": o.hex } as React.CSSProperties} onClick={() => onChange(o.hex)}>
              {o.hex === v && <Check aria-hidden />}
            </button>
          ))}
        </div>
      )}
      {near && (
        <button type="button" className="link" onClick={() => onChange(near.hex)}>
          Mais parecido no AMS: slot {near.slot}
        </button>
      )}
    </div>
  );
}
