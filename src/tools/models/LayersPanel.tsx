import ColorPick from "../ColorPick";
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Eye, EyeOff, ImagePlus, Redo2, Trash2, Type, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import Alert from "../../ui/Alert";
import Field from "../../ui/Field";
import FontPicker from "../../ui/FontPicker";
import NumField from "../../ui/NumField";
import Segmented from "../../ui/Segmented";
import Toggle from "../../ui/Toggle";
import { errorText } from "../../ui/Toast";
import { DESIGN_ACCEPT, fileToSvg } from "../designInput";
import { layerName, type Layer } from "./layers";
import { redoHint, undoHint } from "../../ui/shortcuts";

export const LAYER_LIMITS = { width: [2, 300], rotation: [-180, 180], depth: [0.2, 10] } as const;
const MODES = [
  ["raised", "Relevo"],
  ["engraved", "Gravado"],
  ["cut", "Vazado"],
] as const;

/** Números da camada dentro da faixa (senão a geração ignora a camada até corrigir). */
export const layerValid = (l: Layer) =>
  Number.isFinite(l.x) &&
  Number.isFinite(l.y) &&
  l.width >= LAYER_LIMITS.width[0] &&
  l.width <= LAYER_LIMITS.width[1] &&
  l.rotation >= LAYER_LIMITS.rotation[0] &&
  l.rotation <= LAYER_LIMITS.rotation[1] &&
  l.depth >= LAYER_LIMITS.depth[0] &&
  l.depth <= LAYER_LIMITS.depth[1];

type Props = {
  layers: Layer[];
  selected: string | null;
  byLayer: Record<string, string[]>;
  onSelect: (id: string | null) => void;
  onAddArt: (svg: string, name: string) => void;
  onAddText: () => void;
  onChange: (id: string, patch: Partial<Layer>) => void;
  onMove: (id: string, dir: 1 | -1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
  /** Lote ligado: as camadas não entram (cada cópia é um modelo inteiro). */
  disabled?: string;
};

/** Camadas livres do modelo (#26): adicionar desenho/texto, ordem, visibilidade, duplicar, excluir e os ajustes da escolhida. */
export default function LayersPanel(props: Props) {
  const { layers, selected, byLayer, onSelect, onChange, history } = props;
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sel = layers.find((l) => l.id === selected);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    setLoading(true);
    try {
      props.onAddArt(await fileToSvg(f), f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card stack layers-panel" aria-label="Camadas livres">
      <div className="row layers-head">
        <h3>Desenhos e textos livres</h3>
        <button type="button" className="ghost icon-only" aria-label="Desfazer" title={`Desfazer (${undoHint()})`} disabled={!history.canUndo} onClick={history.undo}>
          <Undo2 aria-hidden />
        </button>
        <button type="button" className="ghost icon-only" aria-label="Refazer" title={`Refazer (${redoHint()})`} disabled={!history.canRedo} onClick={history.redo}>
          <Redo2 aria-hidden />
        </button>
      </div>
      {props.disabled ? (
        <p className="hint">{props.disabled}</p>
      ) : (
        <p className="hint">Coloque seu SVG, uma imagem (vira vetor) ou um texto em cima da peça e arraste na vista de cima.</p>
      )}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button type="button" className="sm" disabled={loading || !!props.disabled} onClick={() => file.current?.click()}>
          <ImagePlus aria-hidden size={16} /> {loading ? "Vetorizando…" : "Adicionar desenho"}
        </button>
        <button type="button" className="sm" disabled={!!props.disabled} onClick={props.onAddText}>
          <Type aria-hidden size={16} /> Adicionar texto
        </button>
        <input ref={file} type="file" accept={DESIGN_ACCEPT} hidden aria-label="Arquivo do desenho" onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {layers.length > 0 && (
        <ul className="layer-list" aria-label="Camadas">
          {[...layers].reverse().map((l) => {
            const i = layers.indexOf(l);
            const name = layerName(l);
            return (
              <li key={l.id} data-selected={l.id === selected || undefined} data-hidden={l.visible === false || undefined}>
                <button type="button" className="layer-name" aria-pressed={l.id === selected} onClick={() => onSelect(l.id === selected ? null : l.id)}>
                  <i style={{ background: l.color }} aria-hidden />
                  <span>{name}</span>
                  {byLayer[l.id]?.length ? <AlertTriangle aria-label="Tem aviso" size={14} className="warn-icon" /> : null}
                </button>
                <button type="button" className="ghost icon-only" aria-label={l.visible === false ? `Mostrar ${name}` : `Esconder ${name}`} onClick={() => onChange(l.id, { visible: l.visible === false })}>
                  {l.visible === false ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
                </button>
                <button type="button" className="ghost icon-only" aria-label={`Subir ${name}`} disabled={i === layers.length - 1} onClick={() => props.onMove(l.id, 1)}>
                  <ChevronUp aria-hidden size={16} />
                </button>
                <button type="button" className="ghost icon-only" aria-label={`Descer ${name}`} disabled={i === 0} onClick={() => props.onMove(l.id, -1)}>
                  <ChevronDown aria-hidden size={16} />
                </button>
                <button type="button" className="ghost icon-only" aria-label={`Duplicar ${name}`} onClick={() => props.onDuplicate(l.id)}>
                  <Copy aria-hidden size={16} />
                </button>
                <button type="button" className="ghost icon-only danger" aria-label={`Excluir ${name}`} onClick={() => props.onRemove(l.id)}>
                  <Trash2 aria-hidden size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {sel && <LayerEditor l={sel} warnings={byLayer[sel.id] ?? []} onChange={(patch) => onChange(sel.id, patch)} />}
    </section>
  );
}

function LayerEditor({ l, warnings, onChange }: { l: Layer; warnings: string[]; onChange: (p: Partial<Layer>) => void }) {
  return (
    <div className="stack layer-editor" aria-label={`Ajustes de ${layerName(l)}`}>
      {warnings.map((w) => (
        <Alert key={w} kind="warn">
          {w}
        </Alert>
      ))}
      {l.kind === "text" && (
        <>
          <Field label="Texto">
            <input value={l.text ?? ""} maxLength={60} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <FontPicker value={l.font ?? "hanken"} onChange={(font) => onChange({ font })} sample={l.text ?? ""} />
        </>
      )}
      <div className="grid two">
        <NumField label="X" value={l.x} onChange={(x) => onChange({ x })} step={0.5} />
        <NumField label="Y" value={l.y} onChange={(y) => onChange({ y })} step={0.5} />
        <NumField label="Largura" value={l.width} onChange={(width) => onChange({ width })} min={LAYER_LIMITS.width[0]} max={LAYER_LIMITS.width[1]} step={0.5} />
        <NumField label="Giro" unit="°" value={l.rotation} onChange={(rotation) => onChange({ rotation })} min={LAYER_LIMITS.rotation[0]} max={LAYER_LIMITS.rotation[1]} step={1} />
      </div>
      <div className="span-2">
        <span className="field-label">Aplicação</span>
        <Segmented label="Aplicação" value={l.mode} options={MODES} onChange={(mode) => onChange({ mode })} full />
      </div>
      <div className="grid two">
        {l.mode !== "cut" && <NumField label={l.mode === "raised" ? "Altura do relevo" : "Profundidade"} value={l.depth} onChange={(depth) => onChange({ depth })} min={LAYER_LIMITS.depth[0]} max={LAYER_LIMITS.depth[1]} />}
        {l.mode === "raised" && (
          <ColorPick label="Cor" value={l.color} onChange={(color) => onChange({ color })} />
        )}
      </div>
      <Toggle label="Espelhar" checked={l.mirror} onChange={(mirror) => onChange({ mirror })} />
    </div>
  );
}
