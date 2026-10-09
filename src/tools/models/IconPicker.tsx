import { ArrowBigUp, ArrowDown, ArrowLeft, ArrowRight, ArrowRightToLine, ArrowUp, Camera, Command, CornerDownLeft, Delete, Heart, House, Lock, Mail, Mic, Moon, Music, Pause, Play, Power, Search, Settings, Star, Sun, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { createElement, useState } from "react";
import { errorText } from "../../ui/Toast";

/** Ícones de tecla e de uso comum (Lucide, traço fino) que viram o desenho do modelo. */
export const KEY_ICONS: { name: string; label: string; icon: LucideIcon }[] = [
  { name: "arrow-up", label: "Seta para cima", icon: ArrowUp },
  { name: "arrow-down", label: "Seta para baixo", icon: ArrowDown },
  { name: "arrow-left", label: "Seta para a esquerda", icon: ArrowLeft },
  { name: "arrow-right", label: "Seta para a direita", icon: ArrowRight },
  { name: "shift", label: "Shift", icon: ArrowBigUp },
  { name: "enter", label: "Enter", icon: CornerDownLeft },
  { name: "backspace", label: "Apagar", icon: Delete },
  { name: "tab", label: "Tab", icon: ArrowRightToLine },
  { name: "command", label: "Command", icon: Command },
  { name: "power", label: "Ligar", icon: Power },
  { name: "play", label: "Tocar", icon: Play },
  { name: "pause", label: "Pausar", icon: Pause },
  { name: "volume", label: "Volume", icon: Volume2 },
  { name: "mute", label: "Mudo", icon: VolumeX },
  { name: "mic", label: "Microfone", icon: Mic },
  { name: "camera", label: "Câmera", icon: Camera },
  { name: "home", label: "Início", icon: House },
  { name: "search", label: "Buscar", icon: Search },
  { name: "settings", label: "Ajustes", icon: Settings },
  { name: "mail", label: "E-mail", icon: Mail },
  { name: "lock", label: "Trava", icon: Lock },
  { name: "music", label: "Música", icon: Music },
  { name: "sun", label: "Brilho", icon: Sun },
  { name: "moon", label: "Lua", icon: Moon },
  { name: "heart", label: "Coração", icon: Heart },
  { name: "star", label: "Estrela", icon: Star },
];

const STROKE = 2.6; // traço firme: aguenta o bico de 0,4 depois de reduzido para a legenda

/** SVG do ícone Lucide (traço preto, sem `currentColor`) para entrar como desenho do modelo. */
export async function iconSvg(icon: LucideIcon): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(createElement(icon, { size: 24, color: "#000000", strokeWidth: STROKE }));
}

type Props = { onPick: (art: { svg: string; name: string }) => void };

/** Grade de ícones: um toque troca o desenho do modelo (o mesmo que enviar um SVG). */
export default function IconPicker({ onPick }: Props) {
  const [error, setError] = useState<string | null>(null);
  async function pick(i: (typeof KEY_ICONS)[number]) {
    setError(null);
    try {
      onPick({ svg: await iconSvg(i.icon), name: i.label });
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <div className="stack">
      <span className="field-label">Ou escolha um ícone</span>
      <div className="row wrap" role="group" aria-label="Ícones">
        {KEY_ICONS.map((i) => (
          <button key={i.name} type="button" className="ghost icon-only" aria-label={`Ícone ${i.label}`} title={i.label} onClick={() => void pick(i)}>
            {createElement(i.icon, { size: 18, "aria-hidden": true })}
          </button>
        ))}
      </div>
      {error && <span className="hint" role="alert">{error}</span>}
    </div>
  );
}
