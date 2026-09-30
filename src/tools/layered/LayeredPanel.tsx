import { useMemo } from "react";
import { DEFAULT_LAYERED, type LayeredParams } from "../../geometry/layeredPicture";
import type { LayeredHang, LayeredShape } from "../../geometry/layeredShape";
import NumField from "../../ui/NumField";
import Segmented from "../../ui/Segmented";
import Toggle from "../../ui/Toggle";
import type { FilamentColor } from "../filamentColors";
import { toDataUrl } from "../rasterUrl";
import { bandPreview, byLight, presetPalettes } from "./palettes";

export type LayeredSubject = "none" | "person" | "pet";
/** Estado do quadro na tela: os parâmetros da geometria + o que a Silhueta recorta. */
export type LayeredUi = LayeredParams & { subject?: LayeredSubject };
export const DEFAULT_LAYERED_UI: LayeredUi = { ...DEFAULT_LAYERED, colors: [], shape: "rect", hang: "none", magnet: false, magnetD: 10, magnetH: 2, subject: "none", background: null };
export type Thumb = { luma: Float32Array; w: number; h: number };

const SHAPES: [LayeredShape, string][] = [
  ["rect", "Retângulo"],
  ["rounded", "Cantos redondos"],
  ["circle", "Círculo"],
  ["heart", "Coração"],
  ["subject", "Contorno do sujeito"],
];
const HANGS: [LayeredHang, string][] = [
  ["none", "Nenhum"],
  ["pendant", "Pingente"],
  ["bookmark", "Marca-página"],
];
const SUBJECTS: [LayeredSubject, string][] = [
  ["none", "Não separar"],
  ["person", "Pessoa"],
  ["pet", "Bicho"],
];
const MAX_COLORS = 4;

type Props = {
  layered: LayeredUi;
  setLayered: (fn: (o: LayeredUi) => LayeredUi) => void;
  filColors: FilamentColor[];
  /** Cores em uso (as escolhidas ou o padrão). */
  colors: string[];
  nameOf: (hex: string) => string;
  thumb: Thumb | null;
};

/** Quadro por camadas (#13, #100): filamentos e paletas prontas, alturas, formato, pendurar, ímã e sujeito × fundo. */
export default function LayeredPanel({ layered, setLayered, filColors, colors, nameOf, thumb }: Props) {
  const setQ = <K extends keyof LayeredUi>(k: K) => (v: LayeredUi[K]) => setLayered((o) => ({ ...o, [k]: v }));
  const toggleColor = (hex: string) =>
    setLayered((o) => ({ ...o, colors: o.colors.includes(hex) ? o.colors.filter((c) => c !== hex) : o.colors.length < MAX_COLORS ? [...o.colors, hex] : o.colors }));
  const presets = useMemo(() => presetPalettes(filColors.map((f) => f.hex)), [filColors]);
  const thumbs = useMemo(() => (thumb ? presets.map((p) => toDataUrl(bandPreview(thumb.luma, p.colors), thumb.w, thumb.h)) : []), [presets, thumb]);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((c) => b.includes(c));
  const subject = layered.subject ?? "none";
  const shape = layered.shape ?? "rect";
  const sorted = byLight(colors); // o índice do fundo é o da faixa, do escuro ao claro

  return (
    <>
      <div className="card stack">
        <h3>Quadro por camadas</h3>
        {presets.length > 0 && (
          <>
            <span className="field-label">Paletas prontas</span>
            <div className="layered-presets" role="group" aria-label="Paletas prontas">
              {presets.map((p, i) => (
                <button key={p.id} type="button" className="layered-preset" aria-pressed={same(layered.colors, p.colors)} onClick={() => setQ("colors")(p.colors)}>
                  {thumbs[i] ? <img src={thumbs[i]!} alt="" /> : <span className="layered-strip">{p.colors.map((c) => <i key={c} style={{ background: c }} />)}</span>}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <span className="field-label">Filamentos (2 a 4, do escuro ao claro)</span>
        {filColors.length ? (
          <div className="stack">
            {filColors.map((f) => (
              <label key={f.hex} className="check">
                <input type="checkbox" checked={layered.colors.includes(f.hex)} onChange={() => toggleColor(f.hex)} />{" "}
                <span className="swatch-inline">
                  <i style={{ background: f.hex }} />
                </span>{" "}
                {f.label}
                {f.td ? <span className="muted"> · TD {String(f.td).replace(".", ",")}</span> : null}
              </label>
            ))}
          </div>
        ) : (
          <span className="hint">Cadastre filamentos com cor para escolher; por enquanto: preto, cinza e branco.</span>
        )}
        {layered.colors.length === 1 && <span className="hint">Escolha mais um: com 1 filamento usa preto, cinza e branco.</span>}
        <span className="hint">Com o TD cadastrado em Filamentos, as faixas ficam proporcionais a ele (mais transparente = faixa mais alta).</span>
        <div className="grid two">
          <NumField label="Base" value={layered.base} onChange={setQ("base")} min={0.2} max={3} hint="Fundo na 1ª cor." />
          <NumField label="Relevo" value={layered.relief} onChange={setQ("relief")} min={0.4} max={6} />
          <NumField label="Altura de camada" value={layered.layerHeight} onChange={setQ("layerHeight")} min={0.04} max={0.32} step={0.02} hint="A mesma do fatiador, inclusive na 1ª camada." />
        </div>
        <Toggle label="Uma parte por cor (AMS / multimaterial)" checked={layered.split} onChange={setQ("split")} />
        <span className="hint">{layered.split ? "O fatiador troca de filamento sozinho em cada faixa; sem pausas, o 3MF abre direto no Bambu Studio, Orca ou Prusa." : "Sem AMS: a impressora pausa em cada troca para você trocar o filamento."}</span>
      </div>
      <div className="card stack">
        <h3>Formato</h3>
        <div className="chips" role="group" aria-label="Formato">
          {SHAPES.map(([v, text]) => (
            <button key={v} type="button" aria-pressed={shape === v} onClick={() => setQ("shape")(v)}>
              {text}
            </button>
          ))}
        </div>
        {shape === "subject" && subject === "none" && <span className="hint">Escolha abaixo o que separar (pessoa ou bicho) para recortar no contorno.</span>}
        <Segmented label="Furo para pendurar" value={layered.hang ?? "none"} options={HANGS} onChange={setQ("hang")} full />
        <Toggle label="Encaixe de ímã (pausa para colocar)" checked={!!layered.magnet} onChange={setQ("magnet")} />
        {layered.magnet && (
          <div className="grid two">
            <NumField label="Ímã: diâmetro" value={layered.magnetD ?? 10} onChange={setQ("magnetD")} min={4} max={30} step={0.5} />
            <NumField label="Ímã: altura" value={layered.magnetH ?? 2} onChange={setQ("magnetH")} min={1} max={5} step={0.5} />
          </div>
        )}
      </div>
      <div className="card stack">
        <h3>Sujeito e fundo</h3>
        <Segmented label="Separar o sujeito (Silhueta, no computador)" value={subject} options={SUBJECTS} onChange={setQ("subject")} full />
        {subject !== "none" && (
          <label>
            Fundo
            <select value={layered.background == null ? "" : String(layered.background)} onChange={(e) => setQ("background")(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">Com relevo, como o sujeito</option>
              {sorted.map((hex, i) => (
                <option key={hex} value={i}>
                  Liso em {nameOf(hex)}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="hint">O recorte roda no seu computador (a primeira vez baixa o modelo, uns 12 MB).</span>
      </div>
    </>
  );
}
